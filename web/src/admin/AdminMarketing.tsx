import { BarChart3, Download, ExternalLink, Megaphone, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBanner, PageHeader, PillTabs, StatCard, inputClass, secondaryButton } from "../components/ui";
import { exportCsv } from "../lib/exporters";
import { formatBRL, formatDateTime, formatPercent, localDateKey } from "../lib/format";
import { supabase } from "../lib/supabase";
import { STAGE_LABEL } from "./crm";
import { ChannelPill, LeadOriginDetails } from "./LeadOrigin";
import {
  addInsight, CHANNELS, channelGroup, channelLabel, emptyTotals, isPaidChannel, MARKETING_LEAD_SELECT, ratio,
  SITE_EVENTS, type EventSummary, type MarketingLead, type MetaAd, type MetaAdset, type MetaCampaign, type MetaInsight, type SessionSummary, type Totals,
} from "./marketing";
import { MarketingSettings } from "./MarketingSettings";

type Tab = "overview" | "leads" | "campaigns" | "creatives" | "settings";
type Period = "7" | "30" | "90" | "180";

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (v: number | null) => (v === null ? "—" : formatPercent(v * 100));
const fmtMoney = (v: number | null) => (v === null ? "—" : formatBRL(v));

export interface MarketingData {
  leads: MarketingLead[];
  sessions: SessionSummary[];
  events: EventSummary[];
  campaigns: MetaCampaign[];
  adsets: MetaAdset[];
  ads: MetaAd[];
  insights: MetaInsight[];
  accounts: Map<string, string>;
}

