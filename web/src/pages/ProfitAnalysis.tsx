import { ChefHat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorBanner, PageHeader, PillTabs, StatCard } from "../components/ui";
import { formatBRL, formatPercent, localDateKey } from "../lib/format";
import { recipeCost, type CostedIngredient } from "../lib/recipeCost";
import { supabase } from "../lib/supabase";

interface RecipeRow {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  recipe_ingredients: CostedIngredient[];
}

interface Analysis {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  profit: number;
  margin: number;
  sold: number;
  totalProfit: number;
}

type SortKey = "margin" | "profit" | "totalProfit";

function marginTone(margin: number) {
  if (margin >= 60) return { label: "Ótima", badge: "bg-green/15 text-green-dark", bar: "var(--green)" };
  if (margin >= 40) return { label: "Boa", badge: "bg-yellow-100 text-yellow-800", bar: "#e5a823" };
  return { label: "Baixa", badge: "bg-red/10 text-red", bar: "var(--red)" };
}

export function ProfitAnalysis() {
  const [rows, setRows] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("margin");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const since = new Date();
    since.setDate(since.getDate() - 29);

    const [recipesRes, salesRes] = await Promise.all([
      supabase
        .from("recipes")
        .select("id, name, category, selling_price, recipe_ingredients(quantity, ingredients(cost_per_unit, correction_factor))")
        .eq("is_active", true),
      supabase
        .from("orders")
        .select("order_items(recipe_id, quantity)")
        .eq("status", "closed")
        .gte("created_at", new Date(`${localDateKey(since)}T00:00:00`).toISOString()),
    ]);

    if (recipesRes.error) setError(recipesRes.error.message);

    // Vendas são opcionais: um membro só com profit.view não lê orders, e a
    // análise de margem continua útil sem a coluna de volume.
    const soldByRecipe = new Map<string, number>();
    for (const order of (salesRes.data ?? []) as { order_items: { recipe_id: string; quantity: number }[] }[]) {
      for (const item of order.order_items) {
        soldByRecipe.set(item.recipe_id, (soldByRecipe.get(item.recipe_id) ?? 0) + Number(item.quantity));
      }
    }

    setRows(
      ((recipesRes.data as unknown as RecipeRow[]) ?? []).map((r) => {
        const cost = recipeCost(r);
        const price = Number(r.selling_price);
        const profit = price - cost;
        const sold = soldByRecipe.get(r.id) ?? 0;
        return {
          id: r.id,
          name: r.name,
          category: r.category,
          price,
          cost,
          profit,
          margin: price > 0 ? (profit / price) * 100 : 0,
          sold,
          totalProfit: profit * sold,
        };
      })
    );
    setLoading(false);
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => b[sort] - a[sort]), [rows, sort]);

  const summary = useMemo(() => {
    const withPrice = rows.filter((r) => r.price > 0);
    const avgMargin = withPrice.length ? withPrice.reduce((s, r) => s + r.margin, 0) / withPrice.length : 0;
    const best = [...withPrice].sort((a, b) => b.margin - a.margin)[0];
    const totalProfit = rows.reduce((s, r) => s + r.totalProfit, 0);
    const lowCount = withPrice.filter((r) => r.margin < 40).length;
    return { avgMargin, best, totalProfit, lowCount };
  }, [rows]);

  const chartData = sorted.slice(0, 10).map((r) => ({ name: r.name, margem: Number(r.margin.toFixed(1)) }));

  return (
    <div>
      <PageHeader title="Análise de Lucratividade" subtitle="Visualize a rentabilidade de cada prato" />

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="Nenhuma receita ativa encontrada"
          description="Cadastre receitas com ingredientes e preço de venda para ver a análise de lucratividade"
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Margem média" value={formatPercent(summary.avgMargin)} valueClassName="text-green-dark" />
            <StatCard label="Prato mais rentável" value={<span className="text-lg">{summary.best?.name ?? "—"}</span>} />
            <StatCard label="Lucro bruto (30 dias)" value={formatBRL(summary.totalProfit)} />
            <StatCard
              label="Pratos com margem baixa"
              value={summary.lowCount}
              valueClassName={summary.lowCount > 0 ? "text-red" : ""}
            />
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-muted mb-4">Margem de contribuição por prato (%)</h3>
            <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 120)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} unit="%" />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={160} />
                <Tooltip
                  formatter={(value) => `${value}%`}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                />
                <Bar dataKey="margem" name="Margem" radius={[0, 6, 6, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={marginTone(d.margem).bar} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base">Detalhamento</h3>
            <PillTabs
              value={sort}
              onChange={setSort}
              options={[
                { key: "margin", label: "Maior margem" },
                { key: "profit", label: "Maior lucro unitário" },
                { key: "totalProfit", label: "Maior lucro total" },
              ]}
            />
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Prato</th>
                  <th className="text-right px-5 py-3 font-medium">Preço</th>
                  <th className="text-right px-5 py-3 font-medium">Custo</th>
                  <th className="text-right px-5 py-3 font-medium">Lucro un.</th>
                  <th className="text-right px-5 py-3 font-medium">Margem</th>
                  <th className="text-right px-5 py-3 font-medium">Vendidos (30d)</th>
                  <th className="text-right px-5 py-3 font-medium">Lucro total</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const tone = marginTone(r.margin);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-5 py-3">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted">{r.category}</p>
                      </td>
                      <td className="px-5 py-3 text-right">{formatBRL(r.price)}</td>
                      <td className="px-5 py-3 text-right text-muted">{formatBRL(r.cost)}</td>
                      <td className={`px-5 py-3 text-right font-medium ${r.profit < 0 ? "text-red" : ""}`}>{formatBRL(r.profit)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tone.badge}`}>
                          {formatPercent(r.margin)} · {tone.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">{r.sold}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatBRL(r.totalProfit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
