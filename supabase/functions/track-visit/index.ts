// Registra o início de uma sessão na landing (uma vez por aba), com a origem
// da visita: UTMs, click ids, referrer, _fbp/_fbc, user-agent, IP. É a base
// da taxa de conversão por canal no painel /admin/marketing.
//
// Pública (verify_jwt=false): visitante anônimo. Sem policy de insert pra
// anon em site_sessions — só esta function grava, com service role. O id da
// sessão vem do navegador; repetição do mesmo id é ignorada (on conflict).
import { attributionColumns, clickIds, parseTracking } from "../_shared/attribution.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

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

  const cols = attributionColumns(req, tracking);
  const { error } = await getAdminClient()
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
  return jsonResponse({ ok: true, channel: cols.channel });
});
