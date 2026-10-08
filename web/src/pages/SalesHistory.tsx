import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { EmptyState, ErrorBanner, PageHeader, PillTabs, StatCard, inputClass } from "../components/ui";
import { PAYMENT_METHODS, formatBRL, formatDateTime, localDateKey } from "../lib/format";
import { supabase } from "../lib/supabase";

interface Sale {
  id: string;
  order_number: number;
  total: number;
  discount: number;
  payment_method: string | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  tables: { name: string } | null;
  order_items: { id: string; recipe_name: string; quantity: number; unit_price: number; subtotal: number }[];
}

type Period = "today" | "7d" | "30d" | "all";

function periodStart(period: Period): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "7d") d.setDate(d.getDate() - 6);
  if (period === "30d") d.setDate(d.getDate() - 29);
  return `${localDateKey(d)}T00:00:00`;
}

export function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [payment, setPayment] = useState("Todas");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [period]);

  async function load() {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, total, discount, payment_method, status, created_at, closed_at, tables(name), order_items(id, recipe_name, quantity, unit_price, subtotal)"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    const since = periodStart(period);
    if (since) query = query.gte("created_at", new Date(since).toISOString());
    const { data, error } = await query;
    if (error) setError(error.message);
    setSales((data as unknown as Sale[]) ?? []);
    setLoading(false);
  }

  const filtered = sales.filter((s) => payment === "Todas" || s.payment_method === payment);
  const closed = filtered.filter((s) => s.status === "closed");

  const revenue = closed.reduce((sum, s) => sum + Number(s.total), 0);
  const stats = {
    count: closed.length,
    revenue,
    ticket: closed.length ? revenue / closed.length : 0,
    items: closed.reduce((sum, s) => sum + s.order_items.reduce((a, i) => a + Number(i.quantity), 0), 0),
  };

  return (
    <div>
      <PageHeader title="Histórico de Vendas" subtitle="Todas as vendas do PDV e das mesas" icon={ClipboardList} />

      <ErrorBanner message={error} />

      <div className="flex items-center justify-between gap-3 mb-6">
        <PillTabs
          value={period}
          onChange={setPeriod}
          options={[
            { key: "today", label: "Hoje" },
            { key: "7d", label: "7 dias" },
            { key: "30d", label: "30 dias" },
            { key: "all", label: "Tudo" },
          ]}
        />
        <select value={payment} onChange={(e) => setPayment(e.target.value)} className={`${inputClass} max-w-[220px]`}>
          <option>Todas</option>
          {PAYMENT_METHODS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Vendas fechadas" value={loading ? "..." : stats.count} />
        <StatCard label="Faturamento" value={loading ? "..." : formatBRL(stats.revenue)} valueClassName="text-green-dark" />
        <StatCard label="Ticket médio" value={loading ? "..." : formatBRL(stats.ticket)} />
        <StatCard label="Itens vendidos" value={loading ? "..." : stats.items} />
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma venda no período" description="As vendas finalizadas no PDV e nas mesas aparecem aqui." />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-muted text-xs uppercase">
              <tr>
                <th className="w-10" />
                <th className="text-left px-5 py-3 font-medium">Venda</th>
                <th className="text-left px-5 py-3 font-medium">Data</th>
                <th className="text-left px-5 py-3 font-medium">Origem</th>
                <th className="text-left px-5 py-3 font-medium">Pagamento</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-muted">Carregando...</td>
                </tr>
              ) : (
                filtered.map((sale) => {
                  const isOpen = expanded === sale.id;
                  return (
                    <Fragment key={sale.id}>
                      <tr
                        className="border-t border-border cursor-pointer hover:bg-bg/60"
                        onClick={() => setExpanded(isOpen ? null : sale.id)}
                      >
                        <td className="pl-4 text-muted">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-5 py-3 font-semibold">#{sale.order_number}</td>
                        <td className="px-5 py-3">{formatDateTime(sale.closed_at ?? sale.created_at)}</td>
                        <td className="px-5 py-3 text-muted">{sale.tables?.name ?? "Balcão"}</td>
                        <td className="px-5 py-3 text-muted">{sale.payment_method ?? "—"}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              sale.status === "closed" ? "bg-green/15 text-green-dark" : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {sale.status === "closed" ? "Fechada" : "Aberta"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold">{formatBRL(Number(sale.total))}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-bg/60">
                          <td />
                          <td colSpan={6} className="px-5 py-3">
                            {sale.order_items.length === 0 ? (
                              <p className="text-muted">Sem itens.</p>
                            ) : (
                              <ul className="space-y-1">
                                {sale.order_items.map((item) => (
                                  <li key={item.id} className="flex justify-between max-w-lg">
                                    <span>
                                      {Number(item.quantity)}x {item.recipe_name}{" "}
                                      <span className="text-muted">({formatBRL(Number(item.unit_price))})</span>
                                    </span>
                                    <span>{formatBRL(Number(item.subtotal))}</span>
                                  </li>
                                ))}
                                {Number(sale.discount) > 0 && (
                                  <li className="flex justify-between max-w-lg text-red">
                                    <span>Desconto</span>
                                    <span>- {formatBRL(Number(sale.discount))}</span>
                                  </li>
                                )}
                              </ul>
                            )}
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
      )}
    </div>
  );
}
