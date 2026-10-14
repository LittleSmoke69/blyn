// Integração com a Meta, compartilhada pelas Edge Functions:
//   - Graph/Marketing API (leitura de campanhas, conjuntos, anúncios e
//     métricas) — usada por admin-meta;
//   - Conversions API (evento "Lead" do servidor, com _fbp/_fbc, IP e
//     user-agent do visitante e dados de contato com hash SHA-256) — usada
//     por submit-lead.
// O token mora em meta_settings (sem policy de RLS — só o service role lê).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface MetaSettings {
  access_token: string | null;
  ad_account_id: string | null;
  pixel_id: string | null;
  api_version: string;
  capi_enabled: boolean;
  capi_test_event_code: string | null;
  sync_days: number;
  auto_sync: boolean;
  cron_secret: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

export async function loadMetaSettings(admin: SupabaseClient): Promise<MetaSettings> {
  const { data, error } = await admin.from("meta_settings").select("*").single();
  if (error || !data) throw new Error("configuração da Meta não encontrada");
  return data as MetaSettings;
}

export class MetaApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

const GRAPH = "https://graph.facebook.com";

/** GET na Graph API. `path` sem barra inicial e sem versão. */
export async function graphGet(s: MetaSettings, path: string, params: Record<string, string> = {}) {
  if (!s.access_token) throw new MetaApiError("token da Meta não configurado");
  const url = new URL(`${GRAPH}/${s.api_version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", s.access_token);
  return graphFetch(url.toString());
}

async function graphFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const e = body?.error;
    throw new MetaApiError(e?.error_user_msg || e?.message || `Meta respondeu ${res.status}`, e?.code);
  }
  return body;
}

/** Percorre todas as páginas (paging.next) de uma lista da Graph API. */
export async function graphGetAll<T>(s: MetaSettings, path: string, params: Record<string, string>, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet(s, path, params);
  for (let i = 0; i < maxPages; i++) {
    out.push(...((page?.data ?? []) as T[]));
    const next: string | undefined = page?.paging?.next;
    if (!next) break;
    page = await graphFetch(next);
  }
  return out;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normaliza como a Meta pede: minúsculas, sem acento/espaço; telefone com DDI. */
function normName(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function normPhone(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

export interface CapiLead {
  event_id: string;
  event_source_url: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  ip: string | null;
  user_agent: string | null;
  fbp: string | null;
  fbc: string | null;
  external_id: string | null;
  lead_source: string;
  channel: string;
}

/** Envia o evento Lead pra Conversions API. Retorna o status pra gravar no lead. */
export async function sendCapiLead(s: MetaSettings, lead: CapiLead): Promise<string> {
  if (!s.capi_enabled) return "desligado";
  if (!s.access_token || !s.pixel_id) return "erro: pixel ou token não configurado";

  const [first, ...rest] = (lead.name ?? "").trim().split(/\s+/);
  const user_data: Record<string, unknown> = { country: [await sha256("br")] };
  if (lead.email) user_data.em = [await sha256(lead.email.trim().toLowerCase())];
  if (lead.phone) user_data.ph = [await sha256(normPhone(lead.phone))];
  if (first) user_data.fn = [await sha256(normName(first))];
  if (rest.length) user_data.ln = [await sha256(normName(rest[rest.length - 1]))];
  if (lead.external_id) user_data.external_id = [await sha256(lead.external_id)];
  if (lead.ip) user_data.client_ip_address = lead.ip;
  if (lead.user_agent) user_data.client_user_agent = lead.user_agent;
  if (lead.fbp) user_data.fbp = lead.fbp;
  if (lead.fbc) user_data.fbc = lead.fbc;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id, // mesmo id que o Pixel do navegador usaria → deduplicação
        action_source: "website",
        event_source_url: lead.event_source_url ?? undefined,
        user_data,
        custom_data: { lead_source: lead.lead_source, channel: lead.channel, content_name: lead.lead_source },
      },
    ],
  };
  if (s.capi_test_event_code) body.test_event_code = s.capi_test_event_code;

  try {
    await graphFetch(`${GRAPH}/${s.api_version}/${s.pixel_id}/events?access_token=${encodeURIComponent(s.access_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return "enviado";
  } catch (err) {
    return `erro: ${(err instanceof Error ? err.message : String(err)).slice(0, 300)}`;
  }
}
