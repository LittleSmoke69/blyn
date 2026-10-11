// Recebe os formulários da landing page (hero "Agendar demonstração" e o do
// rodapé) e grava no CRM interno (crm_leads). Chamada por visitante NÃO
// autenticado (verify_jwt=false no config.toml), por isso roda com service
// role — crm_leads não tem nenhuma policy pra anon.
//
// Proteções (sem captcha, pra não atrapalhar conversão):
//   - honeypot: campo "website" invisível na landing; se vier preenchido,
//     respondemos 200 e descartamos (bot não percebe que falhou);
//   - limites de tamanho por campo e validação de e-mail/WhatsApp;
//   - deduplicação: mesmo e-mail com lead ainda aberto (não ganho/perdido)
//     não cria lead novo — vira uma atividade "formulário" no lead existente.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

interface Payload {
  source?: string;
  nome?: string;
  email?: string;
  whatsapp?: string;
  delivery?: string;
  instagram?: string;
  desafio?: string;
  mensagem?: string;
  website?: string; // honeypot
  utm?: Record<string, string>;
}

const MAX = { name: 120, email: 160, whatsapp: 30, business: 160, instagram: 80, challenge: 120, message: 2000 };
const ALLOWED_SOURCES = new Set(["landing_hero", "landing_footer"]);

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "método não suportado" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (payload.website) {
    return jsonResponse({ ok: true });
  }

  const name = clean(payload.nome, MAX.name);
  const email = clean(payload.email, MAX.email)?.toLowerCase() ?? null;
  const whatsappRaw = clean(payload.whatsapp, MAX.whatsapp);
  const whatsappDigits = whatsappRaw?.replace(/\D/g, "") ?? "";

  if (!name) return jsonResponse({ error: "nome é obrigatório" }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "e-mail inválido" }, 400);
  }
  if (whatsappRaw && (whatsappDigits.length < 10 || whatsappDigits.length > 13)) {
    return jsonResponse({ error: "WhatsApp inválido" }, 400);
  }

  const source = payload.source && ALLOWED_SOURCES.has(payload.source) ? payload.source : "landing";
  const fields = {
    business_name: clean(payload.delivery, MAX.business),
    instagram: clean(payload.instagram, MAX.instagram)?.replace(/^@/, "") ?? null,
    challenge: clean(payload.desafio, MAX.challenge),
    message: typeof payload.mensagem === "string" ? payload.mensagem.trim().slice(0, MAX.message) || null : null,
  };
  const utm =
    payload.utm && typeof payload.utm === "object"
      ? Object.fromEntries(
          Object.entries(payload.utm)
            .filter(([k, v]) => /^utm_[a-z]+$/.test(k) && typeof v === "string")
            .map(([k, v]) => [k, String(v).slice(0, 200)])
        )
      : null;

  const admin = getAdminClient();

  const summary = [
    `Formulário (${source})`,
    whatsappRaw && `WhatsApp: ${whatsappRaw}`,
    fields.business_name && `Delivery: ${fields.business_name}`,
    fields.instagram && `Instagram: @${fields.instagram}`,
    fields.challenge && `Desafio: ${fields.challenge}`,
    fields.message && `Mensagem: ${fields.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: existing } = await admin
    .from("crm_leads")
    .select("id, whatsapp, business_name, instagram, challenge")
    .ilike("email", email)
    .not("stage", "in", "(ganho,perdido)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Completa só o que estava vazio — nunca sobrescreve o que a equipe já
    // ajustou manualmente no lead.
    const patch: Record<string, string> = {};
    if (!existing.whatsapp && whatsappRaw) patch.whatsapp = whatsappRaw;
    if (!existing.business_name && fields.business_name) patch.business_name = fields.business_name;
    if (!existing.instagram && fields.instagram) patch.instagram = fields.instagram;
    if (!existing.challenge && fields.challenge) patch.challenge = fields.challenge;
    if (Object.keys(patch).length > 0) {
      await admin.from("crm_leads").update(patch).eq("id", existing.id);
    }
    await admin.from("crm_activities").insert({
      lead_id: existing.id,
      type: "formulario",
      content: `Novo envio do formulário.\n${summary}`,
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
      whatsapp: whatsappRaw,
      ...fields,
      source,
      utm,
      position: (top?.position ?? 0) - 1,
    })
    .select("id")
    .single();

  if (error || !lead) {
    return jsonResponse({ error: "falha ao registrar contato" }, 500);
  }

  await admin.from("crm_activities").insert({ lead_id: lead.id, type: "formulario", content: summary });

  return jsonResponse({ ok: true }, 201);
});
