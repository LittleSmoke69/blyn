// Scanner de notas de custo (Financeiro): recebe a foto ou o PDF de uma nota
// fiscal / cupom / recibo e devolve os dados extraídos pela IA. NÃO grava nada:
// o app mostra o resultado para o usuário conferir e só então cria o
// lançamento em financial_records (pela RLS normal, com a identidade dele).
//
// Barreiras, nesta ordem: login, permissão financial.manage, assinatura
// válida, funcionalidade ligada no painel admin, chave configurada e limite
// mensal de leituras por conta.
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.133.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { aiClient, describeAiError, loadAiSettings, logUsage, monthlyUsage } from "../_shared/ai.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseAdmin.ts";

const FEATURE = "receipt_scanner";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_BASE64_CHARS = 7_000_000; // ~5 MB de arquivo

// Modelos que aceitam fallbacks: "default" (reexecuta em outro modelo se o
// principal recusar). Em outros modelos o parâmetro não é enviado.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

const EXPENSE_CATEGORIES = ["Fornecedores", "Funcionários", "Aluguel", "Utilidades", "Marketing", "Outros"] as const;
const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência", "Boleto"] as const;

const ReceiptSchema = z.object({
  is_receipt: z.boolean().describe("false se o arquivo não for uma nota, cupom, recibo ou boleto de despesa"),
  supplier_name: z.string().nullable().describe("razão social ou nome fantasia de quem vendeu/emitiu"),
  supplier_tax_id: z.string().nullable().describe("CNPJ ou CPF do emitente, só dígitos"),
  document_number: z.string().nullable().describe("número da nota, cupom ou recibo"),
  issue_date: z.string().nullable().describe("data de emissão no formato YYYY-MM-DD"),
  total_amount: z.number().nullable().describe("valor total pago em reais, ex.: 1234.56"),
  payment_method: z.enum(PAYMENT_METHODS).nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().describe("descrição curta para o lançamento, ex.: 'Compra de hortifruti - Ceasa'"),
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      total: z.number().nullable(),
    }),
  ),
  confidence: z.enum(["alta", "media", "baixa"]).describe("o quanto a leitura é confiável (foto nítida, valores legíveis)"),
  notes: z.string().nullable().describe("avisos para o usuário: campos ilegíveis, valores incertos, documento cortado"),
});

const SYSTEM_PROMPT = `Você lê documentos de despesa de restaurantes e deliveries brasileiros: DANFE de NF-e, cupom fiscal / NFC-e, nota de serviço, recibo, boleto e comprovante de pagamento.

Extraia os dados do documento para virar um lançamento de despesa no financeiro do restaurante.

- Use só o que está escrito no documento. Campo ilegível ou ausente fica null; nunca invente valores.
- total_amount é o valor efetivamente pago (total da nota, já com descontos e acréscimos), em número com ponto decimal.
- Datas brasileiras (dd/mm/aaaa) devem sair como YYYY-MM-DD.
- payment_method: escolha pela forma de pagamento impressa; se não houver, null.
- category: Fornecedores para compra de insumos, bebidas, embalagens e mercadorias; Utilidades para energia, água, gás, internet e telefone; Aluguel para aluguel e condomínio; Funcionários para salários, diárias, vale e serviços de pessoas; Marketing para anúncios, gráfica e divulgação; Outros no restante.
- items: os itens da nota na ordem impressa (no máximo 60); lista vazia se o documento não discrimina itens.
- Se a imagem estiver ruim, cortada ou parcialmente legível, diga em notes o que conferir e use confidence baixa.`;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "método não suportado" }, 405);

  const caller = getCallerClient(req);
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "não autenticado" }, 401);
  const userId = userData.user.id;

  const [{ data: canManage }, { data: accessOk }, { data: ownerId }] = await Promise.all([
    caller.rpc("has_permission", { check_key: "financial.manage" }),
    caller.rpc("account_access_ok"),
    caller.rpc("get_owner_id", { uid: userId }),
  ]);
  if (!canManage) return jsonResponse({ error: "sem permissão para lançar no financeiro" }, 403);
  if (!accessOk) return jsonResponse({ error: "assinatura inativa" }, 403);

  let body: { file_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }
  const data = body.file_base64?.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const mediaType = body.media_type ?? "";
  const isPdf = mediaType === "application/pdf";
  if (!data) return jsonResponse({ error: "envie o arquivo da nota" }, 400);
  if (!isPdf && !IMAGE_TYPES.includes(mediaType as ImageType)) {
    return jsonResponse({ error: "formato não suportado: envie JPG, PNG, WEBP ou PDF" }, 400);
  }
  if (data.length > MAX_BASE64_CHARS) return jsonResponse({ error: "arquivo muito grande (máx. 5 MB)" }, 413);

  const admin = getAdminClient();
  const [{ data: feature }, settings] = await Promise.all([
    admin.from("ai_features").select("enabled, status").eq("key", FEATURE).single(),
    loadAiSettings(admin),
  ]);
  if (!settings.enabled || !settings.api_key || !feature?.enabled || feature.status !== "available") {
    return jsonResponse({ error: "O scanner de notas está desativado no momento." }, 409);
  }
  const used = await monthlyUsage(admin, ownerId);
  if (used >= settings.monthly_limit_per_account) {
    return jsonResponse(
      { error: `Limite de ${settings.monthly_limit_per_account} leituras por mês atingido. Fale com a equipe Blyn.` },
      429,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const usageBase = { owner_id: ownerId as string, user_id: userId, feature: FEATURE, model: settings.model };

  try {
    const client = aiClient(settings);
    const response = await client.beta.messages.parse({
      model: settings.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
      ...(FALLBACK_MODELS.has(settings.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
              : { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data } },
            { type: "text", text: `Hoje é ${today}. Extraia os dados desta despesa.` },
          ],
        },
      ],
    });

    const tokens = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await logUsage(admin, { ...usageBase, ...tokens, success: false, error: `stop_reason=${response.stop_reason}` });
      return jsonResponse({ error: "Não foi possível ler esse documento. Tente outra foto." }, 422);
    }

    await logUsage(admin, { ...usageBase, ...tokens, success: true });
    return jsonResponse({
      receipt: response.parsed_output,
      usage: { used: used + 1, limit: settings.monthly_limit_per_account },
    });
  } catch (err) {
    const { status, message } = describeAiError(err);
    await logUsage(admin, { ...usageBase, success: false, error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
    return jsonResponse({ error: message }, status);
  }
});
