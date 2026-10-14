// Painel admin > Marketing: configuração da Meta e sincronização dos dados de
// anúncios (Marketing API) pro BI.
//
// O token nunca volta pro navegador — só "tem token" e os últimos 4
// caracteres. Os dados sincronizados (meta_campaigns, meta_adsets, meta_ads,
// meta_insights_daily) o painel lê direto pela RLS (policy de admin).
//
// Ações (admin logado):
//   - get:       configuração atual (sem o token)
//   - update:    access_token / clear_token, ad_account_id, pixel_id,
//                api_version, capi_enabled, capi_test_event_code, sync_days, auto_sync
//   - test:      confere o token e a conta de anúncios
//   - sync:      puxa campanhas, conjuntos, anúncios + criativos e métricas
//                diárias dos últimos `days` (padrão: sync_days)
//   - test_capi: manda um evento Lead de teste pra Conversions API
//
// O pg_cron (meta_cron_sync) também chama `sync`, autenticando pelo header
// x-cron-secret em vez de JWT de admin.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { graphGet, graphGetAll, loadMetaSettings, MetaApiError, sendCapiLead, type MetaSettings } from "../_shared/meta.ts";
import { AdminAuthError, requireAdmin } from "../_shared/requireAdmin.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

type SupabaseAdmin = ReturnType<typeof getAdminClient>;

interface Payload {
  action: "get" | "update" | "test" | "sync" | "test_capi";
  access_token?: string;
  clear_token?: boolean;
  ad_account_id?: string;
  pixel_id?: string;
  api_version?: string;
  capi_enabled?: boolean;
  capi_test_event_code?: string;
  sync_days?: number;
  auto_sync?: boolean;
  days?: number;
}

function publicView(s: MetaSettings) {
  return {
    has_token: !!s.access_token,
    token_hint: s.access_token ? `…${s.access_token.slice(-4)}` : null,
    ad_account_id: s.ad_account_id,
    pixel_id: s.pixel_id,
    api_version: s.api_version,
    capi_enabled: s.capi_enabled,
    capi_test_event_code: s.capi_test_event_code,
    sync_days: s.sync_days,
    auto_sync: s.auto_sync,
    last_sync_at: s.last_sync_at,
    last_sync_error: s.last_sync_error,
  };
}

// Orçamentos vêm em centavos da moeda da conta.
const money = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) / 100);
const num = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));

