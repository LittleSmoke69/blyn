import { FileBarChart, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBanner, PageHeader, PillTabs } from "../components/ui";
import { formatBRL, formatPercent, localDateKey } from "../lib/format";
import { recipeCost, type CostedIngredient } from "../lib/recipeCost";
import { supabase } from "../lib/supabase";

type Period = "month" | "quarter" | "year";

const PERIOD_LABEL: Record<Period, string> = {
  month: "Mês Atual",
  quarter: "Trimestre Atual",
  year: "Ano Atual",
};

function periodStart(period: Period) {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

interface DreValues {
  grossRevenue: number;
  appFees: number;
  netRevenue: number;
  cmv: number;
  grossProfit: number;
  fixed: number;
  variable: number;
  opex: number;
  netProfit: number;
}

const ZERO: DreValues = {
  grossRevenue: 0, appFees: 0, netRevenue: 0, cmv: 0, grossProfit: 0, fixed: 0, variable: 0, opex: 0, netProfit: 0,
};

type SoldLine = { recipe_id: string; quantity: number };

export function Dre() {
  const [period, setPeriod] = useState<Period>("month");
  const [values, setValues] = useState<DreValues>(ZERO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cmvPartial, setCmvPartial] = useState(false);

  useEffect(() => {
    load();
  }, [period]);

  async function load() {
    setLoading(true);
    setError(null);
    const start = periodStart(period);
    const startDate = localDateKey(start);
    const startIso = start.toISOString();

    const [financialRes, recipesRes, ordersRes, publicRes] = await Promise.all([
      supabase.from("financial_records").select("type, category_type, amount").gte("date", startDate),
      supabase.from("recipes").select("id, recipe_ingredients(quantity, ingredients(cost_per_unit, correction_factor))"),
      supabase.from("orders").select("order_items(recipe_id, quantity)").eq("status", "closed").gte("closed_at", startIso),
      supabase
        .from("public_orders")
        .select("public_order_items(recipe_id, quantity)")
        .eq("status", "delivered")
        .gte("completed_at", startIso),
    ]);

    if (financialRes.error) {
      setError(financialRes.error.message);
      setLoading(false);
      return;
    }

    let grossRevenue = 0;
    let appFees = 0;
    let fixed = 0;
    let variable = 0;
    for (const r of financialRes.data ?? []) {
      const amount = Number(r.amount);
      if (r.type === "income") grossRevenue += amount;
      else if (r.category_type === "app_fee") appFees += amount;
      else if (r.category_type === "fixed") fixed += amount;
      else variable += amount;
    }

    // CMV = Σ (qtd vendida × custo atual da ficha) sobre vendas fechadas e
    // pedidos online entregues no período. Se o usuário não tem acesso a
    // alguma dessas fontes, o CMV sai parcial e a nota de rodapé avisa.
    const costByRecipe = new Map(
      ((recipesRes.data as unknown as { id: string; recipe_ingredients: CostedIngredient[] }[]) ?? []).map((r) => [
        r.id,
        recipeCost(r),
      ])
    );
    const lines: SoldLine[] = [
      ...((ordersRes.data as { order_items: SoldLine[] }[] | null) ?? []).flatMap((o) => o.order_items),
      ...((publicRes.data as { public_order_items: SoldLine[] }[] | null) ?? []).flatMap((o) => o.public_order_items),
    ];
    const cmv = lines.reduce((sum, l) => sum + Number(l.quantity) * (costByRecipe.get(l.recipe_id) ?? 0), 0);
    setCmvPartial(!!(recipesRes.error || ordersRes.error || publicRes.error));

    const netRevenue = grossRevenue - appFees;
    const grossProfit = netRevenue - cmv;
    const opex = fixed + variable;
    setValues({
      grossRevenue, appFees, netRevenue, cmv, grossProfit, fixed, variable, opex, netProfit: grossProfit - opex,
    });
    setLoading(false);
  }

  const pct = (v: number) => (values.grossRevenue > 0 ? (v / values.grossRevenue) * 100 : 0);
  const grossMargin = pct(values.grossProfit);
  const netMargin = pct(values.netProfit);
  const show = (v: number) => (loading ? "..." : formatBRL(v));

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="DRE — Demonstrativo de Resultado"
        subtitle="Visão completa da rentabilidade do seu restaurante"
        icon={FileBarChart}
      />

      <div className="mb-6">
        <PillTabs
          value={period}
          onChange={setPeriod}
          options={(Object.keys(PERIOD_LABEL) as Period[]).map((k) => ({ key: k, label: PERIOD_LABEL[k] }))}
        />
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs text-muted flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-4 w-4 text-green" /> Receita Bruta
          </p>
          <p className="text-xl font-bold">{show(values.grossRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs text-muted flex items-center gap-1.5 mb-2">
            <Minus className="h-4 w-4 text-green" /> Margem Bruta
          </p>
          <p className={`text-xl font-bold ${grossMargin >= 0 ? "text-green-dark" : "text-red"}`}>
            {loading ? "..." : formatPercent(grossMargin)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs text-muted flex items-center gap-1.5 mb-2">
            {values.netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-green" /> : <TrendingDown className="h-4 w-4 text-red" />}
            Lucro Líquido
          </p>
          <p className={`text-xl font-bold ${values.netProfit >= 0 ? "text-green-dark" : "text-red"}`}>{show(values.netProfit)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <h3 className="px-6 py-4 border-b border-border text-base">Demonstrativo de Resultado — {PERIOD_LABEL[period]}</h3>
        <div className="text-sm">
          <Row label="Receita Bruta" value={show(values.grossRevenue)} strong />
          <Row label="(−) Taxas de Aplicativos" value={show(values.appFees)} sub />
          <Row label="Receita Líquida" value={show(values.netRevenue)} strong highlight />
          <Row label="(−) CMV (Custo da Mercadoria Vendida)" value={show(values.cmv)} strong />
          <Row label="Lucro Bruto" value={show(values.grossProfit)} percent={grossMargin} strong highlight />
          <Row label="(−) Despesas Fixas" value={show(values.fixed)} sub />
          <Row label="(−) Despesas Variáveis" value={show(values.variable)} sub />
          <Row label="(−) Total de Despesas Operacionais" value={show(values.opex)} strong />
        </div>
        <div className="p-3">
          <div
            className={`flex items-center justify-between rounded-xl px-4 py-4 ${
              values.netProfit >= 0 ? "bg-green/10" : "bg-red/10"
            }`}
          >
            <span className="font-bold flex items-center gap-2">
              {values.netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-green" /> : <TrendingDown className="h-5 w-5 text-red" />}
              Lucro Líquido
            </span>
            <span className="flex items-center gap-3">
              <span className="text-xs font-semibold bg-white/70 rounded-full px-2 py-0.5">{formatPercent(netMargin)}</span>
              <span className={`text-lg font-bold ${values.netProfit >= 0 ? "text-green-dark" : "text-red"}`}>{show(values.netProfit)}</span>
            </span>
          </div>
        </div>
        <p className="px-6 py-4 border-t border-border text-xs text-muted">
          * CMV calculado com base nas vendas fechadas e pedidos online entregues no período, usando o custo atual dos
          ingredientes de cada ficha técnica. Despesas classificadas pelo tipo do lançamento financeiro (fixa, variável
          ou taxa de aplicativo).
          {cmvPartial && " Atenção: você não tem acesso a todas as fontes de venda, então o CMV pode estar incompleto."}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  sub,
  highlight,
  percent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: boolean;
  highlight?: boolean;
  percent?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-3 border-b border-border ${highlight ? "bg-green/5" : ""}`}
    >
      <span className={`${strong ? "font-semibold" : ""} ${sub ? "pl-4 text-muted" : ""}`}>{label}</span>
      <span className="flex items-center gap-3">
        {percent !== undefined && (
          <span className="text-xs font-semibold text-green-dark bg-green/10 rounded-full px-2 py-0.5">{formatPercent(percent)}</span>
        )}
        <span className={strong ? "font-semibold" : ""}>{value}</span>
      </span>
    </div>
  );
}
