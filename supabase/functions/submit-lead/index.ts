// Recebe os formulários da landing page (hero "Agendar demonstração" e o do
// rodapé) e grava no CRM interno (crm_leads). Chamada por visitante NÃO
// autenticado (verify_jwt=false no config.toml), por isso roda com service
// role — crm_leads não tem nenhuma policy pra anon.
//
// O formulário da hero é editável no painel admin (tabela site_forms): aqui
// validamos o envio contra a MESMA config que a landing usou pra renderizar
// (obrigatórios, tipo, opções de select). O do rodapé ainda é fixo no HTML e
// usa LEGACY_FIELDS.
//
// Proteções (sem captcha, pra não atrapalhar conversão):
//   - honeypot: campo "website" invisível na landing; se vier preenchido,
//     respondemos 200 e descartamos (bot não percebe que falhou);
//   - limites de tamanho por campo e validação de e-mail/WhatsApp;
//   - deduplicação: mesmo e-mail (ou WhatsApp) com lead ainda aberto não cria
//     lead novo — vira uma atividade "formulário" no lead existente.
//
// Atribuição: a landing manda `tracking` (primeiro/último toque com UTMs,
// click ids e ids de anúncio da Meta, _fbp/_fbc, visitante/sessão, tela,
// idioma); IP e user-agent vêm dos headers. O canal é classificado aqui
// (_shared/attribution.ts). Lead novo também vira evento "Lead" na
// Conversions API da Meta, se estiver ligada no painel (/admin/marketing).
import { attributionColumns, parseTracking } from "../_shared/attribution.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { loadMetaSettings, sendCapiEvent } from "../_shared/meta.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "textarea";
  required?: boolean;
  options?: string[];
}

interface Answer {
  key: string;
  label: string;
  value: string;
}

// Formulário do rodapé (fixo no HTML) e fallback se site_forms não existir.
const LEGACY_FIELDS: FormField[] = [
  { key: "nome", label: "Nome", type: "text", required: true },
  { key: "email", label: "E-mail", type: "email", required: true },
  { key: "whatsapp", label: "WhatsApp", type: "tel" },
  { key: "delivery", label: "Delivery", type: "text" },
  { key: "instagram", label: "Instagram", type: "text" },
  { key: "desafio", label: "Principal desafio", type: "text" },
  { key: "mensagem", label: "Mensagem", type: "textarea" },
];

const SOURCE_TO_FORM: Record<string, string> = { landing_hero: "hero" };
const ALLOWED_SOURCES = new Set(["landing_hero", "landing_footer"]);

