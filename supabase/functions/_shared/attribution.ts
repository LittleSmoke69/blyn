// Atribuição de origem dos visitantes/leads da landing, compartilhada por
// track-visit e submit-lead. O navegador manda o que viu (UTMs, click ids,
// referrer, cookies _fbp/_fbc...); aqui higienizamos tudo e classificamos o
// canal no servidor — o front só coleta, nunca decide o canal.

export const TOUCH_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid", "li_fat_id",
  // Parâmetros de URL dinâmicos da Meta ({{campaign.id}}, {{ad.id}}...)
  "campaign_id", "adset_id", "ad_id", "placement", "site_source_name",
  "referrer", "landing_page", "ts",
] as const;

const CLICK_ID_KEYS = ["fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid", "li_fat_id"] as const;

export type Touch = Partial<Record<(typeof TOUCH_KEYS)[number], string>>;

export interface Tracking {
  visitor_id: string | null;
  session_id: string | null;
  first_touch: Touch | null;
  last_touch: Touch | null;
  page: string | null;
  fbp: string | null;
  fbc: string | null;
  ga: string | null;
  language: string | null;
  screen: string | null;
  viewport: string | null;
  timezone: string | null;
  platform: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function touch(value: unknown): Touch | null {
  if (!value || typeof value !== "object") return null;
  const out: Touch = {};
  for (const key of TOUCH_KEYS) {
    const v = str((value as Record<string, unknown>)[key], key === "referrer" || key === "landing_page" ? 1000 : 300);
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function parseTracking(raw: unknown): Tracking {
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fbp = str(t.fbp, 200);
  const fbc = str(t.fbc, 400);
  return {
    visitor_id: uuid(t.visitor_id),
    session_id: uuid(t.session_id),
    first_touch: touch(t.first_touch),
    last_touch: touch(t.last_touch),
    page: str(t.page, 1000),
    // Formato oficial: fb.<subdomínio>.<timestamp>.<valor>
    fbp: fbp && /^fb\.\d\.\d+\.\d+$/.test(fbp) ? fbp : null,
    fbc: fbc && /^fb\.\d\.\d+\.[\w-]+$/.test(fbc) ? fbc : null,
    ga: str(t.ga, 100),
    language: str(t.language, 40),
    screen: str(t.screen, 20),
    viewport: str(t.viewport, 20),
    timezone: str(t.timezone, 60),
    platform: str(t.platform, 60),
  };
}

export function clickIds(t: Touch | null): Record<string, string> | null {
  if (!t) return null;
  const out = Object.fromEntries(CLICK_ID_KEYS.filter((k) => t[k]).map((k) => [k, t[k]!]));
  return Object.keys(out).length ? out : null;
}

const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "an", "msg", "messenger", "audience_network"]);
const PAID_MEDIUMS = /^(cpc|ppc|cpm|cpa|cpv|paid|paid[_-]?social|paidsocial|ads?|display|banner|retargeting|remarketing)$/;
const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu|brave)\./;
const SOCIAL_HOSTS = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|lnkd|youtube|tiktok|pinterest|threads|whatsapp|wa|telegram|reddit)\.(com|me|co|net|org|in)/;

function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Canal da visita a partir do último toque. Regras, em ordem:
 *  1. Clique pago identificado (fbclid + UTM paga ou id de anúncio da Meta,
 *     gclid/gbraid/wbraid, ttclid, msclkid) ou UTM com medium pago;
 *  2. UTM sem medium pago (link na bio, e-mail, parceria) → orgânico/campanha;
 *  3. Sem UTM: referrer de buscador → orgânico busca; rede social →
 *     orgânico social (inclui fbclid sem UTM: link de post/bio do Instagram e
 *     Facebook também recebe fbclid); outro site → referência; nada → direto.
 */
