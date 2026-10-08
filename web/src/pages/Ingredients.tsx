import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { INGREDIENT_CATEGORIES, UNITS, formatBRL } from "../lib/format";
import { supabase } from "../lib/supabase";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  category: string;
  supplier: string | null;
  min_stock: number | null;
  current_stock: number | null;
  correction_factor: number;
}

interface FormState {
  name: string;
  unit: string;
  cost_per_unit: string;
  category: string;
  supplier: string;
  min_stock: string;
  correction_factor: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  unit: "kg",
  cost_per_unit: "",
  category: "Outros",
  supplier: "",
  min_stock: "",
  correction_factor: "1",
};

export function Ingredients() {
  const { ownerId, can } = useAuth();
  const canManage = can("ingredients.manage");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");

  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, unit, cost_per_unit, category, supplier, min_stock, current_stock, correction_factor")
      .order("name");
    if (error) setError(error.message);
    setIngredients(data ?? []);
    setLoading(false);
  }

  const categories = useMemo(() => ["Todas", ...new Set(ingredients.map((i) => i.category))], [ingredients]);

  const filtered = ingredients.filter(
    (i) =>
      (category === "Todas" || i.category === category) &&
      i.name.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(ingredient: Ingredient) {
    setEditing(ingredient);
    setForm({
      name: ingredient.name,
      unit: ingredient.unit,
      cost_per_unit: String(ingredient.cost_per_unit),
      category: ingredient.category,
      supplier: ingredient.supplier ?? "",
      min_stock: ingredient.min_stock != null ? String(ingredient.min_stock) : "",
      correction_factor: String(ingredient.correction_factor),
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: Number(form.cost_per_unit || 0),
      category: form.category,
      supplier: form.supplier.trim() || null,
      min_stock: form.min_stock ? Number(form.min_stock) : null,
      correction_factor: Number(form.correction_factor || 1),
    };

    // current_stock nunca é escrito aqui: só o ledger stock_movements altera
    // o estoque (ver migration stock_movements).
    const { error } = editing
      ? await supabase.from("ingredients").update(payload).eq("id", editing.id)
      : await supabase.from("ingredients").insert({ ...payload, user_id: ownerId });

    if (error) {
      setFormError(error.message);
    } else {
      setShowForm(false);
      await load();
    }
    setSaving(false);
  }

  async function handleDelete(ingredient: Ingredient) {
    if (!confirm(`Excluir o ingrediente "${ingredient.name}"?`)) return;
    const { error } = await supabase.from("ingredients").delete().eq("id", ingredient.id);
    if (error) {
      // FK on delete restrict em recipe_ingredients/stock_movements
      setError(
        error.code === "23503"
          ? `"${ingredient.name}" está em uso em fichas técnicas ou no histórico de estoque e não pode ser excluído.`
          : error.message
      );
    } else {
      await load();
    }
  }

  const update = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <PageHeader
        title="Ingredientes"
        subtitle="Cadastre os insumos usados nas suas fichas técnicas"
        action={
          canManage && (
            <button onClick={openCreate} className={primaryButton}>
              <Plus className="h-4 w-4" /> Novo Ingrediente
            </button>
          )
        }
      />

      <ErrorBanner message={error} />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar ingrediente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} max-w-xs`}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {!loading && ingredients.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum ingrediente cadastrado"
          description="Cadastre ingredientes para montar suas fichas técnicas e controlar o estoque"
          action={
            canManage && (
              <button onClick={openCreate} className={primaryButton}>
                <Plus className="h-4 w-4" /> Cadastrar primeiro ingrediente
              </button>
            )
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Nome</th>
                <th className="text-left px-5 py-3 font-medium">Categoria</th>
                <th className="text-left px-5 py-3 font-medium">Fornecedor</th>
                <th className="text-right px-5 py-3 font-medium">Custo/un.</th>
                <th className="text-right px-5 py-3 font-medium">Fator corr.</th>
                <th className="text-right px-5 py-3 font-medium">Estoque</th>
                {canManage && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-muted">Carregando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-muted">Nenhum ingrediente encontrado.</td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{i.name}</td>
                    <td className="px-5 py-3 text-muted">{i.category}</td>
                    <td className="px-5 py-3 text-muted">{i.supplier ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {formatBRL(Number(i.cost_per_unit))}/{i.unit}
                    </td>
                    <td className="px-5 py-3 text-right text-muted">{Number(i.correction_factor)}</td>
                    <td className="px-5 py-3 text-right">
                      {Number(i.current_stock ?? 0)} {i.unit}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(i)} className="p-1.5 rounded hover:bg-bg text-muted" aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(i)} className="p-1.5 rounded hover:bg-red/10 text-red" aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Editar ingrediente" : "Novo ingrediente"} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <Field label="Nome" className="col-span-2">
              <input required value={form.name} onChange={update("name")} className={inputClass} />
            </Field>
            <Field label="Categoria">
              <select value={form.category} onChange={update("category")} className={inputClass}>
                {INGREDIENT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Unidade">
              <select value={form.unit} onChange={update("unit")} className={inputClass}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Custo por unidade (R$)">
              <input type="number" step="0.0001" min="0" required value={form.cost_per_unit} onChange={update("cost_per_unit")} className={inputClass} />
            </Field>
            <Field label="Fator de correção">
              <input type="number" step="0.01" min="0.01" required value={form.correction_factor} onChange={update("correction_factor")} className={inputClass} />
            </Field>
            <Field label="Estoque mínimo">
              <input type="number" step="0.01" min="0" value={form.min_stock} onChange={update("min_stock")} className={inputClass} />
            </Field>
            <Field label="Fornecedor">
              <input value={form.supplier} onChange={update("supplier")} className={inputClass} />
            </Field>
            <p className="col-span-2 text-xs text-muted">
              O estoque atual é controlado pela tela de Estoque (entradas e ajustes) e pelas vendas.
            </p>
            {formError && <p className="col-span-2 text-sm text-red">{formError}</p>}
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className={secondaryButton}>Cancelar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
