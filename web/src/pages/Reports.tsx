import { Box, ChefHat, Download, FileSpreadsheet, Receipt, ShoppingCart, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBanner, Field, Modal, PageHeader, StatCard, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { exportCsv, exportPdf, type ReportTable } from "../lib/exporters";
import { formatBRL, formatDate, formatPercent, ingredientLineCost, localDateKey } from "../lib/format";
import { recipeCost } from "../lib/recipeCost";
import { supabase } from "../lib/supabase";

type ReportKey = "recipes" | "cash" | "shopping" | "inventory";

interface ReportDef {
  key: ReportKey;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const REPORTS: ReportDef[] = [
  {
    key: "recipes",
    title: "Fichas Técnicas",
    description: "Fichas técnicas completas das receitas com ingredientes, custos e precificação.",
    icon: ChefHat,
    color: "bg-blue-500",
  },
  {
    key: "cash",
    title: "Fechamento de Caixa",
    description: "Relatório diário ou mensal com vendas, formas de pagamento e despesas.",
    icon: Receipt,
    color: "bg-green",
  },
  {
    key: "shopping",
    title: "Lista de Compras",
    description: "Itens abaixo do estoque mínimo com quantidades e custos estimados.",
    icon: ShoppingCart,
    color: "bg-amber-500",
  },
  {
    key: "inventory",
    title: "Inventário",
    description: "Relatório completo do estoque atual com valores e status.",
    icon: Box,
    color: "bg-emerald-600",
  },
];

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  category: string;
  supplier: string | null;
  cost_per_unit: number;
  correction_factor: number;
  current_stock: number | null;
  min_stock: number | null;
}

interface RecipeRow {
  name: string;
  category: string;
  servings: number;
  preparation_time: number;
  target_margin: number;
  selling_price: number;
  recipe_ingredients: {
    quantity: number;
    ingredients: { name: string; unit: string; cost_per_unit: number; correction_factor: number } | null;
  }[];
}

function isLow(i: IngredientRow) {
  return i.min_stock != null && Number(i.current_stock ?? 0) <= Number(i.min_stock);
}

export function Reports() {
  const { restaurantName, can } = useAuth();
  const [counts, setCounts] = useState({ recipes: 0, ingredients: 0, toBuy: 0, salesToday: 0 });
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ReportDef | null>(null);
  const [cashMode, setCashMode] = useState<"day" | "month">("day");
  const [cashDate, setCashDate] = useState(localDateKey());
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    loadCounts();
  }, []);

  async function loadCounts() {
    const [recipesRes, ingredientsRes, salesRes] = await Promise.all([
      supabase.from("recipes").select("id", { count: "exact", head: true }),
      supabase.from("ingredients").select("current_stock, min_stock"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed")
        .gte("closed_at", new Date(`${localDateKey()}T00:00:00`).toISOString()),
    ]);
    const ings = (ingredientsRes.data ?? []) as Pick<IngredientRow, "current_stock" | "min_stock">[];
    setCounts({
      recipes: recipesRes.count ?? 0,
      ingredients: ings.length,
      toBuy: ings.filter((i) => isLow(i as IngredientRow)).length,
      salesToday: salesRes.count ?? 0,
    });
  }

  async function build(key: ReportKey): Promise<{ title: string; subtitle: string; tables: ReportTable[] } | null> {
    const generated = `${restaurantName ?? "Restaurante"} · gerado em ${new Date().toLocaleString("pt-BR")}`;

    if (key === "recipes") {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "name, category, servings, preparation_time, target_margin, selling_price, recipe_ingredients(quantity, ingredients(name, unit, cost_per_unit, correction_factor))"
        )
        .order("name");
      if (error) throw error;
      const recipes = (data as unknown as RecipeRow[]) ?? [];
      const summary: ReportTable = {
        title: "Resumo",
        headers: ["Receita", "Categoria", "Porções", "Custo", "Margem", "Preço de venda"],
        rows: recipes.map((r) => [
          r.name,
          r.category,
          r.servings,
          formatBRL(recipeCost(r)),
          formatPercent(Number(r.target_margin)),
          formatBRL(Number(r.selling_price)),
        ]),
      };
      const details: ReportTable[] = recipes.map((r) => ({
        title: `${r.name} — ${r.servings} porção(ões), ${r.preparation_time} min`,
        headers: ["Ingrediente", "Quantidade", "Custo un.", "Fator corr.", "Custo"],
        rows: r.recipe_ingredients.map((ri) => [
          ri.ingredients?.name ?? "—",
          `${Number(ri.quantity)} ${ri.ingredients?.unit ?? ""}`,
          formatBRL(Number(ri.ingredients?.cost_per_unit ?? 0)),
          Number(ri.ingredients?.correction_factor ?? 1),
          formatBRL(
            ri.ingredients
              ? ingredientLineCost(Number(ri.quantity), Number(ri.ingredients.cost_per_unit), Number(ri.ingredients.correction_factor))
              : 0
          ),
        ]),
        footer: ["Total", "", "", "", formatBRL(recipeCost(r))],
      }));
      return { title: "Fichas Técnicas", subtitle: generated, tables: [summary, ...details] };
    }

    if (key === "cash") {
      const [y, m] = cashDate.split("-").map(Number);
      const start = cashMode === "day" ? cashDate : `${cashDate.slice(0, 7)}-01`;
      const end = cashMode === "day" ? cashDate : localDateKey(new Date(y, m, 0));
      const { data, error } = await supabase
        .from("financial_records")
        .select("type, category, description, amount, payment_method, date")
        .gte("date", start)
        .lte("date", end)
        .order("date");
      if (error) throw error;
      const records = data ?? [];
      const income = records.filter((r) => r.type === "income");
      const expense = records.filter((r) => r.type === "expense");
      const sum = (rs: typeof records) => rs.reduce((s, r) => s + Number(r.amount), 0);

      const byMethod = new Map<string, number>();
      for (const r of income) {
        const k = r.payment_method ?? "Não informado";
        byMethod.set(k, (byMethod.get(k) ?? 0) + Number(r.amount));
      }
      const period = cashMode === "day" ? formatDate(cashDate) : `${String(m).padStart(2, "0")}/${y}`;

      return {
        title: `Fechamento de Caixa — ${period}`,
        subtitle: generated,
        tables: [
          {
            title: "Resumo",
            headers: ["Indicador", "Valor"],
            rows: [
              ["Entradas", formatBRL(sum(income))],
              ["Saídas", formatBRL(sum(expense))],
              ["Saldo do período", formatBRL(sum(income) - sum(expense))],
              ["Lançamentos de receita", income.length],
            ],
          },
          {
            title: "Entradas por forma de pagamento",
            headers: ["Forma de pagamento", "Valor"],
            rows: [...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, formatBRL(v)]),
            footer: ["Total", formatBRL(sum(income))],
          },
          {
            title: "Despesas",
            headers: ["Data", "Categoria", "Descrição", "Pagamento", "Valor"],
            rows: expense.map((r) => [formatDate(r.date), r.category, r.description ?? "", r.payment_method ?? "", formatBRL(Number(r.amount))]),
            footer: ["Total", "", "", "", formatBRL(sum(expense))],
          },
        ],
      };
    }

    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, unit, category, supplier, cost_per_unit, correction_factor, current_stock, min_stock")
      .order("category")
      .order("name");
    if (error) throw error;
    const ingredients = (data as IngredientRow[]) ?? [];

    if (key === "shopping") {
      const low = ingredients.filter(isLow);
      // Sugere repor até 2x o mínimo — margem simples pra não comprar no limite.
      const rows = low.map((i) => {
        const toBuy = Math.max(Number(i.min_stock) * 2 - Number(i.current_stock ?? 0), 0);
        return { i, toBuy, cost: toBuy * Number(i.cost_per_unit) };
      });
      return {
        title: "Lista de Compras",
        subtitle: `${generated} · sugestão de compra = 2× estoque mínimo − estoque atual`,
        tables: [
          {
            headers: ["Ingrediente", "Fornecedor", "Estoque atual", "Mínimo", "Comprar", "Custo estimado"],
            rows: rows.map(({ i, toBuy, cost }) => [
              i.name,
              i.supplier ?? "—",
              `${Number(i.current_stock ?? 0)} ${i.unit}`,
              `${Number(i.min_stock)} ${i.unit}`,
              `${Math.round(toBuy * 100) / 100} ${i.unit}`,
              formatBRL(cost),
            ]),
            footer: ["Total", "", "", "", "", formatBRL(rows.reduce((s, r) => s + r.cost, 0))],
          },
        ],
      };
    }

    const value = (i: IngredientRow) => Number(i.current_stock ?? 0) * Number(i.cost_per_unit);
    return {
      title: "Inventário",
      subtitle: generated,
      tables: [
        {
          headers: ["Ingrediente", "Categoria", "Estoque", "Mínimo", "Custo un.", "Valor em estoque", "Status"],
          rows: ingredients.map((i) => [
            i.name,
            i.category,
            `${Number(i.current_stock ?? 0)} ${i.unit}`,
            i.min_stock != null ? `${Number(i.min_stock)} ${i.unit}` : "—",
            formatBRL(Number(i.cost_per_unit)),
            formatBRL(value(i)),
            isLow(i) ? "Abaixo do mínimo" : "OK",
          ]),
          footer: ["Total", "", "", "", "", formatBRL(ingredients.reduce((s, i) => s + value(i), 0)), ""],
        },
      ],
    };
  }

  async function handleExport(format: "pdf" | "csv") {
    if (!active) return;
    setBuilding(true);
    setError(null);
    try {
      const report = await build(active.key);
      if (!report) return;
      if (format === "pdf") exportPdf(report.title, report.subtitle, report.tables);
      else exportCsv(`${report.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`, report.tables);
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "falha ao gerar relatório");
    } finally {
      setBuilding(false);
    }
  }

  // Cada relatório depende de uma permissão de leitura diferente.
  const allowed: Record<ReportKey, boolean> = {
    recipes: can("recipes.view"),
    cash: can("financial.view"),
    shopping: can("ingredients.view"),
    inventory: can("ingredients.view"),
  };

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Gere e exporte relatórios em PDF ou Excel" />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {REPORTS.map((r) => (
          <div key={r.key} className="bg-card border border-border rounded-2xl p-5 flex flex-col">
            <div className={`h-11 w-11 rounded-xl ${r.color} text-white flex items-center justify-center mb-4`}>
              <r.icon className="h-5 w-5" />
            </div>
            <p className="font-semibold text-lg">{r.title}</p>
            <p className="text-sm text-muted mt-1 flex-1">{r.description}</p>
            <button
              onClick={() => setActive(r)}
              disabled={!allowed[r.key]}
              title={allowed[r.key] ? undefined : "Sem permissão para este relatório"}
              className={`${secondaryButton} mt-5`}
            >
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Receitas cadastradas" value={counts.recipes} />
        <StatCard label="Ingredientes" value={counts.ingredients} />
        <StatCard label="Itens p/ comprar" value={counts.toBuy} valueClassName="text-amber-500" />
        <StatCard label="Vendas hoje" value={counts.salesToday} valueClassName="text-green-dark" />
      </div>

      {active && (
        <Modal title={`Exportar: ${active.title}`} onClose={() => setActive(null)}>
          <div className="space-y-4">
            {active.key === "cash" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Período">
                  <select value={cashMode} onChange={(e) => setCashMode(e.target.value as "day" | "month")} className={inputClass}>
                    <option value="day">Diário</option>
                    <option value="month">Mensal</option>
                  </select>
                </Field>
                <Field label={cashMode === "day" ? "Data" : "Qualquer dia do mês"}>
                  <input type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} className={inputClass} />
                </Field>
              </div>
            )}
            <p className="text-sm text-muted">{active.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleExport("pdf")} disabled={building} className={primaryButton}>
                <Download className="h-4 w-4" /> {building ? "Gerando..." : "PDF"}
              </button>
              <button onClick={() => handleExport("csv")} disabled={building} className={secondaryButton}>
                <FileSpreadsheet className="h-4 w-4" /> Excel (CSV)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
