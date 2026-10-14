import { supabase } from "../lib/supabase";
import type { CrmStage } from "./crm";

/** Canais classificados no servidor (supabase/functions/_shared/attribution.ts). */
export const CHANNELS: { key: string; label: string; color: string; paid: boolean }[] = [
  { key: "meta_ads", label: "Meta Ads", color: "#2a78d6", paid: true },
  { key: "google_ads", label: "Google Ads", color: "#eb6834", paid: true },
  { key: "organico_social", label: "Orgânico · Social", color: "#1baf7a", paid: false },
  { key: "organico_busca", label: "Orgânico · Busca", color: "#eda100", paid: false },
  { key: "referencia", label: "Sites de referência", color: "#e87ba4", paid: false },
  { key: "email", label: "E-mail", color: "#008300", paid: false },
  { key: "direto", label: "Direto", color: "#6250d6", paid: false },
  // Tudo o que sobra cai em "Outros" (cinza) — nunca uma cor nova.
  { key: "outros", label: "Outros", color: "#9a9a94", paid: false },
];

const OTHER_PAID = new Set(["tiktok_ads", "outros_pagos"]);
const SUB_LABEL: Record<string, string> = {
  tiktok_ads: "TikTok Ads",
  outros_pagos: "Outros pagos",
  campanha: "Campanha (UTM)",
  manual: "Cadastro manual",
};

/** Agrupa o canal bruto num dos 8 do gráfico. */
export function channelGroup(raw: string | null | undefined): string {
  if (!raw) return "outros";
  return CHANNELS.some((c) => c.key === raw) ? raw : "outros";
}

export function channelLabel(raw: string | null | undefined): string {
  if (!raw) return "Sem origem";
  return CHANNELS.find((c) => c.key === raw)?.label ?? SUB_LABEL[raw] ?? raw;
}

export function isPaidChannel(raw: string | null | undefined) {
  return !!raw && (CHANNELS.find((c) => c.key === raw)?.paid || OTHER_PAID.has(raw));
}

export const channelColor = (raw: string | null | undefined) =>
  CHANNELS.find((c) => c.key === channelGroup(raw))!.color;

export interface MarketingLead {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  business_name: string | null;
  source: string;
  stage: CrmStage;
  estimated_value: number | null;
  account_user_id: string | null;
  created_at: string;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  fbp: string | null;
  fbc: string | null;
  visitor_id: string | null;
  ip: string | null;
  user_agent: string | null;
  device: string | null;
  referrer: string | null;
  landing_page: string | null;
  first_touch: Record<string, string> | null;
  tracking: Record<string, unknown> | null;
  capi_status: string | null;
}

export const MARKETING_LEAD_SELECT =
  "id, name, email, whatsapp, business_name, source, stage, estimated_value, account_user_id, created_at, channel, utm_source, utm_medium, utm_campaign, utm_content, utm_term, meta_campaign_id, meta_adset_id, meta_ad_id, fbp, fbc, visitor_id, ip, user_agent, device, referrer, landing_page, first_touch, tracking, capi_status";

export interface SessionSummary {
  day: string;
  channel: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  meta_campaign_id: string | null;
  device: string | null;
  sessions: number;
  visitors: number;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
}

export interface MetaAdset {
  id: string;
  campaign_id: string | null;
  name: string;
  effective_status: string | null;
  optimization_goal: string | null;
}

export interface MetaAd {
  id: string;
  adset_id: string | null;
  campaign_id: string | null;
  name: string;
  effective_status: string | null;
  creative_name: string | null;
  title: string | null;
  body: string | null;
  call_to_action: string | null;
  link_url: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  permalink_url: string | null;
}

export interface MetaInsight {
  ad_id: string;
  date: string;
  adset_id: string | null;
  campaign_id: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  leads: number;
  conversations: number;
}

export interface MetaSettingsView {
  has_token: boolean;
  token_hint: string | null;
  ad_account_id: string | null;
  pixel_id: string | null;
  api_version: string;
  capi_enabled: boolean;
  capi_test_event_code: string | null;
  sync_days: number;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
  lead_event_name: string;
  custom_events_enabled: boolean;
  capi_custom_events: boolean;
}

export interface EventSummary {
  day: string;
  name: string;
  channel: string | null;
  events: number;
  visitors: number;
}

/** Eventos que a landing dispara no Pixel (landing/main.js) — além do lead. */
export const SITE_EVENTS: { name: string; label: string; kind: "padrão" | "personalizado" }[] = [
  { name: "Contact", label: "Clique no WhatsApp", kind: "padrão" },
  { name: "ClickCTA", label: "Clique em “Agendar demonstração”", kind: "personalizado" },
  { name: "FormStart", label: "Começou a preencher o formulário", kind: "personalizado" },
  { name: "ClickLogin", label: "Clique em “Entrar”", kind: "personalizado" },
  { name: "ScrollDepth", label: "Rolou 50% / 90% da página", kind: "personalizado" },
  { name: "Engaged", label: "30 s na página com a aba visível", kind: "personalizado" },
];

export async function callMeta<T = unknown>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("admin-meta", { body });
  if (error) {
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) return { error: payload.error as string };
    } catch {
      // genérico
    }
    return { error: error.message };
  }
  return { data: data as T };
}

/** Métricas somadas (de várias linhas diárias). */
export interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  leads: number;
  conversations: number;
}

export const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, landing_page_views: 0, leads: 0, conversations: 0 });

export function addInsight(t: Totals, r: MetaInsight) {
  t.spend += Number(r.spend);
  t.impressions += Number(r.impressions);
  t.reach += Number(r.reach);
  t.clicks += Number(r.clicks);
  t.link_clicks += Number(r.link_clicks);
  t.landing_page_views += Number(r.landing_page_views);
  t.leads += Number(r.leads);
  t.conversations += Number(r.conversations);
  return t;
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Template de parâmetros de URL pra colar no anúncio (Gerenciador > Anúncio > Parâmetros de URL). */
export const META_URL_TEMPLATE =
  "utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}";