/** Liga o lead do CRM à campanha/anúncio da Meta: pelos ids da URL ou, sem eles, pelo nome (utm_campaign / utm_content). */
function useMetaMatcher(d: MarketingData) {
  return useMemo(() => {
    const campaignByName = new Map(d.campaigns.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const adByName = new Map(d.ads.map((a) => [`${a.campaign_id}|${a.name.trim().toLowerCase()}`, a.id]));
    const adById = new Map(d.ads.map((a) => [a.id, a]));
    const campaignOf = (l: MarketingLead) => {
      if (l.meta_campaign_id) return l.meta_campaign_id;
      if (l.meta_ad_id && adById.get(l.meta_ad_id)?.campaign_id) return adById.get(l.meta_ad_id)!.campaign_id;
      if (l.channel === "meta_ads" && l.utm_campaign) return campaignByName.get(l.utm_campaign.trim().toLowerCase()) ?? null;
      return null;
    };
    const adOf = (l: MarketingLead) => {
      if (l.meta_ad_id) return l.meta_ad_id;
      const c = campaignOf(l);
      if (c && l.utm_content) return adByName.get(`${c}|${l.utm_content.trim().toLowerCase()}`) ?? null;
      return null;
    };
    return { campaignOf, adOf };
  }, [d.campaigns, d.ads]);
}

export function AdminMarketing() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<MarketingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    const until = new Date();
    until.setHours(23, 59, 59, 999);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (Number(period) - 1));
    return { since, until };
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sinceIso = range.since.toISOString();
    const sinceDay = localDateKey(range.since);
    const [leadsRes, sessRes, evRes, campRes, adsetRes, adsRes, insRes, accRes] = await Promise.all([
      supabase.from("crm_leads").select(MARKETING_LEAD_SELECT).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(5000),
      supabase.rpc("marketing_sessions_summary", { since: sinceIso, until: range.until.toISOString() }),
      supabase.rpc("marketing_events_summary", { since: sinceIso, until: range.until.toISOString() }),
      supabase.from("meta_campaigns").select("id, name, status, effective_status, objective, daily_budget, lifetime_budget"),
      supabase.from("meta_adsets").select("id, campaign_id, name, effective_status, optimization_goal"),
      supabase.from("meta_ads").select("id, adset_id, campaign_id, name, effective_status, creative_name, title, body, call_to_action, link_url, image_url, thumbnail_url, video_id, permalink_url"),
      supabase.from("meta_insights_daily").select("ad_id, date, adset_id, campaign_id, spend, impressions, reach, clicks, link_clicks, landing_page_views, leads, conversations").gte("date", sinceDay).limit(20000),
      supabase.rpc("admin_list_accounts"),
    ]);
    const firstError = [leadsRes, sessRes, evRes, campRes, adsetRes, adsRes, insRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    setData({
      leads: (leadsRes.data as MarketingLead[]) ?? [],
      sessions: ((sessRes.data as SessionSummary[]) ?? []).map((s) => ({ ...s, sessions: Number(s.sessions), visitors: Number(s.visitors) })),
      events: ((evRes.data as EventSummary[]) ?? []).map((e) => ({ ...e, events: Number(e.events), visitors: Number(e.visitors) })),
      campaigns: (campRes.data as MetaCampaign[]) ?? [],
      adsets: (adsetRes.data as MetaAdset[]) ?? [],
      ads: (adsRes.data as MetaAd[]) ?? [],
      insights: (insRes.data as MetaInsight[]) ?? [],
      accounts: new Map(((accRes.data as { user_id: string; restaurant_name: string }[]) ?? []).map((a) => [a.user_id, a.restaurant_name])),
    });
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Marketing · BI"
        subtitle="Origem das visitas e dos leads (anúncios e orgânico), campanhas e criativos da Meta"
        icon={BarChart3}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={`${inputClass} w-auto!`} aria-label="Período">
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="180">Últimos 180 dias</option>
            </select>
            <button onClick={load} disabled={loading} className={secondaryButton}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-6">
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: "overview", label: "Visão geral" },
            { key: "leads", label: "Leads e UTMs" },
            { key: "campaigns", label: "Campanhas Meta" },
            { key: "creatives", label: "Criativos" },
            { key: "settings", label: "Configuração" },
          ]}
        />
      </div>

      {tab === "settings" ? (
        <MarketingSettings onSynced={load} />
      ) : !data ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted">Carregando...</div>
      ) : tab === "overview" ? (
        <Overview data={data} since={range.since} />
      ) : tab === "leads" ? (
        <LeadsTable data={data} />
      ) : tab === "campaigns" ? (
        <Campaigns data={data} />
      ) : (
        <Creatives data={data} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Table({ headers, rows, empty = "Sem dados no período" }: { headers: { label: string; right?: boolean }[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            {headers.map((h) => (
              <th key={h.label} className={`pb-2 pr-4 font-medium whitespace-nowrap ${h.right ? "text-right" : ""}`}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="py-6 text-center text-muted">{empty}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => (
                  <td key={j} className={`py-2 pr-4 ${headers[j]?.right ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Barras empilhadas por canal, uma por dia. Cores fixas por canal (nunca pela posição). */
function DailyByChannel({ days, rows, name }: { days: string[]; rows: { day: string; channel: string; value: number }[]; name: string }) {
  const present = new Set(rows.filter((r) => r.value > 0).map((r) => channelGroup(r.channel)));
  const series = CHANNELS.filter((c) => present.has(c.key));
  const chart = days.map((day) => {
    const point: Record<string, string | number> = { day: day.slice(8, 10) + "/" + day.slice(5, 7) };
    for (const s of series) point[s.key] = 0;
    for (const r of rows) if (r.day === day) point[channelGroup(r.channel)] = Number(point[channelGroup(r.channel)] ?? 0) + r.value;
    return point;
  });
  if (!series.length) return <p className="text-sm text-muted py-10 text-center">Nenhum(a) {name} no período.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip cursor={{ fill: "var(--bg)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text)" }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={1} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Overview({ data, since }: { data: MarketingData; since: Date }) {
  const { leads, sessions, insights } = data;
  const match = useMetaMatcher(data);

  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date(since);
    const today = localDateKey();
    while (localDateKey(d) <= today) {
      out.push(localDateKey(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [since]);

  const totalSessions = sessions.reduce((s, r) => s + r.sessions, 0);
  const metaTotals = insights.reduce(addInsight, emptyTotals());
  const metaLeads = leads.filter((l) => l.channel === "meta_ads");
  const won = leads.filter((l) => l.stage === "ganho");
  const wonValue = won.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0);
  const paidLeads = leads.filter((l) => isPaidChannel(l.channel)).length;

  // Por canal
  const byChannel = new Map<string, { sessions: number; visitors: number; leads: number; won: number; lost: number; value: number }>();
  const row = (k: string) => byChannel.get(k) ?? byChannel.set(k, { sessions: 0, visitors: 0, leads: 0, won: 0, lost: 0, value: 0 }).get(k)!;
  for (const s of sessions) {
    const r = row(s.channel);
    r.sessions += s.sessions;
    r.visitors += s.visitors;
  }
  for (const l of leads) {
    const r = row(l.channel ?? "manual");
    r.leads++;
    if (l.stage === "ganho") { r.won++; r.value += Number(l.estimated_value ?? 0); }
    if (l.stage === "perdido") r.lost++;
  }
  const channelRows = [...byChannel.entries()].sort((a, b) => b[1].leads - a[1].leads || b[1].sessions - a[1].sessions);

  // Por origem / mídia / campanha (UTM)
  const byCampaign = new Map<string, { channel: string; source: string; medium: string; campaign: string; sessions: number; leads: number; won: number }>();
  const key = (ch: string, s: string | null, m: string | null, c: string | null) => [ch, s ?? "", m ?? "", c ?? ""].join("|");
  const camp = (ch: string, s: string | null, m: string | null, c: string | null) => {
    const k = key(ch, s, m, c);
    if (!byCampaign.has(k)) byCampaign.set(k, { channel: ch, source: s ?? "—", medium: m ?? "—", campaign: c ?? "—", sessions: 0, leads: 0, won: 0 });
    return byCampaign.get(k)!;
  };
  for (const s of sessions) camp(s.channel, s.utm_source, s.utm_medium, s.utm_campaign).sessions += s.sessions;
  for (const l of leads) {
    const r = camp(l.channel ?? "manual", l.utm_source, l.utm_medium, l.utm_campaign);
    r.leads++;
    if (l.stage === "ganho") r.won++;
  }
  const campaignRows = [...byCampaign.values()].filter((r) => r.channel !== "direto").sort((a, b) => b.leads - a.leads || b.sessions - a.sessions).slice(0, 25);

  // Dispositivos
  const byDevice = new Map<string, { sessions: number; leads: number }>();
  for (const s of sessions) {
    const k = s.device ?? "desconhecido";
    const r = byDevice.get(k) ?? { sessions: 0, leads: 0 };
    r.sessions += s.sessions;
    byDevice.set(k, r);
  }
  for (const l of leads) {
    if (!l.device) continue;
    const r = byDevice.get(l.device) ?? { sessions: 0, leads: 0 };
    r.leads++;
    byDevice.set(l.device, r);
  }

  // Funil por canal
  const stageKeys = ["novo", "contato", "demo_agendada", "proposta", "ganho", "perdido"] as const;
  const funnel = new Map<string, Record<string, number>>();
  for (const l of leads) {
    const ch = l.channel ?? "manual";
    const r = funnel.get(ch) ?? Object.fromEntries(stageKeys.map((s) => [s, 0]));
    r[l.stage]++;
    funnel.set(ch, r);
  }

  const metaCrmWithCampaign = metaLeads.filter((l) => match.campaignOf(l)).length;

  function exportReport() {
    exportCsv(`marketing-${localDateKey()}`, [
      {
        title: "Por canal",
        headers: ["Canal", "Visitas", "Visitantes", "Leads", "Conversão %", "Ganhos", "Valor ganho"],
        rows: channelRows.map(([ch, r]) => [channelLabel(ch), r.sessions, r.visitors, r.leads, r.sessions ? ((r.leads / r.sessions) * 100).toFixed(1) : "", r.won, r.value.toFixed(2)]),
      },
      {
        title: "Por campanha (UTM)",
        headers: ["Canal", "Origem", "Mídia", "Campanha", "Visitas", "Leads", "Ganhos"],
        rows: campaignRows.map((r) => [channelLabel(r.channel), r.source, r.medium, r.campaign, r.sessions, r.leads, r.won]),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Visitas" value={fmtInt(totalSessions)} />
        <StatCard label="Leads" value={fmtInt(leads.length)} />
        <StatCard label="Conversão do site" value={fmtPct(ratio(leads.filter((l) => l.source.startsWith("landing")).length, totalSessions))} />
        <StatCard label="Leads de anúncios" value={`${fmtInt(paidLeads)} · ${fmtInt(leads.length - paidLeads)} org./direto`} valueClassName="text-lg" />
        <StatCard label="Investimento Meta" value={formatBRL(metaTotals.spend)} />
        <StatCard label="CPL real (Meta → CRM)" value={fmtMoney(ratio(metaTotals.spend, metaLeads.length))} />
        <StatCard label="Leads ganhos" value={fmtInt(won.length)} valueClassName="text-green-dark" />
        <StatCard label="Valor mensal ganho" value={formatBRL(wonValue)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Leads por dia" subtitle="Por canal de origem (último toque)">
          <DailyByChannel days={days} name="lead" rows={leads.map((l) => ({ day: localDateKey(new Date(l.created_at)), channel: l.channel ?? "manual", value: 1 }))} />
        </Card>
        <Card title="Visitas por dia" subtitle="Sessões na landing, por canal (bots excluídos)">
          <DailyByChannel days={days} name="visita" rows={sessions.map((s) => ({ day: s.day, channel: s.channel, value: s.sessions }))} />
        </Card>
      </div>

      <Card
        title="Desempenho por canal"
        subtitle="Anúncios pagos e orgânico lado a lado"
        action={<button onClick={exportReport} className={secondaryButton}><Download className="h-4 w-4" /> CSV</button>}
      >
        <Table
          headers={[{ label: "Canal" }, { label: "Visitas", right: true }, { label: "Visitantes", right: true }, { label: "Leads", right: true }, { label: "Conversão", right: true }, { label: "% dos leads", right: true }, { label: "Ganhos", right: true }, { label: "Perdidos", right: true }, { label: "Valor ganho", right: true }]}
          rows={channelRows.map(([ch, r]) => [
            <ChannelPill key="c" channel={ch} />, fmtInt(r.sessions), fmtInt(r.visitors), fmtInt(r.leads), fmtPct(ratio(r.leads, r.sessions)),
            fmtPct(ratio(r.leads, leads.length)), fmtInt(r.won), fmtInt(r.lost), formatBRL(r.value),
          ])}
        />
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <Card title="Origem · mídia · campanha" subtitle="Top 25 combinações de UTM (sem o tráfego direto)">
          <Table
            headers={[{ label: "Canal" }, { label: "Origem" }, { label: "Mídia" }, { label: "Campanha" }, { label: "Visitas", right: true }, { label: "Leads", right: true }, { label: "Conversão", right: true }, { label: "Ganhos", right: true }]}
            rows={campaignRows.map((r) => [
              <ChannelPill key="c" channel={r.channel} />, r.source, r.medium, <span key="n" className="break-all">{r.campaign}</span>,
              fmtInt(r.sessions), fmtInt(r.leads), fmtPct(ratio(r.leads, r.sessions)), fmtInt(r.won),
            ])}
          />
        </Card>
        <Card title="Dispositivos">
          <Table
            headers={[{ label: "Dispositivo" }, { label: "Visitas", right: true }, { label: "Leads", right: true }, { label: "Conversão", right: true }]}
            rows={[...byDevice.entries()].sort((a, b) => b[1].sessions - a[1].sessions).map(([k, r]) => [
              <span key="d" className="capitalize">{k}</span>, fmtInt(r.sessions), fmtInt(r.leads), fmtPct(ratio(r.leads, r.sessions)),
            ])}
          />
        </Card>
      </div>

      <EventsCard data={data} totalSessions={totalSessions} leadsCount={leads.filter((l) => l.source.startsWith("landing")).length} />

      <Card title="Funil comercial por canal" subtitle="Etapa atual no CRM dos leads criados no período">
        <Table
          headers={[{ label: "Canal" }, ...stageKeys.map((s) => ({ label: STAGE_LABEL[s], right: true })), { label: "Taxa de ganho", right: true }]}
          rows={[...funnel.entries()].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).map(([ch, r]) => {
            const total = Object.values(r).reduce((x, y) => x + y, 0);
            return [<ChannelPill key="c" channel={ch} />, ...stageKeys.map((s) => fmtInt(r[s])), fmtPct(ratio(r.ganho, total))];
          })}
        />
      </Card>

      {metaLeads.length > 0 && metaCrmWithCampaign < metaLeads.length && (
        <p className="text-xs text-muted">
          {metaLeads.length - metaCrmWithCampaign} lead(s) de Meta Ads sem campanha identificada. Cole o modelo de parâmetros de URL (aba Configuração) nos anúncios
          para ligar cada lead à campanha e ao criativo exatos.
        </p>
      )}
    </div>
  );
}

function EventsCard({ data, totalSessions, leadsCount }: { data: MarketingData; totalSessions: number; leadsCount: number }) {
  const byName = new Map<string, { events: number; visitors: number; paid: number }>();
  for (const e of data.events) {
    const r = byName.get(e.name) ?? { events: 0, visitors: 0, paid: 0 };
    r.events += e.events;
    r.visitors += e.visitors;
    if (isPaidChannel(e.channel)) r.paid += e.events;
    byName.set(e.name, r);
  }
  const rows = SITE_EVENTS.map((ev) => ({ ...ev, ...(byName.get(ev.name) ?? { events: 0, visitors: 0, paid: 0 }) }));
  return (
    <Card title="Eventos do site (Pixel)" subtitle="Engajamento na landing; visitantes únicos somados por dia">
      <Table
        headers={[{ label: "Evento" }, { label: "O que é" }, { label: "Disparos", right: true }, { label: "Visitantes", right: true }, { label: "% das visitas", right: true }, { label: "De anúncios", right: true }]}
        rows={[
          ...rows.map((r) => [<span key="n" className="font-mono text-xs">{r.name}</span>, r.label, fmtInt(r.events), fmtInt(r.visitors), fmtPct(ratio(r.visitors, totalSessions)), fmtInt(r.paid)]),
          [<span key="n" className="font-mono text-xs">Lead</span>, "Envio do formulário", fmtInt(leadsCount), "—", fmtPct(ratio(leadsCount, totalSessions)), "—"],
        ]}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Leads e UTMs                                                        */
/* ------------------------------------------------------------------ */

function LeadsTable({ data }: { data: MarketingData }) {
  const [channel, setChannel] = useState("todos");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const campaignName = new Map(data.campaigns.map((c) => [c.id, c.name]));
  const adName = new Map(data.ads.map((a) => [a.id, a.name]));
  const match = useMetaMatcher(data);

  const channels = [...new Set(data.leads.map((l) => l.channel ?? "manual"))];
  const term = q.trim().toLowerCase();
  const rows = data.leads.filter((l) => {
    if (channel !== "todos" && (l.channel ?? "manual") !== channel) return false;
    if (!term) return true;
    return [l.name, l.email, l.whatsapp, l.business_name, l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term]
      .some((v) => v?.toLowerCase().includes(term));
  });

  function exportLeads() {
    exportCsv(`leads-utm-${localDateKey()}`, [{
      headers: ["Data", "Nome", "Delivery", "E-mail", "WhatsApp", "Etapa", "Canal", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        "Campanha Meta", "Anúncio Meta", "Dispositivo", "Referrer", "Página de entrada", "fbp", "fbc", "IP", "User-agent", "1º toque origem", "1º toque campanha", "CAPI"],
      rows: rows.map((l) => {
        const c = match.campaignOf(l);
        const a = match.adOf(l);
        return [formatDateTime(l.created_at), l.name, l.business_name ?? "", l.email ?? "", l.whatsapp ?? "", STAGE_LABEL[l.stage], channelLabel(l.channel),
          l.utm_source ?? "", l.utm_medium ?? "", l.utm_campaign ?? "", l.utm_content ?? "", l.utm_term ?? "",
          (c && campaignName.get(c)) ?? c ?? "", (a && adName.get(a)) ?? a ?? "", l.device ?? "", l.referrer ?? "", l.landing_page ?? "",
          l.fbp ?? "", l.fbc ?? "", l.ip ?? "", l.user_agent ?? "", l.first_touch?.utm_source ?? l.first_touch?.referrer ?? "", l.first_touch?.utm_campaign ?? "", l.capi_status ?? ""];
      }),
    }]);
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, contato, origem, campanha..." className={`${inputClass} pl-9`} />
        </div>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`${inputClass} w-auto!`} aria-label="Canal">
          <option value="todos">Todos os canais</option>
          {channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
        </select>
        <button onClick={exportLeads} className={secondaryButton}><Download className="h-4 w-4" /> CSV</button>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Data", "Lead", "Canal", "Origem / mídia", "Campanha", "Anúncio / conteúdo", "Disp.", "Etapa", "CAPI"].map((h) => (
                <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">Nenhum lead no período.</td></tr>}
            {rows.map((l) => {
              const c = match.campaignOf(l);
              const a = match.adOf(l);
              const open = openId === l.id;
              return (
                <FragmentRow key={l.id} open={open} detail={
                  <div className="space-y-3">
                    <LeadOriginDetails lead={l} />
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Link to={`/admin/crm?lead=${l.id}`} className={secondaryButton}><ExternalLink className="h-4 w-4" /> Abrir no CRM</Link>
                      {l.account_user_id && <span className="rounded-lg bg-green/10 text-green-dark px-3 py-2 font-semibold">Conta: {data.accounts.get(l.account_user_id) ?? "criada"}</span>}
                      {l.estimated_value ? <span className="rounded-lg bg-bg px-3 py-2">Valor estimado: {formatBRL(Number(l.estimated_value))}/mês</span> : null}
                    </div>
                  </div>
                }>
                  <tr onClick={() => setOpenId(open ? null : l.id)} className="border-t border-border cursor-pointer hover:bg-bg/60 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted">{formatDateTime(l.created_at)}</td>
                    <td className="py-2 pr-4">
                      <p className="font-medium">{l.name}</p>
                      {l.business_name && <p className="text-xs text-muted">{l.business_name}</p>}
                    </td>
                    <td className="py-2 pr-4"><ChannelPill channel={l.channel} /></td>
                    <td className="py-2 pr-4 whitespace-nowrap">{l.utm_source ?? "—"}{l.utm_medium ? ` / ${l.utm_medium}` : ""}</td>
                    <td className="py-2 pr-4 max-w-[220px] break-words">{(c && campaignName.get(c)) ?? l.utm_campaign ?? "—"}</td>
                    <td className="py-2 pr-4 max-w-[220px] break-words">{(a && adName.get(a)) ?? l.utm_content ?? "—"}</td>
                    <td className="py-2 pr-4 capitalize">{l.device ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{STAGE_LABEL[l.stage]}</td>
                    <td className="py-2 pr-4 text-xs">{l.capi_status === "enviado" ? "✓" : l.capi_status?.startsWith("erro") ? <span className="text-red" title={l.capi_status}>erro</span> : "—"}</td>
                  </tr>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRow({ open, detail, children }: { open: boolean; detail: ReactNode; children: ReactNode }) {
  return (
    <>
      {children}
      {open && (
        <tr className="bg-bg/50">
          <td colSpan={9} className="p-4">{detail}</td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Campanhas Meta                                                      */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa", PAUSED: "Pausada", DELETED: "Excluída", ARCHIVED: "Arquivada", CAMPAIGN_PAUSED: "Campanha pausada",
  ADSET_PAUSED: "Conjunto pausado", IN_PROCESS: "Em análise", WITH_ISSUES: "Com problemas", DISAPPROVED: "Reprovado", PENDING_REVIEW: "Em análise",
};

function StatusBadge({ status }: { status: string | null }) {
  const active = status === "ACTIVE";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-green/15 text-green-dark" : "bg-border text-muted"}`}>
      {status ? STATUS_LABEL[status] ?? status : "—"}
    </span>
  );
}

interface Perf extends Totals {
  crmLeads: number;
  won: number;
  wonValue: number;
}

function usePerformance(data: MarketingData, level: "campaign" | "adset" | "ad") {
  const match = useMetaMatcher(data);
  return useMemo(() => {
    const out = new Map<string, Perf>();
    const get = (id: string) => out.get(id) ?? out.set(id, { ...emptyTotals(), crmLeads: 0, won: 0, wonValue: 0 }).get(id)!;
    for (const r of data.insights) {
      const id = level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id;
      if (id) addInsight(get(id), r);
    }
    const adById = new Map(data.ads.map((a) => [a.id, a]));
    for (const l of data.leads) {
      if (l.channel !== "meta_ads") continue;
      const adId = match.adOf(l);
      const id = level === "campaign" ? match.campaignOf(l) : level === "adset" ? l.meta_adset_id ?? (adId ? adById.get(adId)?.adset_id ?? null : null) : adId;
      if (!id) continue;
      const p = get(id);
      p.crmLeads++;
      if (l.stage === "ganho") { p.won++; p.wonValue += Number(l.estimated_value ?? 0); }
    }
    return out;
  }, [data, level, match]);
}

function perfCells(p: Perf | undefined) {
  const t = p ?? { ...emptyTotals(), crmLeads: 0, won: 0, wonValue: 0 };
  return [
    formatBRL(t.spend), fmtInt(t.impressions), fmtInt(t.reach), fmtInt(t.link_clicks),
    fmtPct(ratio(t.link_clicks, t.impressions)), fmtMoney(ratio(t.spend, t.link_clicks)), fmtMoney(ratio(t.spend * 1000, t.impressions)),
    fmtInt(t.leads + t.conversations), fmtInt(t.crmLeads), fmtMoney(ratio(t.spend, t.crmLeads)), fmtInt(t.won),
  ];
}

const PERF_HEADERS = [
  { label: "Investido", right: true }, { label: "Impressões", right: true }, { label: "Alcance", right: true }, { label: "Cliques no link", right: true },
  { label: "CTR", right: true }, { label: "CPC", right: true }, { label: "CPM", right: true }, { label: "Resultados Meta", right: true },
  { label: "Leads CRM", right: true }, { label: "CPL real", right: true }, { label: "Ganhos", right: true },
];

function Campaigns({ data }: { data: MarketingData }) {
  const perf = usePerformance(data, "campaign");
  const adsetPerf = usePerformance(data, "adset");
  const [open, setOpen] = useState<string | null>(null);
  const [onlyWithData, setOnlyWithData] = useState(true);

  if (!data.campaigns.length) {
    return <NoMetaData />;
  }

  const campaigns = data.campaigns
    .filter((c) => !onlyWithData || perf.has(c.id))
    .sort((a, b) => (perf.get(b.id)?.spend ?? 0) - (perf.get(a.id)?.spend ?? 0));
  const total = [...perf.values()].reduce((t, p) => {
    for (const k of Object.keys(t) as (keyof Perf)[]) t[k] += p[k];
    return t;
  }, { ...emptyTotals(), crmLeads: 0, won: 0, wonValue: 0 } as Perf);

  const spendByDay = new Map<string, number>();
  for (const r of data.insights) spendByDay.set(r.date, (spendByDay.get(r.date) ?? 0) + Number(r.spend));
  const spendChart = [...spendByDay.entries()].sort().map(([d, v]) => ({ day: d.slice(8, 10) + "/" + d.slice(5, 7), Investimento: Math.round(v * 100) / 100 }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Investido" value={formatBRL(total.spend)} />
        <StatCard label="Impressões" value={fmtInt(total.impressions)} />
        <StatCard label="CTR (link)" value={fmtPct(ratio(total.link_clicks, total.impressions))} />
        <StatCard label="CPC (link)" value={fmtMoney(ratio(total.spend, total.link_clicks))} />
        <StatCard label="Leads no CRM" value={fmtInt(total.crmLeads)} />
        <StatCard label="CPL real" value={fmtMoney(ratio(total.spend, total.crmLeads))} />
      </div>

      <Card title="Investimento por dia" subtitle="Soma de todas as campanhas da conta">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spendChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `R$${v}`} />
              <Tooltip cursor={{ fill: "var(--bg)" }} formatter={(v) => formatBRL(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="Investimento" fill="#2a78d6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Campanhas"
        subtitle="Clique numa campanha para ver os conjuntos. “Resultados Meta” = leads + conversas contados pela Meta; “Leads CRM” = leads que chegaram de fato no formulário."
        action={
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyWithData} onChange={(e) => setOnlyWithData(e.target.checked)} /> Só com veiculação no período
          </label>
        }
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 pr-4 font-medium">Campanha</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                {PERF_HEADERS.map((h) => <th key={h.label} className="pb-2 pr-4 font-medium text-right whitespace-nowrap">{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && <tr><td colSpan={13} className="py-6 text-center text-muted">Nenhuma campanha com veiculação no período.</td></tr>}
              {campaigns.map((c) => (
                <CampaignRows key={c.id} campaign={c} perf={perf.get(c.id)} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)}
                  adsets={data.adsets.filter((a) => a.campaign_id === c.id)} adsetPerf={adsetPerf} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CampaignRows({ campaign, perf, open, onToggle, adsets, adsetPerf }: {
  campaign: MetaCampaign; perf: Perf | undefined; open: boolean; onToggle: () => void; adsets: MetaAdset[]; adsetPerf: Map<string, Perf>;
}) {
  return (
    <>
      <tr onClick={onToggle} className="border-t border-border cursor-pointer hover:bg-bg/60">
        <td className="py-2 pr-4 min-w-[200px]">
          <p className="font-medium">{campaign.name}</p>
          <p className="text-xs text-muted">{campaign.objective?.replace("OUTCOME_", "").toLowerCase() ?? ""}{campaign.daily_budget ? ` · ${formatBRL(Number(campaign.daily_budget))}/dia` : ""}</p>
        </td>
        <td className="py-2 pr-4"><StatusBadge status={campaign.effective_status} /></td>
        {perfCells(perf).map((v, i) => <td key={i} className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">{v}</td>)}
      </tr>
      {open && adsets.filter((a) => adsetPerf.has(a.id)).map((a) => (
        <tr key={a.id} className="bg-bg/50 text-xs">
          <td className="py-1.5 pr-4 pl-4">↳ {a.name}</td>
          <td className="py-1.5 pr-4"><StatusBadge status={a.effective_status} /></td>
          {perfCells(adsetPerf.get(a.id)).map((v, i) => <td key={i} className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap">{v}</td>)}
        </tr>
      ))}
    </>
  );
}

function NoMetaData() {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-14 text-center">
      <Megaphone className="h-10 w-10 text-muted mx-auto mb-3" />
      <p className="font-semibold">Nenhum dado da Meta ainda</p>
      <p className="text-sm text-muted mt-1">Configure o token e a conta de anúncios na aba Configuração e clique em “Sincronizar agora”.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Criativos                                                           */
/* ------------------------------------------------------------------ */

type CreativeSort = "spend" | "crm" | "cpl" | "ctr";

function Creatives({ data }: { data: MarketingData }) {
  const perf = usePerformance(data, "ad");
  const [sort, setSort] = useState<CreativeSort>("spend");
  const campaignName = new Map(data.campaigns.map((c) => [c.id, c.name]));

  if (!data.ads.length) return <NoMetaData />;

  const score = (a: MetaAd) => {
    const p = perf.get(a.id);
    if (!p) return -Infinity;
    if (sort === "spend") return p.spend;
    if (sort === "crm") return p.crmLeads;
    if (sort === "ctr") return ratio(p.link_clicks, p.impressions) ?? -1;
    const cpl = ratio(p.spend, p.crmLeads);
    return cpl === null ? -Infinity : -cpl;
  };
  const ads = data.ads.filter((a) => perf.has(a.id)).sort((a, b) => score(b) - score(a));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-sm text-muted">Ordenar por</span>
        <PillTabs<CreativeSort> value={sort} onChange={setSort} options={[
          { key: "spend", label: "Investimento" }, { key: "crm", label: "Leads CRM" }, { key: "cpl", label: "Menor CPL" }, { key: "ctr", label: "CTR" },
        ]} />
      </div>
      {ads.length === 0 && <p className="text-sm text-muted">Nenhum anúncio com veiculação no período.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {ads.map((a) => {
          const p = perf.get(a.id)!;
          const img = a.thumbnail_url || a.image_url;
          return (
            <article key={a.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-square bg-bg relative">
                {img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : (
                  <div className="h-full w-full flex items-center justify-center text-muted text-sm">Sem prévia</div>
                )}
                {a.video_id && <span className="absolute left-2 top-2 rounded-full bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5">VÍDEO</span>}
                <span className="absolute right-2 top-2"><StatusBadge status={a.effective_status} /></span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div>
                  <p className="font-semibold leading-tight break-words">{a.name}</p>
                  <p className="text-xs text-muted truncate">{(a.campaign_id && campaignName.get(a.campaign_id)) ?? ""}</p>
                </div>
                {(a.title || a.body) && (
                  <p className="text-xs text-muted line-clamp-3 whitespace-pre-line">{a.title ? <strong className="text-text">{a.title} </strong> : null}{a.body}</p>
                )}
                <dl className="mt-auto grid grid-cols-3 gap-x-2 gap-y-2 pt-2 border-t border-border text-xs">
                  <Metric label="Investido" value={formatBRL(p.spend)} />
                  <Metric label="Impressões" value={fmtInt(p.impressions)} />
                  <Metric label="CTR" value={fmtPct(ratio(p.link_clicks, p.impressions))} />
                  <Metric label="CPC" value={fmtMoney(ratio(p.spend, p.link_clicks))} />
                  <Metric label="Result. Meta" value={fmtInt(p.leads + p.conversations)} />
                  <Metric label="Leads CRM" value={fmtInt(p.crmLeads)} />
                  <Metric label="CPL real" value={fmtMoney(ratio(p.spend, p.crmLeads))} />
                  <Metric label="Ganhos" value={fmtInt(p.won)} />
                  <Metric label="CTA" value={a.call_to_action?.replaceAll("_", " ").toLowerCase() ?? "—"} />
                </dl>
                {(a.permalink_url || a.link_url) && (
                  <a href={a.permalink_url ?? a.link_url!} target="_blank" rel="noopener noreferrer" className="text-xs text-green-dark font-semibold inline-flex items-center gap-1 mt-1">
                    <ExternalLink className="h-3 w-3" /> {a.permalink_url ? "Ver publicação" : "Ver destino"}
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-4">Prévias servidas pela Meta; o link da imagem expira e é renovado a cada sincronização.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted truncate">{label}</dt>
      <dd className="font-semibold tabular-nums truncate capitalize">{value}</dd>
    </div>
  );
}