function actionValue(actions: { action_type: string; value: string }[] | undefined, types: string[]) {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return num(a.value);
  }
  return 0;
}

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"];
const CONVERSATION_TYPES = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function upsertChunks(admin: SupabaseAdmin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function sync(admin: SupabaseAdmin, s: MetaSettings, days: number) {
  if (!s.access_token || !s.ad_account_id) throw new MetaApiError("configure o token e a conta de anúncios");
  const act = `act_${s.ad_account_id}`;
  const now = new Date().toISOString();

  // deno-lint-ignore no-explicit-any
  type Row = Record<string, any>;

  const campaigns = await graphGetAll<Row>(s, `${act}/campaigns`, {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time",
    limit: "200",
  });
  await upsertChunks(admin, "meta_campaigns", campaigns.map((c) => ({
    id: c.id, name: c.name, status: c.status, effective_status: c.effective_status, objective: c.objective,
    daily_budget: money(c.daily_budget), lifetime_budget: money(c.lifetime_budget),
    start_time: c.start_time ?? null, stop_time: c.stop_time ?? null, created_time: c.created_time ?? null, synced_at: now,
  })), "id");

  const adsets = await graphGetAll<Row>(s, `${act}/adsets`, {
    fields: "id,name,campaign_id,status,effective_status,optimization_goal,daily_budget,lifetime_budget,start_time,end_time",
    limit: "200",
  });
  await upsertChunks(admin, "meta_adsets", adsets.map((a) => ({
    id: a.id, campaign_id: a.campaign_id, name: a.name, status: a.status, effective_status: a.effective_status,
    optimization_goal: a.optimization_goal, daily_budget: money(a.daily_budget), lifetime_budget: money(a.lifetime_budget),
    start_time: a.start_time ?? null, end_time: a.end_time ?? null, synced_at: now,
  })), "id");

  const ads = await graphGetAll<Row>(s, `${act}/ads`, {
    fields:
      "id,name,adset_id,campaign_id,status,effective_status,created_time," +
      "creative{id,name,title,body,image_url,thumbnail_url,video_id,object_type,call_to_action_type,instagram_permalink_url,object_story_spec,asset_feed_spec}",
    thumbnail_width: "480",
    thumbnail_height: "480",
    limit: "100",
  });
  await upsertChunks(admin, "meta_ads", ads.map((a) => {
    const c = a.creative ?? {};
    const story = c.object_story_spec ?? {};
    const link = story.link_data ?? {};
    const video = story.video_data ?? {};
    const feed = c.asset_feed_spec ?? {};
    return {
      id: a.id, adset_id: a.adset_id, campaign_id: a.campaign_id, name: a.name, status: a.status,
      effective_status: a.effective_status, created_time: a.created_time ?? null,
      creative_id: c.id ?? null, creative_name: c.name ?? null,
      title: c.title ?? link.name ?? video.title ?? feed.titles?.[0]?.text ?? null,
      body: c.body ?? link.message ?? video.message ?? feed.bodies?.[0]?.text ?? null,
      call_to_action: c.call_to_action_type ?? link.call_to_action?.type ?? video.call_to_action?.type ?? null,
      link_url: link.link ?? video.call_to_action?.value?.link ?? feed.link_urls?.[0]?.website_url ?? null,
      image_url: c.image_url ?? link.picture ?? video.image_url ?? null,
      thumbnail_url: c.thumbnail_url ?? null,
      video_id: c.video_id ?? video.video_id ?? null,
      object_type: c.object_type ?? null,
      permalink_url: c.instagram_permalink_url ?? null,
      synced_at: now,
    };
  }), "id");

  const until = new Date();
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  const insights = await graphGetAll<Row>(s, `${act}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    fields: "ad_id,adset_id,campaign_id,date_start,spend,impressions,reach,clicks,inline_link_clicks,actions,video_play_actions",
    limit: "500",
  }, 200);
  await upsertChunks(admin, "meta_insights_daily", insights.map((r) => ({
    ad_id: r.ad_id, date: r.date_start, adset_id: r.adset_id, campaign_id: r.campaign_id,
    spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks),
    link_clicks: num(r.inline_link_clicks),
    landing_page_views: actionValue(r.actions, ["landing_page_view", "omni_landing_page_view"]),
    leads: actionValue(r.actions, LEAD_TYPES),
    conversations: actionValue(r.actions, CONVERSATION_TYPES),
    video_views: actionValue(r.video_play_actions, ["video_view"]),
    actions: r.actions ?? null,
    synced_at: now,
  })), "ad_id,date");

  return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length, insights: insights.length, since: ymd(since), until: ymd(until) };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "método não suportado" }, 405);

  const admin = getAdminClient();
  let settings = await loadMetaSettings(admin);

  let adminId: string | null = null;
  const cronSecret = req.headers.get("x-cron-secret");
  const fromCron = !!cronSecret && cronSecret === settings.cron_secret;
  if (!fromCron) {
    try {
      adminId = await requireAdmin(req);
    } catch (err) {
      if (err instanceof AdminAuthError) return jsonResponse({ error: err.message }, err.status);
      return jsonResponse({ error: "falha de autorização" }, 403);
    }
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }
  if (fromCron && payload.action !== "sync") return jsonResponse({ error: "ação não permitida" }, 403);

  if (payload.action === "get") return jsonResponse(publicView(settings));

  if (payload.action === "update") {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: adminId };
    if (payload.clear_token) update.access_token = null;
    else if (typeof payload.access_token === "string" && payload.access_token.trim()) {
      const token = payload.access_token.trim();
      if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return jsonResponse({ error: "token inválido" }, 400);
      update.access_token = token;
    }
    if (typeof payload.ad_account_id === "string") {
      const id = payload.ad_account_id.trim().replace(/^act_/, "");
      if (id && !/^\d{5,25}$/.test(id)) return jsonResponse({ error: "ID da conta de anúncios inválido (só números)" }, 400);
      update.ad_account_id = id || null;
    }
    if (typeof payload.pixel_id === "string") {
      const id = payload.pixel_id.trim();
      if (id && !/^\d{5,25}$/.test(id)) return jsonResponse({ error: "ID do pixel inválido (só números)" }, 400);
      update.pixel_id = id || null;
    }
    if (typeof payload.api_version === "string") {
      if (!/^v\d{2}\.0$/.test(payload.api_version.trim())) return jsonResponse({ error: "versão da API inválida (ex.: v24.0)" }, 400);
      update.api_version = payload.api_version.trim();
    }
    if (typeof payload.capi_enabled === "boolean") update.capi_enabled = payload.capi_enabled;
    if (typeof payload.capi_test_event_code === "string") update.capi_test_event_code = payload.capi_test_event_code.trim().slice(0, 40) || null;
    if (typeof payload.auto_sync === "boolean") update.auto_sync = payload.auto_sync;
    if (payload.sync_days !== undefined) {
      const d = Number(payload.sync_days);
      if (!Number.isInteger(d) || d < 1 || d > 365) return jsonResponse({ error: "dias de sincronização: entre 1 e 365" }, 400);
      update.sync_days = d;
    }
    const { error } = await admin.from("meta_settings").update(update).eq("id", true);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse(publicView(await loadMetaSettings(admin)));
  }

  try {
    if (payload.action === "test") {
      const me = await graphGet(settings, "me", { fields: "id,name" });
      let account = null;
      if (settings.ad_account_id) {
        account = await graphGet(settings, `act_${settings.ad_account_id}`, { fields: "id,name,currency,account_status,timezone_name,amount_spent" });
      }
      let pixel = null;
      if (settings.pixel_id) pixel = await graphGet(settings, settings.pixel_id, { fields: "id,name,last_fired_time" });
      return jsonResponse({ ok: true, me, account, pixel });
    }

    if (payload.action === "test_capi") {
      const status = await sendCapiLead({ ...settings, capi_enabled: true }, {
        event_id: crypto.randomUUID(),
        event_source_url: "https://blynassessoria.com.br/",
        email: "teste@blynassessoria.com.br",
        phone: null,
        name: "Teste Blyn",
        ip: null,
        user_agent: req.headers.get("user-agent"),
        fbp: null,
        fbc: null,
        external_id: null,
        lead_source: "teste_painel",
        channel: "teste",
      });
      return jsonResponse({ ok: status === "enviado", status, test_event_code: settings.capi_test_event_code });
    }

    if (payload.action === "sync") {
      const days = payload.days !== undefined ? Math.min(365, Math.max(1, Math.floor(Number(payload.days)) || settings.sync_days)) : settings.sync_days;
      const result = await sync(admin, settings, days);
      await admin.from("meta_settings").update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("id", true);
      settings = await loadMetaSettings(admin);
      return jsonResponse({ ok: true, ...result, settings: publicView(settings) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha inesperada";
    if (payload.action === "sync") {
      await admin.from("meta_settings").update({ last_sync_error: message.slice(0, 500), last_sync_at: new Date().toISOString() }).eq("id", true);
    }
    // Nunca 502/503/504: o BunkerWeb troca o JSON por HTML. Falha externa = 424.
    return jsonResponse({ error: `Meta: ${message}` }, err instanceof MetaApiError ? 424 : 500);
  }

  return jsonResponse({ error: "ação desconhecida" }, 400);
});
