import { CheckCircle2, Copy, KeyRound, Link2, PlugZap, RefreshCw, Save, Send, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorBanner, Field, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { callMeta, META_URL_TEMPLATE, SITE_EVENTS, type MetaSettingsView } from "./marketing";

const SITE_URL = "https://blynassessoria.com.br/";

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 min-w-0 break-all rounded-lg bg-bg border border-border px-3 py-2 text-xs">{value}</code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        className={secondaryButton}
      >
        <Copy className="h-4 w-4" /> {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function MarketingSettings({ onSynced }: { onSynced: () => void }) {
  const [s, setS] = useState<MetaSettingsView | null>(null);
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState({ ad_account_id: "", pixel_id: "", api_version: "v24.0", capi_test_event_code: "", sync_days: 30 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function apply(v: MetaSettingsView) {
    setS(v);
    setDraft({
      ad_account_id: v.ad_account_id ?? "",
      pixel_id: v.pixel_id ?? "",
      api_version: v.api_version,
      capi_test_event_code: v.capi_test_event_code ?? "",
      sync_days: v.sync_days,
    });
  }

  useEffect(() => {
    callMeta<MetaSettingsView>({ action: "get" }).then((r) => (r.error ? setError(r.error) : apply(r.data!)));
  }, []);

  async function run(name: string, body: Record<string, unknown>, ok: (data: Record<string, unknown>) => string) {
    setBusy(name);
    setError(null);
    setNotice(null);
    const r = await callMeta<Record<string, unknown>>(body);
    setBusy(null);
    if (r.error) {
      setNotice({ ok: false, text: r.error });
      return null;
    }
    setNotice({ ok: true, text: ok(r.data!) });
    return r.data!;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const data = await run("save", { action: "update", ...draft, ...(token.trim() ? { access_token: token.trim() } : {}) }, () => "Configuração salva.");
    if (data) {
      apply(data as unknown as MetaSettingsView);
      setToken("");
    }
  }

  async function toggle(field: "capi_enabled" | "auto_sync" | "custom_events_enabled" | "capi_custom_events", value: boolean) {
    const data = await run(field, { action: "update", [field]: value }, () => "Configuração salva.");
    if (data) apply(data as unknown as MetaSettingsView);
  }

  async function sync() {
    const data = await run("sync", { action: "sync" }, (d) =>
      `Sincronizado: ${d.campaigns} campanhas, ${d.adsets} conjuntos, ${d.ads} anúncios e ${d.insights} linhas de métricas (${d.since} a ${d.until}).`);
    if (data?.settings) apply(data.settings as MetaSettingsView);
    if (data) onSynced();
  }

  if (!s) return <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted">{error ?? "Carregando..."}</div>;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      {notice && (
        <div className={`rounded-xl border p-4 text-sm flex items-start gap-2 ${notice.ok ? "border-green/30 bg-green/5 text-green-dark" : "border-red/30 bg-red/5 text-red"}`}>
          {notice.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span className="break-words">{notice.text}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={save} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-lg flex items-center gap-2"><KeyRound className="h-5 w-5 text-green" /> Conexão com a Meta</h3>
            <p className="text-sm text-muted mt-1">
              Use um token de <strong>usuário do sistema</strong> do Business Manager com as permissões <code>ads_read</code> (e <code>ads_management</code> para
              a Conversions API), com acesso à conta de anúncios e ao pixel.
            </p>
          </div>
          <Field label={s.has_token ? `Token de acesso (salvo: ${s.token_hint}) — deixe vazio para manter` : "Token de acesso"}>
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB..." className={inputClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID da conta de anúncios">
              <input value={draft.ad_account_id} onChange={(e) => setDraft({ ...draft, ad_account_id: e.target.value })} placeholder="act_1234567890 ou só os números" className={inputClass} />
            </Field>
            <Field label="ID do pixel / conjunto de dados">
              <input value={draft.pixel_id} onChange={(e) => setDraft({ ...draft, pixel_id: e.target.value })} placeholder="1234567890" className={inputClass} />
            </Field>
            <Field label="Versão da Graph API">
              <input value={draft.api_version} onChange={(e) => setDraft({ ...draft, api_version: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Dias sincronizados">
              <input type="number" min={1} max={365} value={draft.sync_days} onChange={(e) => setDraft({ ...draft, sync_days: Number(e.target.value) })} className={inputClass} />
            </Field>
            <Field label="Código de evento de teste (CAPI)" className="sm:col-span-2">
              <input value={draft.capi_test_event_code} onChange={(e) => setDraft({ ...draft, capi_test_event_code: e.target.value })} placeholder="TEST12345 — deixe vazio em produção" className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!!busy} className={primaryButton}><Save className="h-4 w-4" /> Salvar</button>
            <button type="button" disabled={!!busy || !s.has_token} className={secondaryButton}
              onClick={() => run("test", { action: "test" }, (d) => {
                const acc = d.account as { name?: string; currency?: string } | null;
                const px = d.pixel as { name?: string } | null;
                return `Token ok (${(d.me as { name?: string })?.name ?? "usuário"})${acc ? ` · conta “${acc.name}” (${acc.currency})` : ""}${px ? ` · pixel “${px.name}”` : ""}.`;
              })}>
              <PlugZap className="h-4 w-4" /> Testar conexão
            </button>
            {s.has_token && (
              <button type="button" disabled={!!busy} className={secondaryButton}
                onClick={async () => { const d = await run("clear", { action: "update", clear_token: true }, () => "Token removido."); if (d) apply(d as unknown as MetaSettingsView); }}>
                Remover token
              </button>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="text-lg flex items-center gap-2"><RefreshCw className="h-5 w-5 text-green" /> Sincronização de campanhas</h3>
            <p className="text-sm text-muted">
              Puxa campanhas, conjuntos, anúncios com os criativos e as métricas diárias (investimento, impressões, alcance, cliques, leads e conversas)
              dos últimos {s.sync_days} dias.
            </p>
            <p className="text-sm">
              Última sincronização: <strong>{s.last_sync_at ? formatDateTime(s.last_sync_at) : "nunca"}</strong>
              {s.last_sync_error && <span className="block text-red text-xs mt-1 break-words">Último erro: {s.last_sync_error}</span>}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.auto_sync} disabled={!!busy} onChange={(e) => toggle("auto_sync", e.target.checked)} />
              Sincronizar automaticamente a cada 3 horas
            </label>
            <button onClick={sync} disabled={!!busy || !s.has_token || !s.ad_account_id} className={primaryButton}>
              <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} /> {busy === "sync" ? "Sincronizando..." : "Sincronizar agora"}
            </button>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="text-lg flex items-center gap-2"><Send className="h-5 w-5 text-green" /> Conversions API (eventos do servidor)</h3>
            <p className="text-sm text-muted">
              Cada lead novo do site vira um evento <strong>Lead</strong> na Meta, com _fbp, _fbc, IP, user-agent e e-mail/telefone/nome com hash SHA-256.
              Melhora a otimização e a atribuição das campanhas, mesmo com bloqueador de anúncios ou iOS.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.capi_enabled} disabled={!!busy || !s.pixel_id} onChange={(e) => toggle("capi_enabled", e.target.checked)} />
              Enviar leads para a Conversions API {!s.pixel_id && <span className="text-muted">(configure o pixel)</span>}
            </label>
            <button type="button" disabled={!!busy || !s.has_token || !s.pixel_id} className={secondaryButton}
              onClick={() => run("capi", { action: "test_capi" }, (d) => d.ok
                ? `Evento de teste enviado${d.test_event_code ? ` com o código ${d.test_event_code} — confira em Gerenciador de Eventos > Testar eventos` : " (sem código de teste: vai contar como evento real)"}.`
                : `Falhou: ${d.status}`)}>
              <Send className="h-4 w-4" /> Enviar evento de teste
            </button>
          </section>
        </div>
      </div>

      <PixelEvents s={s} busy={!!busy} onToggle={toggle} onSaveName={async (name) => {
        const data = await run("event", { action: "update", lead_event_name: name }, () => `Evento de lead agora é “${name}”.`);
        if (data) apply(data as unknown as MetaSettingsView);
      }} />

      <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h3 className="text-lg">Parâmetros de URL dos anúncios da Meta</h3>
        <p className="text-sm text-muted">
          No Gerenciador de Anúncios, em cada anúncio: <em>Destino → Parâmetros de URL</em>, cole o modelo abaixo. Assim cada lead fica ligado à campanha, ao
          conjunto e ao criativo exatos (por id — continua funcionando mesmo se o nome mudar).
        </p>
        <CopyBox value={META_URL_TEMPLATE} />
      </section>

      <UtmBuilder />
    </div>
  );
}

const PRESETS: { label: string; source: string; medium: string; campaign: string }[] = [
  { label: "Link da bio do Instagram", source: "instagram", medium: "bio", campaign: "perfil" },
  { label: "Stories", source: "instagram", medium: "stories", campaign: "" },
  { label: "Post / Reels", source: "instagram", medium: "social", campaign: "" },
  { label: "Status do WhatsApp", source: "whatsapp", medium: "social", campaign: "" },
  { label: "E-mail", source: "email", medium: "email", campaign: "" },
  { label: "Google Ads", source: "google", medium: "cpc", campaign: "" },
];

function UtmBuilder() {
  const [u, setU] = useState({ source: "instagram", medium: "bio", campaign: "perfil", content: "", term: "" });
  const params = new URLSearchParams();
  if (u.source) params.set("utm_source", u.source.trim().toLowerCase());
  if (u.medium) params.set("utm_medium", u.medium.trim().toLowerCase());
  if (u.campaign) params.set("utm_campaign", u.campaign.trim());
  if (u.content) params.set("utm_content", u.content.trim());
  if (u.term) params.set("utm_term", u.term.trim());
  const url = `${SITE_URL}${params.toString() ? `?${params}` : ""}`;

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg flex items-center gap-2"><Link2 className="h-5 w-5 text-green" /> Gerador de links rastreáveis (orgânico e outros canais)</h3>
        <p className="text-sm text-muted mt-1">
          Visitas sem UTM já são classificadas pelo referrer (Google → orgânico busca, Instagram/Facebook → orgânico social, outros sites → referência).
          Para separar bio, stories, posts, WhatsApp ou e-mail, use um link com UTM.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => setU({ ...u, source: p.source, medium: p.medium, campaign: p.campaign })}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-green">
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Origem (utm_source)"><input value={u.source} onChange={(e) => setU({ ...u, source: e.target.value })} className={inputClass} /></Field>
        <Field label="Mídia (utm_medium)"><input value={u.medium} onChange={(e) => setU({ ...u, medium: e.target.value })} className={inputClass} /></Field>
        <Field label="Campanha (utm_campaign)"><input value={u.campaign} onChange={(e) => setU({ ...u, campaign: e.target.value })} className={inputClass} /></Field>
        <Field label="Conteúdo (utm_content)"><input value={u.content} onChange={(e) => setU({ ...u, content: e.target.value })} className={inputClass} /></Field>
        <Field label="Termo (utm_term)"><input value={u.term} onChange={(e) => setU({ ...u, term: e.target.value })} className={inputClass} /></Field>
      </div>
      <CopyBox value={url} />
    </section>
  );
}

const LEAD_EVENT_OPTIONS = ["Lead", "CompleteRegistration", "Schedule", "SubmitApplication", "Contact"];

function PixelEvents({ s, busy, onToggle, onSaveName }: {
  s: MetaSettingsView;
  busy: boolean;
  onToggle: (field: "custom_events_enabled" | "capi_custom_events", value: boolean) => void;
  onSaveName: (name: string) => void;
}) {
  const standard = LEAD_EVENT_OPTIONS.includes(s.lead_event_name);
  const [mode, setMode] = useState(standard ? s.lead_event_name : "__custom");
  const [custom, setCustom] = useState(standard ? "" : s.lead_event_name);
  const name = mode === "__custom" ? custom.trim() : mode;

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg flex items-center gap-2"><Send className="h-5 w-5 text-green" /> Eventos do Pixel {s.pixel_id && <span className="text-sm font-normal text-muted">· {s.pixel_id}</span>}</h3>
        <p className="text-sm text-muted mt-1">
          Todo envio de formulário dispara o evento de lead no Pixel com <strong>correspondência avançada</strong> (e-mail, telefone, nome e id do visitante,
          com hash) e, como parâmetros, todas as respostas do formulário, UTMs e ids de campanha/conjunto/anúncio. O mesmo evento (mesmo event_id) vai
          pela Conversions API quando ela está ligada — a Meta conta uma vez só.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,260px)_auto] items-end">
        <Field label="Evento de lead">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            {LEAD_EVENT_OPTIONS.map((o) => <option key={o} value={o}>{o}{o === "Lead" ? " (padrão)" : ""}</option>)}
            <option value="__custom">Evento personalizado…</option>
          </select>
        </Field>
        {mode === "__custom" ? (
          <Field label="Nome do evento personalizado">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="LeadDemonstracao" className={inputClass} />
          </Field>
        ) : <div className="hidden sm:block" />}
        <button type="button" disabled={busy || !name || name === s.lead_event_name} onClick={() => onSaveName(name)} className={`${primaryButton} justify-self-start`}>
          <Save className="h-4 w-4" /> Salvar evento
        </button>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.custom_events_enabled} disabled={busy} onChange={(e) => onToggle("custom_events_enabled", e.target.checked)} />
          Disparar eventos de engajamento no Pixel
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.capi_custom_events} disabled={busy || !s.custom_events_enabled} onChange={(e) => onToggle("capi_custom_events", e.target.checked)} />
          Também enviar os eventos de engajamento pela Conversions API {!s.capi_enabled && <span className="text-muted">(a Conversions API está desligada)</span>}
        </label>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 pr-4 font-medium">Evento</th>
              <th className="pb-2 pr-4 font-medium">Quando dispara</th>
              <th className="pb-2 pr-4 font-medium">Tipo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-2 pr-4 font-mono text-xs">{s.lead_event_name}</td>
              <td className="py-2 pr-4">Envio de formulário (hero e rodapé) — com todos os dados</td>
              <td className="py-2 pr-4">{LEAD_EVENT_OPTIONS.includes(s.lead_event_name) ? "padrão" : "personalizado"}</td>
            </tr>
            {SITE_EVENTS.map((e) => (
              <tr key={e.name} className={`border-t border-border ${s.custom_events_enabled ? "" : "opacity-50"}`}>
                <td className="py-2 pr-4 font-mono text-xs">{e.name}</td>
                <td className="py-2 pr-4">{e.label}</td>
                <td className="py-2 pr-4">{e.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Para otimizar campanhas por um evento personalizado, crie uma <em>conversão personalizada</em> no Gerenciador de Eventos usando o nome dele.
      </p>
    </section>
  );
}
