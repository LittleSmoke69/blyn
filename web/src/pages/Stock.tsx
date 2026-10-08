import { AlertTriangle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  category: string;
  current_stock: number | null;
  min_stock: number | null;
  cost_per_unit: number;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Stock() {
  const { ownerId } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);

  const [ingredientId, setIngredientId] = useState("");
  const [type, setType] = useState<"entrada" | "ajuste">("entrada");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("ingredients")
      .select("id, name, unit, category, current_stock, min_stock, cost_per_unit")
      .order("name");
    setIngredients(data ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ingredientId || !quantity) return;
    setSubmitting(true);
    setMessage(null);

    const { error } = await supabase.from("stock_movements").insert({
      user_id: ownerId,
      ingredient_id: ingredientId,
      type,
      quantity: Number(quantity),
      unit_cost: type === "entrada" && unitCost ? Number(unitCost) : null,
      notes: notes || null,
    });

    if (error) {
      setMessage({ type: "err", text: error.message });
    } else {
      setMessage({ type: "ok", text: "Movimentação registrada." });
      setQuantity("");
      setUnitCost("");
      setNotes("");
      await load();
    }
    setSubmitting(false);
  }

  return (
    <div>
      <h1 className="text-2xl mb-6">Estoque</h1>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 mb-6 grid grid-cols-5 gap-3 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Ingrediente</label>
          <select
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "entrada" | "ajuste")}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="entrada">Entrada</option>
            <option value="ajuste">Ajuste</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Quantidade</label>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        {type === "entrada" && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Custo unitário</label>
            <input
              type="number"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
        )}
        <div className="col-span-5">
          <input
            type="text"
            placeholder="Observações (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-green text-white font-semibold px-5 py-2.5 text-sm hover:bg-green-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Registrando..." : "Registrar movimentação"}
          </button>
          {message && (
            <span className={`text-sm ${message.type === "ok" ? "text-green-dark" : "text-red"}`}>{message.text}</span>
          )}
        </div>
      </form>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Ingrediente</th>
              <th className="text-left px-5 py-3 font-medium">Categoria</th>
              <th className="text-right px-5 py-3 font-medium">Estoque atual</th>
              <th className="text-right px-5 py-3 font-medium">Estoque mínimo</th>
              <th className="text-right px-5 py-3 font-medium">Custo/un.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">
                  Carregando...
                </td>
              </tr>
            ) : ingredients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-muted">
                  Nenhum ingrediente cadastrado.
                </td>
              </tr>
            ) : (
              ingredients.map((i) => {
                const low = i.min_stock != null && (i.current_stock ?? 0) <= i.min_stock;
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium flex items-center gap-2">
                      {low && <AlertTriangle className="h-3.5 w-3.5 text-red" />}
                      {i.name}
                    </td>
                    <td className="px-5 py-3 text-muted">{i.category}</td>
                    <td className={`px-5 py-3 text-right font-medium ${low ? "text-red" : ""}`}>
                      {i.current_stock ?? 0} {i.unit}
                    </td>
                    <td className="px-5 py-3 text-right text-muted">
                      {i.min_stock ?? "—"} {i.min_stock != null ? i.unit : ""}
                    </td>
                    <td className="px-5 py-3 text-right">{formatBRL(Number(i.cost_per_unit))}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