// Chaves que também alimentam colunas próprias do lead (filtro, busca, cards).
const COLUMN_FOR_KEY: Record<string, string> = {
  delivery: "business_name",
  instagram: "instagram",
  desafio: "challenge",
  mensagem: "message",
};

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return max > 500 ? v.slice(0, max) : v.replace(/\s+/g, " ").slice(0, max);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "método não suportado" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (payload.website) {
    return jsonResponse({ ok: true });
  }

  const source = typeof payload.source === "string" && ALLOWED_SOURCES.has(payload.source) ? payload.source : "landing";
  const admin = getAdminClient();

  let fields = LEGACY_FIELDS;
  const formId = SOURCE_TO_FORM[source];
  if (formId) {
    const { data: form } = await admin.from("site_forms").select("fields").eq("id", formId).maybeSingle();
    if (Array.isArray(form?.fields) && form.fields.length > 0) fields = form.fields as FormField[];
  }

  // Valida cada campo contra a config e monta as respostas na ordem do form.
  const answers: Answer[] = [];
  for (const field of fields) {
    const value = clean(payload[field.key], field.type === "textarea" ? 2000 : 200);
    if (!value) {
      if (field.required) return jsonResponse({ error: `${field.label} é obrigatório` }, 400);
      continue;
    }
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return jsonResponse({ error: "e-mail inválido" }, 400);
    }
    if (field.type === "tel") {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) return jsonResponse({ error: `${field.label} inválido` }, 400);
    }
    if (field.type === "select" && field.options?.length && !field.options.includes(value)) {
      return jsonResponse({ error: `opção inválida em ${field.label}` }, 400);
    }
    answers.push({ key: field.key, label: field.label, value });
  }

  const get = (key: string) => answers.find((a) => a.key === key)?.value ?? null;
  const name = get("nome");
  const email = get("email")?.toLowerCase() ?? null;
  const whatsapp = get("whatsapp");

  if (!name) return jsonResponse({ error: "nome é obrigatório" }, 400);
  if (!email && !whatsapp) return jsonResponse({ error: "informe e-mail ou WhatsApp" }, 400);

  const columns: Record<string, string | null> = { business_name: null, instagram: null, challenge: null, message: null };
  for (const [key, column] of Object.entries(COLUMN_FOR_KEY)) {
    const v = get(key);
    if (v) columns[column] = key === "instagram" ? v.replace(/^@/, "") : v;
  }

  const utm =
    payload.utm && typeof payload.utm === "object"
      ? Object.fromEntries(
          Object.entries(payload.utm as Record<string, unknown>)
            .filter(([k, v]) => /^utm_[a-z]+$/.test(k) && typeof v === "string")
            .map(([k, v]) => [k, String(v).slice(0, 200)])
        )
      : null;

  const tracking = parseTracking(payload.tracking);
  const attribution = attributionColumns(req, tracking);
  const trackingJson = {
    ...tracking,
    ip: attribution.ip,
    user_agent: attribution.user_agent,
    accept_language: req.headers.get("accept-language")?.slice(0, 200) ?? null,
    submitted_at: new Date().toISOString(),
  };
  const originLine = `Origem: ${attribution.channel}${attribution.utm_source ? ` · ${attribution.utm_source}` : ""}${
    attribution.utm_campaign ? ` / ${attribution.utm_campaign}` : ""
  }`;

  const summary = [`Formulário (${source})`, ...answers.filter((a) => a.key !== "nome").map((a) => `${a.label}: ${a.value}`)].join("\n");

  // Dedupe: mesmo contato com lead ainda aberto.
  let existingQuery = admin
    .from("crm_leads")
    .select("id, whatsapp, business_name, instagram, challenge, answers, channel, tracking")
    .not("stage", "in", "(ganho,perdido)")
    .order("created_at", { ascending: false })
    .limit(1);
  existingQuery = email ? existingQuery.ilike("email", email) : existingQuery.eq("whatsapp", whatsapp!);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    // Completa só o que estava vazio — nunca sobrescreve o que a equipe já
    // ajustou manualmente no lead.
    const patch: Record<string, unknown> = {};
    if (!existing.whatsapp && whatsapp) patch.whatsapp = whatsapp;
    if (!existing.business_name && columns.business_name) patch.business_name = columns.business_name;
    if (!existing.instagram && columns.instagram) patch.instagram = columns.instagram;
    if (!existing.challenge && columns.challenge) patch.challenge = columns.challenge;
    if (!existing.answers) patch.answers = answers;
    // Lead criado antes do rastreamento (ou manual): completa a origem.
    if (!existing.tracking) Object.assign(patch, attribution, { tracking: trackingJson, visitor_id: tracking.visitor_id, session_id: tracking.session_id });
    if (Object.keys(patch).length > 0) {
      await admin.from("crm_leads").update(patch).eq("id", existing.id);
    }
    await admin.from("crm_activities").insert({
      lead_id: existing.id,
      type: "formulario",
      content: `Novo envio do formulário.\n${summary}\n${originLine}`,
    });
    return jsonResponse({ ok: true });
  }

  // Novo lead entra no topo da coluna "novo".
  const { data: top } = await admin
    .from("crm_leads")
    .select("position")
    .eq("stage", "novo")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: lead, error } = await admin
    .from("crm_leads")
    .insert({
      name,
      email,
      whatsapp,
      ...columns,
      answers,
      source,
      utm,
      ...attribution,
      visitor_id: tracking.visitor_id,
      session_id: tracking.session_id,
      tracking: trackingJson,
      position: (top?.position ?? 0) - 1,
    })
    .select("id")
    .single();

  if (error || !lead) {
    return jsonResponse({ error: "falha ao registrar contato" }, 500);
  }

  await admin.from("crm_activities").insert({ lead_id: lead.id, type: "formulario", content: `${summary}\n${originLine}` });

  // Conversions API: nunca derruba o envio do formulário se a Meta falhar.
  try {
    const meta = await loadMetaSettings(admin);
    if (meta.capi_enabled) {
      // Todas as respostas do formulário (menos nome/e-mail/WhatsApp, que vão
      // com hash em user_data) + origem da visita, como parâmetros do evento.
      const formData = Object.fromEntries(
        answers.filter((a) => !["nome", "email", "whatsapp"].includes(a.key)).map((a) => [a.key, a.value]),
      );
      const status = await sendCapiEvent(meta, {
        event_name: meta.lead_event_name,
        // event_id do navegador (o mesmo do fbq) pra Meta deduplicar.
        event_id: typeof payload.event_id === "string" && /^[\w-]{8,64}$/.test(payload.event_id) ? payload.event_id : lead.id,
        event_source_url: tracking.page,
        user: {
          email,
          phone: whatsapp,
          name,
          ip: attribution.ip,
          user_agent: attribution.user_agent,
          fbp: attribution.fbp,
          fbc: attribution.fbc,
          external_id: tracking.visitor_id,
        },
        custom_data: {
          content_name: source,
          content_category: "demonstracao",
          lead_source: source,
          lead_id: lead.id,
          channel: attribution.channel,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_content: attribution.utm_content,
          utm_term: attribution.utm_term,
          campaign_id: attribution.meta_campaign_id,
          adset_id: attribution.meta_adset_id,
          ad_id: attribution.meta_ad_id,
          device: attribution.device,
          ...formData,
        },
      });
      await admin.from("crm_leads").update({ capi_status: status, capi_sent_at: new Date().toISOString() }).eq("id", lead.id);
    }
  } catch (err) {
    console.error("CAPI falhou:", err instanceof Error ? err.message : err);
  }

  return jsonResponse({ ok: true }, 201);
});
