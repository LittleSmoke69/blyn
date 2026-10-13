import { Bot, CheckCircle2, KeyRound, Lightbulb, PlugZap, Save, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorBanner, Field, PageHeader, StatCard, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

interface AiSettingsView {
  model: string;
  enabled: boolean;
  monthly_limit_per_account: number;
  has_key: boolean;
  key_hint: string | null;
}

interface AiFeature {
  key: string;
  name: string;
  area: string;
  audience: "restaurante" | "equipe_blyn";
  description: string;
  status: "available" | "planned";
  enabled: boolean;
  sort: number;
}

interface AiUsageRow {
  owner_id: string | null;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  success: boolean;
  error: string | null;
  created_at: string;
}

// US$ por 1M de tokens (entrada / saída), preços da API Anthropic — só pra estimativa.
const MODELS: { id: string; label: string; price: [number, number] }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (recomendado)", price: [4, 20] },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (mais barato)", price: [2, 10] },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (mais rápido e barato)", price: [0.1, 0.5] },
];

function estimateUsd(rows: AiUsageRow[]) {
  return rows.reduce((sum, r) => {
    const price = MODELS.find((m) => m.id === r.model)?.price;
    return price ? sum + (r.input_tokens * price[0] + r.output_tokens * price[1]) / 1_000_000 : sum;
  }, 0);
}

async function callAiSettings(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-ai-settings", { body });
  if (error) {
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) return { error: payload.error as string };
    } catch {
      // genérico
    }
    return { error: error.message };
  }
  return { data };
}

