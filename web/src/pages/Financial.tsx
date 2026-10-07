import { ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

interface FinancialRecord {
  id: string;
  type: "income" | "expense";
  category: string;
  category_type: "fixed" | "variable" | "app_fee" | "revenue";
  description: string | null;
  amount: number;
  payment_method: string | null;
  date: string;
}

const INCOME_CATEGORIES = ["Vendas", "Serviços", "Outros"];
const EXPENSE_CATEGORIES = ["Fornecedores", "Funcionários", "Aluguel", "Utilidades", "Marketing", "Outros"];
const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência"];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Financial() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [showForm, setShowForm] = useState(false);

  const [type, setType] = useState<"income" | "expense">("income");
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("financial_records").select("*").order("date", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }

  const { receitas, despesas } = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    for (const r of records) {
      if (r.type === "income") receitas += Number(r.amount);
      else despesas += Number(r.amount);
    }
    return { receitas, despesas };
  }, [records]);

  const filtered = records.filter((r) => filter === "all" || r.type === filter);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setSubmitting(true);
    setMessage(null);

    const categoryType = type === "income" ? "revenue" : category === "Aluguel" ? "fixed" : "variable";

    const { error } = await supabase.from("financial_records").insert({
      type,
      category,
      category_type: categoryType,
      description: description || null,
      amount: Number(amount),
      payment_method: paymentMethod,
      date,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setDescription("");
      setAmount("");
      setShowForm(false);
      await load();
    }
    setSubmitting(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">Financeiro</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-green text-white font-semibold px-4 py-2 text-sm hover:bg-green-dark transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo Lançamento
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <ArrowUpCircle className="h-8 w-8 text-green" />
          <div>
            <p className="text-sm text-muted">Receitas</p>
            <p className="text-xl font-bold">{formatBRL(receitas)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <ArrowDownCircle className="h-8 w-8 text-red" />
          <div>
            <p className="text-sm text-muted">Despesas</p>
            <p className="text-xl font-bold">{formatBRL(despesas)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted mb-1">Saldo</p>
          <p className={`text-xl font-bold ${receitas - despesas >= 0 ? "text-green-dark" : "text-red"}`}>
            {formatBRL(receitas - despesas)}
          </p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 mb-6 grid grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Tipo</label>
            <select
              value={type}
              onChange={(e) => {
                const newType = e.target.value as "income" | "expense";
                setType(newType);
                setCategory(newType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
              }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              {(type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Valor</label>
            <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Pagamento</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-5">
            <input
              type="text"
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-5 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="rounded-lg bg-green text-white font-semibold px-5 py-2.5 text-sm hover:bg-green-dark transition-colors disabled:opacity-50">
              {submitting ? "Salvando..." : "Salvar lançamento"}
            </button>
            {message && <span className="text-sm text-red">{message}</span>}
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4">
        {[
          { key: "all", label: "Todos" },
          { key: "income", label: "Receitas" },
          { key: "expense", label: "Despesas" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as "all" | "income" | "expense")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
              filter === f.key ? "bg-green text-white border-green" : "border-border text-muted hover:border-green"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Data</th>
              <th className="text-left px-5 py-3 font-medium">Categoria</th>
              <th className="text-left px-5 py-3 font-medium">Descrição</th>
              <th className="text-left px-5 py-3 font-medium">Pagamento</th>
              <th className="text-right px-5 py-3 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">Carregando...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">Nenhum lançamento encontrado.</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-3">{new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                  <td className="px-5 py-3">{r.category}</td>
                  <td className="px-5 py-3 text-muted">{r.description ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{r.payment_method ?? "—"}</td>
                  <td className={`px-5 py-3 text-right font-medium ${r.type === "income" ? "text-green-dark" : "text-red"}`}>
                    {r.type === "income" ? "+" : "-"} {formatBRL(Number(r.amount))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
