import { AlertTriangle, ChevronDown, ChevronRight, Copy, Webhook } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { ErrorBanner, PageHeader, PillTabs } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

interface WebhookEvent {
  id: string;
  source: string;
  event_type: string | null;
  payload: unknown;
  processed: boolean;
  processing_note: string | null;
  environment: "production" | "test";
  received_at: string;
}

interface WebhookUrls {
  domain_configured: boolean;
  note: string;
  production: { url: string };
  test: { url: string };
}

type Env = "all" | "production" | "test";

export function AdminEvents() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [urls, setUrls] = useState<WebhookUrls | null>(null);
  const [env, setEnv] = useState<Env>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions.invoke("admin-get-webhook-urls").then(({ data }) => setUrls(data as WebhookUrls));
  }, []);

  useEffect(() => {
    load();
  }, [env]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("webhook_events")
      .select("id, source, event_type, payload, processed, processing_note, environment, received_at")
      .order("received_at", { ascending: false })
      .limit(200);
    if (env !== "all") q = q.eq("environment", env);
    const { data, error } = await q;
    if (error) setError(error.message);
    setEvents((data as WebhookEvent[]) ?? []);
    setLoading(false);
  }

  return (
    <div>
      <PageHeader title="Webhooks" subtitle="Eventos recebidos de gateways de pagamento" icon={Webhook} />
      <ErrorBanner message={error} />

      {urls && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-muted mb-3">URLs para cadastrar no Mercado Pago</h3>
          {[
            ["Produção", urls.production.url],
            ["Teste", urls.test.url],
          ].map(([label, url]) => (
            <div key={label} className="flex items-center gap-3 bg-bg rounded-xl px-4 py-2.5 mb-2 text-sm">
              <span className="w-20 text-muted">{label}</span>
              <code className="flex-1 truncate">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)} className="text-muted hover:text-text" aria-label="Copiar">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className={`text-xs mt-2 flex items-start gap-1.5 ${urls.domain_configured ? "text-muted" : "text-amber-700"}`}>
            {!urls.domain_configured && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            {urls.note}
          </p>
        </div>
      )}

      <div className="mb-4">
        <PillTabs
          value={env}
          onChange={setEnv}
          options={[
            { key: "all", label: "Todos" },
            { key: "production", label: "Produção" },
            { key: "test", label: "Teste" },
          ]}
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-muted text-xs uppercase">
            <tr>
              <th className="w-10" />
              <th className="text-left px-5 py-3 font-medium">Recebido em</th>
              <th className="text-left px-5 py-3 font-medium">Origem</th>
              <th className="text-left px-5 py-3 font-medium">Evento</th>
              <th className="text-left px-5 py-3 font-medium">Ambiente</th>
              <th className="text-left px-5 py-3 font-medium">Processado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-muted">Carregando...</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-muted">Nenhum evento recebido.</td>
              </tr>
            ) : (
              events.map((ev) => {
                const open = expanded === ev.id;
                return (
                  <Fragment key={ev.id}>
                    <tr className="border-t border-border cursor-pointer hover:bg-bg/60" onClick={() => setExpanded(open ? null : ev.id)}>
                      <td className="pl-4 text-muted">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-5 py-3">{formatDateTime(ev.received_at)}</td>
                      <td className="px-5 py-3">{ev.source}</td>
                      <td className="px-5 py-3 text-muted">{ev.event_type ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ev.environment === "production" ? "bg-green/15 text-green-dark" : "bg-amber-100 text-amber-800"}`}>
                          {ev.environment === "production" ? "Produção" : "Teste"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{ev.processed ? "Sim" : "Não"}{ev.processing_note ? ` · ${ev.processing_note}` : ""}</td>
                    </tr>
                    {open && (
                      <tr className="bg-bg/60">
                        <td />
                        <td colSpan={5} className="px-5 py-3">
                          <pre className="text-xs whitespace-pre-wrap break-all max-h-80 overflow-auto">{JSON.stringify(ev.payload, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
