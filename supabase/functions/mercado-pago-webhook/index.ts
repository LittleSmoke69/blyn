// Recebe notificações do Mercado Pago e grava CADA evento em webhook_events
// — isso é o que alimenta a tela de "Eventos" do painel admin. O
// processamento automático (ativar assinatura sozinho) continua como stub:
// verificar a assinatura do webhook e buscar o pagamento real na API do
// Mercado Pago é trabalho futuro (precisa das credenciais reais, que ainda
// não existem). Por enquanto, o evento fica logado e visível pro admin agir
// manualmente (ex: via admin-manage-accounts, action=activate_subscription).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    const url = new URL(req.url);
    payload = Object.fromEntries(url.searchParams.entries());
  }

  const admin = getAdminClient();
  const eventType =
    (payload as Record<string, unknown>)?.type ??
    (payload as Record<string, unknown>)?.topic ??
    "unknown";

  const { error } = await admin.from("webhook_events").insert({
    source: "mercado_pago",
    event_type: String(eventType),
    payload,
    processed: false,
    processing_note:
      "Recebido e logado. Verificação de assinatura + ativação automática ainda não implementadas " +
      "(fase futura) — ativar manualmente via painel admin.",
  });

  if (error) {
    console.error("mercado-pago-webhook: falha ao gravar webhook_events", error);
  }

  // Sempre 200 pro Mercado Pago, mesmo se o log interno falhar — evita
  // retentativas excessivas por um problema nosso.
  return jsonResponse({ received: true }, 200);
});
