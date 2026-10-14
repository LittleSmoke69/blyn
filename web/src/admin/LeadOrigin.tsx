import { useEffect, useState } from "react";
import { formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import { channelColor, channelLabel, MARKETING_LEAD_SELECT, type MarketingLead } from "./marketing";

const TOUCH_LABEL: Record<string, string> = {
  utm_source: "Origem (utm_source)",
  utm_medium: "Mídia (utm_medium)",
  utm_campaign: "Campanha",
  utm_content: "Conteúdo / anúncio",
  utm_term: "Termo / conjunto",
  utm_id: "utm_id",
  campaign_id: "ID campanha (Meta)",
  adset_id: "ID conjunto (Meta)",
  ad_id: "ID anúncio (Meta)",
  placement: "Posicionamento",
  site_source_name: "Site de origem (Meta)",
  fbclid: "fbclid",
  gclid: "gclid",
  gbraid: "gbraid",
  wbraid: "wbraid",
  ttclid: "ttclid",
  msclkid: "msclkid",
  li_fat_id: "li_fat_id",
  referrer: "Referrer",
  landing_page: "Página de entrada",
  ts: "Quando",
};

export function ChannelPill({ channel }: { channel: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-medium">
      <span className="h-2 w-2 rounded-full" style={{ background: channelColor(channel) }} />
      {channelLabel(channel)}
    </span>
  );
}

function TouchList({ title, touch }: { title: string; touch: Record<string, string> | null | undefined }) {
  if (!touch || !Object.keys(touch).length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{title}</p>
      <dl className="grid grid-cols-1 sm:grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-1">
        {Object.entries(touch).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{TOUCH_LABEL[k] ?? k}</dt>
            <dd className="font-medium break-all">{k === "ts" ? formatDateTime(v) : v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Todos os dados de origem/rastreamento de um lead. */
export function LeadOriginDetails({ lead }: { lead: MarketingLead }) {
  const t = (lead.tracking ?? {}) as Record<string, unknown>;
  const tech: [string, unknown][] = [
    ["Dispositivo", lead.device],
    ["IP", lead.ip],
    ["User-agent", lead.user_agent],
    ["_fbp", lead.fbp],
    ["_fbc", lead.fbc],
    ["_ga", t.ga],
    ["Visitante", lead.visitor_id],
    ["Idioma", t.language ?? t.accept_language],
    ["Tela / janela", t.screen ? `${t.screen}${t.viewport ? ` · ${t.viewport}` : ""}` : null],
    ["Fuso", t.timezone],
    ["Plataforma", t.platform],
    ["Página do envio", t.page],
    ["Conversions API", lead.capi_status],
  ];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelPill channel={lead.channel} />
        {lead.utm_source && <span className="text-muted">{lead.utm_source}{lead.utm_medium ? ` / ${lead.utm_medium}` : ""}</span>}
        {lead.utm_campaign && <span className="font-medium">· {lead.utm_campaign}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TouchList title="Último toque (atribuição)" touch={t.last_touch as Record<string, string> | undefined} />
        <TouchList title="Primeiro toque" touch={lead.first_touch} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Dados técnicos</p>
        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-1">
          {tech.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium break-all">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Seção "Origem do lead" do drawer do CRM — busca as colunas de rastreamento à parte. */
export function LeadOriginSection({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<MarketingLead | null>(null);

  useEffect(() => {
    supabase.from("crm_leads").select(MARKETING_LEAD_SELECT).eq("id", leadId).maybeSingle()
      .then(({ data }) => setLead(data as MarketingLead | null));
  }, [leadId]);

  if (!lead || (!lead.channel && !lead.tracking)) return null;
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Origem do lead</h3>
      <LeadOriginDetails lead={lead} />
    </section>
  );
}
