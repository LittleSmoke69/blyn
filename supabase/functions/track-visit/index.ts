// Registra o início de uma sessão na landing (uma vez por aba), com a origem
// da visita: UTMs, click ids, referrer, _fbp/_fbc, user-agent, IP. É a base
// da taxa de conversão por canal no painel /admin/marketing.
//
// Também recebe os eventos do site que a landing dispara no Meta Pixel
// (`event`: clique no WhatsApp, CTA, início do formulário, rolagem): grava em
// site_events e, se a Conversions API estiver ligada, manda o mesmo evento
// (mesmo event_id do fbq → a Meta deduplica) com _fbp/_fbc, IP e user-agent.
// O lead em si NÃO passa por aqui — vai pelo submit-lead.
//
// Pública (verify_jwt=false): visitante anônimo. Sem policy de insert pra
// anon em site_sessions/site_events — só esta function grava, com service
// role. O id da sessão vem do navegador; repetição do mesmo id é ignorada.
import { attributionColumns, clickIds, parseTracking } from "../_shared/attribution.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { loadMetaSettings, sendCapiEvent } from "../_shared/meta.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

// Só esses nomes são aceitos (o endpoint é público; não vira um relay
// genérico pra Meta). Contact é evento padrão da Meta; os outros são personalizados.
const ALLOWED_EVENTS = new Set(["Contact", "ClickCTA", "ClickLogin", "FormStart", "ScrollDepth", "Engaged"]);

function eventData(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z_]{1,40}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
  }
  return out;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "método não suportado" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const tracking = parseTracking(payload.tracking);
  if (!tracking.session_id || !tracking.visitor_id) return jsonResponse({ error: "sessão inválida" }, 400);

  const admin = getAdminClient();
  const cols = attributionColumns(req, tracking);
  const { error } = await admin
    .from("site_sessions")
    .upsert(
      {
        id: tracking.session_id,
        visitor_id: tracking.visitor_id,
        ...cols,
        click_ids: clickIds(tracking.last_touch),
        language: tracking.language,
        screen: tracking.screen,
        timezone: tracking.timezone,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("site_sessions insert falhou:", error.message);
    return jsonResponse({ error: "falha ao registrar visita" }, 500);
  }

  const ev = payload.event as Record<string, unknown> | undefined;
  if (!ev) return jsonResponse({ ok: true, channel: cols.channel });

  const name = typeof ev.name === "string" ? ev.name : "";
  const eventId = typeof ev.event_id === "string" && /^[\w-]{8,64}$/.test(ev.event_id) ? ev.event_id : null;
  if (!ALLOWED_EVENTS.has(name) || !eventId) return jsonResponse({ error: "evento inválido" }, 400);
  const data = eventData(ev.data);

  const { error: evError } = await admin.from("site_events").insert({
    event_id: eventId,
    session_id: tracking.session_id,
    visitor_id: tracking.visitor_id,
    name,
    data,
    channel: cols.channel,
  });
  // Duplicado (mesmo event_id reenviado) → já registrado, nada a fazer.
  if (evError) return jsonResponse({ ok: true, duplicate: evError.code === "23505" });

  try {
    const meta = await loadMetaSettings(admin);
    if (meta.capi_enabled && meta.capi_custom_events && meta.custom_events_enabled) {
      const status = await sendCapiEvent(meta, {
        event_name: name,
        event_id: eventId,
        event_source_url: tracking.page,
        user: {
          ip: cols.ip,
          user_agent: cols.user_agent,
          fbp: cols.fbp,
          fbc: cols.fbc,
          external_id: tracking.visitor_id,
        },
        custom_data: {
          ...data,
          channel: cols.channel,
          utm_source: cols.utm_source,
          utm_medium: cols.utm_medium,
          utm_campaign: cols.utm_campaign,
          utm_content: cols.utm_content,
          campaign_id: cols.meta_campaign_id,
          adset_id: cols.meta_adset_id,
          ad_id: cols.meta_ad_id,
        },
      });
      await admin.from("site_events").update({ capi_status: status }).eq("event_id", eventId);
    }
  } catch (err) {
    console.error("CAPI (evento) falhou:", err instanceof Error ? err.message : err);
  }

  return jsonResponse({ ok: true });
});