export function AdminAi() {
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [features, setFeatures] = useState<AiFeature[]>([]);
  const [usage, setUsage] = useState<AiUsageRow[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadFeatures();
    loadUsage();
  }, []);

  async function loadSettings() {
    const res = await callAiSettings({ action: "get" });
    if (res.error) setError(res.error);
    else setSettings(res.data as AiSettingsView);
  }

  async function loadFeatures() {
    const { data, error } = await supabase.from("ai_features").select("*").order("sort");
    if (error) setError(error.message);
    setFeatures((data as AiFeature[]) ?? []);
  }

  async function loadUsage() {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [usageRes, accRes] = await Promise.all([
      supabase.from("ai_usage").select("owner_id, feature, model, input_tokens, output_tokens, success, error, created_at")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      supabase.rpc("admin_list_accounts"),
    ]);
    if (usageRes.error) setError(usageRes.error.message);
    setUsage((usageRes.data as AiUsageRow[]) ?? []);
    setAccountNames(new Map(((accRes.data as { user_id: string; restaurant_name: string }[]) ?? []).map((a) => [a.user_id, a.restaurant_name])));
  }

  async function toggleFeature(f: AiFeature) {
    const { error } = await supabase.from("ai_features").update({ enabled: !f.enabled }).eq("key", f.key);
    if (error) setError(error.message);
    else loadFeatures();
  }

  const available = features.filter((f) => f.status === "available");
  const planned = features.filter((f) => f.status === "planned");

  return (
    <div>
      <PageHeader title="Inteligência Artificial" subtitle="Chave, modelo, limites e onde a IA é usada na plataforma" icon={Bot} />
      <ErrorBanner message={error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        {settings ? <SettingsCard settings={settings} onSaved={setSettings} /> : <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted">Carregando...</div>}

        <section className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-lg mb-1">Funcionalidades ativas</h3>
          <p className="text-sm text-muted mb-4">Já implementadas. Desligar aqui esconde a função para todos os restaurantes.</p>
          <div className="space-y-3">
            {available.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                <div>
                  <p className="font-semibold">{f.name} <span className="text-xs font-normal text-muted">· {f.area}</span></p>
                  <p className="text-sm text-muted mt-0.5">{f.description}</p>
                </div>
                <button
                  onClick={() => toggleFeature(f)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${f.enabled ? "bg-green/15 text-green-dark" : "bg-border text-muted"}`}
                >
                  {f.enabled ? "Ligada" : "Desligada"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <UsageSection usage={usage} accountNames={accountNames} limit={settings?.monthly_limit_per_account ?? null} features={features} />

      <section className="mt-6">
        <h3 className="text-lg mb-1 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-green" /> Onde mais aplicar IA</h3>
        <p className="text-sm text-muted mb-4">Mapeamento das próximas oportunidades na plataforma. Ainda não implementadas.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {planned.map((f) => (
            <div key={f.key} className="bg-card border border-dashed border-border rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{f.area}</span>
                <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${f.audience === "restaurante" ? "bg-blue-100 text-blue-800" : "bg-sidebar-bg text-white"}`}>
                  {f.audience === "restaurante" ? "Restaurante" : "Equipe Blyn"}
                </span>
              </div>
              <p className="font-semibold">{f.name}</p>
              <p className="text-sm text-muted mt-1">{f.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsCard({ settings, onSaved }: { settings: AiSettingsView; onSaved: (s: AiSettingsView) => void }) {
  const knownModel = MODELS.some((m) => m.id === settings.model);
  const [model, setModel] = useState(settings.model);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [limit, setLimit] = useState(String(settings.monthly_limit_per_account));
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await callAiSettings({
      action: "update",
      model,
      enabled,
      monthly_limit_per_account: Number(limit),
      api_key: apiKey.trim() || undefined,
    });
    setSaving(false);
    if (res.error) setMessage({ ok: false, text: res.error });
    else {
      setApiKey("");
      onSaved(res.data as AiSettingsView);
      setMessage({ ok: true, text: "Configuração salva." });
    }
  }

  async function removeKey() {
    if (!confirm("Remover a chave? A IA para de funcionar até uma nova chave ser cadastrada.")) return;
    const res = await callAiSettings({ action: "update", clear_key: true });
    if (res.error) setMessage({ ok: false, text: res.error });
    else onSaved(res.data as AiSettingsView);
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    const res = await callAiSettings({ action: "test" });
    setTesting(false);
    const data = res.data as { ok: boolean; error?: string; display_name?: string } | undefined;
    if (res.error || !data?.ok) setMessage({ ok: false, text: `Falhou: ${res.error ?? data?.error}` });
    else setMessage({ ok: true, text: `Conexão OK — ${data.display_name}.` });
  }

  return (
    <form onSubmit={save} className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">Configuração</h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${settings.enabled && settings.has_key ? "bg-green/15 text-green-dark" : "bg-border text-muted"}`}>
          {settings.enabled && settings.has_key ? "IA ativa" : "IA inativa"}
        </span>
      </div>

      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-green" />
        IA ligada na plataforma (interruptor geral)
      </label>

      <Field label="Chave da API Anthropic">
        <div className="space-y-2">
          {settings.has_key && (
            <p className="text-xs text-muted flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" /> Chave cadastrada terminando em <strong>{settings.key_hint}</strong>
              <button type="button" onClick={removeKey} className="text-red underline">remover</button>
            </p>
          )}
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.has_key ? "Cole uma nova chave para trocar" : "sk-ant-..."}
            className={inputClass}
          />
        </div>
      </Field>

      <Field label="Modelo">
        <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
          {!knownModel && <option value={settings.model}>{settings.model}</option>}
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Limite de leituras por restaurante / mês">
        <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} className={inputClass} />
      </Field>

      {message && (
        <p className={`text-sm flex items-center gap-1.5 ${message.ok ? "text-green-dark" : "text-red"}`}>
          {message.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={test} disabled={testing || !settings.has_key} className={secondaryButton}>
          <PlugZap className="h-4 w-4" /> {testing ? "Testando..." : "Testar conexão"}
        </button>
      </div>
      <p className="text-xs text-muted">A chave fica só no servidor; o navegador nunca recebe a chave completa.</p>
    </form>
  );
}

function UsageSection({
  usage,
  accountNames,
  limit,
  features,
}: {
  usage: AiUsageRow[];
  accountNames: Map<string, string>;
  limit: number | null;
  features: AiFeature[];
}) {
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);

  const ok = usage.filter((u) => u.success);
  const failures = usage.filter((u) => !u.success);

  const byAccount = useMemo(() => {
    const map = new Map<string, { month: number; total: number; last: string }>();
    for (const u of usage) {
      if (!u.owner_id || !u.success) continue;
      const entry = map.get(u.owner_id) ?? { month: 0, total: 0, last: u.created_at };
      entry.total++;
      if (new Date(u.created_at).getTime() >= monthStart) entry.month++;
      if (u.created_at > entry.last) entry.last = u.created_at;
      map.set(u.owner_id, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].month - a[1].month);
  }, [usage, monthStart]);

  const featureName = (key: string) => features.find((f) => f.key === key)?.name ?? key;

  return (
    <section className="mt-6">
      <h3 className="text-lg mb-3">Uso nos últimos 30 dias</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Leituras com sucesso" value={ok.length} valueClassName="text-green-dark" />
        <StatCard label="Falhas" value={failures.length} valueClassName={failures.length ? "text-red" : undefined} />
        <StatCard label="Restaurantes usando" value={byAccount.length} />
        <StatCard label="Custo estimado" value={`US$ ${estimateUsd(usage).toFixed(2)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Restaurante</th>
                <th className="text-left px-5 py-3 font-medium">Este mês</th>
                <th className="text-left px-5 py-3 font-medium">Último uso</th>
              </tr>
            </thead>
            <tbody>
              {byAccount.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-6 text-center text-muted">Nenhum uso ainda.</td></tr>
              ) : (
                byAccount.map(([ownerId, u]) => (
                  <tr key={ownerId} className="border-t border-border">
                    <td className="px-5 py-3">{accountNames.get(ownerId) ?? ownerId.slice(0, 8)}</td>
                    <td className="px-5 py-3">
                      {u.month}{limit !== null && <span className="text-muted"> / {limit}</span>}
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDateTime(u.last)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="font-semibold mb-3">Falhas recentes</p>
          {failures.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma falha.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {failures.slice(0, 8).map((f, i) => (
                <li key={i} className="border-t border-border pt-2 first:border-0 first:pt-0">
                  <p className="text-xs text-muted">
                    {formatDateTime(f.created_at)} · {featureName(f.feature)} · {f.owner_id ? accountNames.get(f.owner_id) ?? "—" : "—"}
                  </p>
                  <p className="text-red break-words">{f.error}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