export function classifyChannel(t: Touch | null, ownHost?: string): { channel: string; source: string | null; medium: string | null } {
  const source = t?.utm_source?.toLowerCase() ?? null;
  const medium = t?.utm_medium?.toLowerCase() ?? null;
  const ref = host(t?.referrer);
  const refHost = ref && ownHost && (ref === ownHost || ref.endsWith(`.${ownHost}`)) ? null : ref;
  const paid = !!medium && PAID_MEDIUMS.test(medium);
  const metaAd = !!(t?.ad_id || t?.adset_id || t?.campaign_id) && (!source || META_SOURCES.has(source));

  if (metaAd || (source && META_SOURCES.has(source) && (paid || !!t?.fbclid))) {
    return { channel: "meta_ads", source: source ?? "facebook", medium: medium ?? "paid" };
  }
  if (t?.gclid || t?.gbraid || t?.wbraid || (source === "google" && paid)) {
    return { channel: "google_ads", source: source ?? "google", medium: medium ?? "cpc" };
  }
  if (t?.ttclid || (source === "tiktok" && paid)) return { channel: "tiktok_ads", source: source ?? "tiktok", medium: medium ?? "paid" };
  if (t?.msclkid) return { channel: "outros_pagos", source: source ?? "bing", medium: medium ?? "cpc" };
  if (paid) return { channel: "outros_pagos", source, medium };

  if (source || medium || t?.utm_campaign) {
    if (medium === "email" || medium === "e-mail" || medium === "newsletter") return { channel: "email", source, medium };
    if ((source && (META_SOURCES.has(source) || SOCIAL_HOSTS.test(`${source}.com`))) || /^(social|organic|organico|bio|post|stories|story|reels)$/.test(medium ?? "")) {
      return { channel: "organico_social", source, medium: medium ?? "social" };
    }
    if (medium === "organic" || medium === "seo") return { channel: "organico_busca", source, medium };
    return { channel: "campanha", source, medium };
  }

  if (refHost && SEARCH_HOSTS.test(refHost)) {
    return { channel: "organico_busca", source: refHost.replace(/^www\./, "").split(".")[0], medium: "organic" };
  }
  if (t?.fbclid) return { channel: "organico_social", source: refHost?.includes("instagram") ? "instagram" : "facebook", medium: "social" };
  if (refHost && SOCIAL_HOSTS.test(refHost)) {
    const name = refHost.replace(/^(www|l|lm|m|mobile|web)\./, "").split(".")[0];
    return { channel: "organico_social", source: name === "t" ? "twitter" : name === "lnkd" ? "linkedin" : name, medium: "social" };
  }
  if (refHost) return { channel: "referencia", source: refHost.replace(/^www\./, ""), medium: "referral" };
  return { channel: "direto", source: null, medium: null };
}

export function deviceFromUa(ua: string | null): string | null {
  if (!ua) return null;
  if (/bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|preview/i.test(ua)) return "bot";
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** IP real do visitante (BunkerWeb → envoy/gateway repassam X-Forwarded-For). */
export function clientIp(req: Request): string | null {
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const c of candidates) {
    const ip = c?.trim();
    if (ip && (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^[0-9a-f:]+$/i.test(ip))) return ip;
  }
  return null;
}

export const OWN_HOST = "blynassessoria.com.br";

/** Colunas de atribuição comuns a site_sessions e crm_leads. */
export function attributionColumns(req: Request, t: Tracking) {
  const last = t.last_touch;
  const { channel, source, medium } = classifyChannel(last, OWN_HOST);
  const ua = str(req.headers.get("user-agent"), 500);
  return {
    channel,
    utm_source: last?.utm_source ?? source,
    utm_medium: last?.utm_medium ?? medium,
    utm_campaign: last?.utm_campaign ?? null,
    utm_content: last?.utm_content ?? null,
    utm_term: last?.utm_term ?? null,
    meta_campaign_id: channel === "meta_ads" && last?.campaign_id && /^\d+$/.test(last.campaign_id) ? last.campaign_id : null,
    meta_adset_id: channel === "meta_ads" && last?.adset_id && /^\d+$/.test(last.adset_id) ? last.adset_id : null,
    meta_ad_id: channel === "meta_ads" && last?.ad_id && /^\d+$/.test(last.ad_id) ? last.ad_id : null,
    referrer: last?.referrer ?? null,
    landing_page: last?.landing_page ?? t.page,
    fbp: t.fbp,
    fbc: t.fbc,
    ip: clientIp(req),
    user_agent: ua,
    device: deviceFromUa(ua),
    first_touch: t.first_touch,
  };
}
