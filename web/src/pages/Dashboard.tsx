import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";

interface DayTotals {
  date: string;
  label: string;
  receita: number;
  despesa: number;
}

interface TopDish {
  name: string;
  quantity: number;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<DayTotals[]>([]);
  const [receitaTotal, setReceitaTotal] = useState(0);
  const [despesaTotal, setDespesaTotal] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [topDishes, setTopDishes] = useState<TopDish[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const days = last7Days();
    const sinceIso = `${days[0]}T00:00:00`;

    const [financialRes, ordersRes] = await Promise.all([
      supabase
        .from("financial_records")
        .select("date, type, amount")
        .gte("date", days[0]),
      supabase
        .from("orders")
        .select("id, total, created_at, order_items(recipe_name, quantity)")
        .eq("status", "closed")
        .gte("created_at", sinceIso),
    ]);

    if (financialRes.error) setError(financialRes.error.message);
    if (ordersRes.error) setError(ordersRes.error.message);

    const byDay = new Map<string, { receita: number; despesa: number }>();
    for (const d of days) byDay.set(d, { receita: 0, despesa: 0 });

    let receita = 0;
    let despesa = 0;
    for (const record of financialRes.data ?? []) {
      const bucket = byDay.get(record.date);
      if (!bucket) continue;
      if (record.type === "income") {
        bucket.receita += Number(record.amount);
        receita += Number(record.amount);
      } else {
        bucket.despesa += Number(record.amount);
        despesa += Number(record.amount);
      }
    }

    setReceitaTotal(receita);
    setDespesaTotal(despesa);
    setChartData(
      days.map((d) => ({
        date: d,
        label: new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }),
        receita: byDay.get(d)!.receita,
        despesa: byDay.get(d)!.despesa,
      }))
    );

    const orders = ordersRes.data ?? [];
    setTicketMedio(orders.length > 0 ? orders.reduce((s, o) => s + Number(o.total), 0) / orders.length : 0);

    const dishCount = new Map<string, number>();
    for (const order of orders) {
      for (const item of (order.order_items as { recipe_name: string; quantity: number }[]) ?? []) {
        dishCount.set(item.recipe_name, (dishCount.get(item.recipe_name) ?? 0) + Number(item.quantity));
      }
    }
    setTopDishes(
      [...dishCount.entries()]
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 4)
    );

    setLoading(false);
  }

  const lucro = receitaTotal - despesaTotal;
  const maxDish = topDishes[0]?.quantity ?? 1;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl">Dashboard</h1>
        <span className="rounded-full bg-green/10 text-green-dark text-xs font-semibold px-3 py-1">
          Últimos 7 dias
        </span>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red/30 bg-red/5 text-red text-sm p-4">
          Não foi possível carregar os dados: {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Receita total" value={formatBRL(receitaTotal)} loading={loading} />
        <KpiCard label="Despesas" value={formatBRL(despesaTotal)} loading={loading} />
        <KpiCard
          label="Lucro líquido"
          value={formatBRL(lucro)}
          loading={loading}
          valueClassName={lucro >= 0 ? "text-text" : "text-red"}
        />
        <KpiCard label="Ticket médio" value={formatBRL(ticketMedio)} loading={loading} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted mb-4">Receitas vs Despesas · últimos 7 dias</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
              <Tooltip
                formatter={(value) => formatBRL(Number(value))}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
              />
              <Bar dataKey="receita" name="Receita" fill="var(--green)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesa" name="Despesa" fill="var(--sidebar-bg)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted mb-4">Pratos mais vendidos</h3>
          {topDishes.length === 0 ? (
            <p className="text-sm text-muted">Sem vendas nos últimos 7 dias.</p>
          ) : (
            <div className="space-y-4">
              {topDishes.map((dish) => (
                <div key={dish.name}>
                  <p className="text-sm font-semibold mb-1.5">{dish.name}</p>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green to-green-dark"
                      style={{ width: `${(dish.quantity / maxDish) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  valueClassName,
}: {
  label: string;
  value: string;
  loading: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="text-sm text-muted mb-2">{label}</p>
      <p className={`text-2xl font-bold ${valueClassName ?? ""}`}>{loading ? "..." : value}</p>
    </div>
  );
}
