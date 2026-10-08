import { Clock, FileText, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { RECIPE_CATEGORIES, formatBRL, formatPercent, ingredientLineCost } from "../lib/format";
import { recipeCost } from "../lib/recipeCost";
import { supabase } from "../lib/supabase";

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  correction_factor: number;
}

interface RecipeIngredientRow {
  ingredient_id: string;
  quantity: number;
  ingredients: IngredientOption | null;
}

interface Recipe {
  id: string;
  name: string;
  category: string;
  description: string | null;
  preparation_time: number;
  servings: number;
  target_margin: number;
  selling_price: number;
  is_active: boolean;
  recipe_ingredients: RecipeIngredientRow[];
}

interface Line {
  ingredient_id: string;
  quantity: string;
}

export function Recipes() {
  const { ownerId, can } = useAuth();
  const canManage = can("recipes.manage");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Pratos Principais");
  const [description, setDescription] = useState("");
  const [prepTime, setPrepTime] = useState("30");
  const [servings, setServings] = useState("1");
  const [margin, setMargin] = useState("60");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [recipesRes, ingredientsRes] = await Promise.all([
      supabase
        .from("recipes")
        .select(
          "id, name, category, description, preparation_time, servings, target_margin, selling_price, is_active, recipe_ingredients(ingredient_id, quantity, ingredients(id, name, unit, cost_per_unit, correction_factor))"
        )
        .order("name"),
      supabase.from("ingredients").select("id, name, unit, cost_per_unit, correction_factor").order("name"),
    ]);
    if (recipesRes.error) setError(recipesRes.error.message);
    setRecipes((recipesRes.data as unknown as Recipe[]) ?? []);
    setIngredients(ingredientsRes.data ?? []);
    setLoading(false);
  }

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  function openCreate() {
    setEditing(null);
    setName("");
    setCategory("Pratos Principais");
    setDescription("");
    setPrepTime("30");
    setServings("1");
    setMargin("60");
    setLines([{ ingredient_id: "", quantity: "" }]);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(recipe: Recipe) {
    setEditing(recipe);
    setName(recipe.name);
    setCategory(recipe.category);
    setDescription(recipe.description ?? "");
    setPrepTime(String(recipe.preparation_time));
    setServings(String(recipe.servings));
    setMargin(String(recipe.target_margin));
    setLines(recipe.recipe_ingredients.map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: String(ri.quantity) })));
    setFormError(null);
    setShowForm(true);
  }

  // Prévia com a mesma fórmula do recalc_recipe_price() no banco:
  // preço = custo / (1 - margem/100).
  const previewCost = lines.reduce((sum, l) => {
    const ing = ingredientById.get(l.ingredient_id);
    if (!ing || !l.quantity) return sum;
    return sum + ingredientLineCost(Number(l.quantity), Number(ing.cost_per_unit), Number(ing.correction_factor));
  }, 0);
  const marginNumber = Math.min(Number(margin || 0), 99);
  const previewPrice = Math.round((previewCost / (1 - marginNumber / 100)) * 100) / 100;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    if (new Set(validLines.map((l) => l.ingredient_id)).size !== validLines.length) {
      setFormError("Cada ingrediente só pode aparecer uma vez na ficha.");
      return;
    }
    if (Number(margin) >= 100 || Number(margin) < 0) {
      setFormError("A margem precisa estar entre 0 e 99%.");
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      name: name.trim(),
      category,
      description: description.trim() || null,
      preparation_time: Number(prepTime || 0),
      servings: Number(servings || 1),
      target_margin: Number(margin),
    };

    let recipeId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("recipes").update(payload).eq("id", editing.id);
      if (error) return fail(error.message);
      const { error: delError } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", editing.id);
      if (delError) return fail(delError.message);
    } else {
      const { data, error } = await supabase
        .from("recipes")
        .insert({ ...payload, user_id: ownerId })
        .select("id")
        .single();
      if (error || !data) return fail(error?.message ?? "falha ao criar receita");
      recipeId = data.id;
    }

    // O trigger recipe_ingredients_recalc_price atualiza selling_price a
    // cada linha inserida — o front nunca grava o preço direto.
    if (validLines.length > 0) {
      const { error } = await supabase.from("recipe_ingredients").insert(
        validLines.map((l) => ({ recipe_id: recipeId, ingredient_id: l.ingredient_id, quantity: Number(l.quantity) }))
      );
      if (error) return fail(error.message);
    }

    setSaving(false);
    setShowForm(false);
    await load();
  }

  function fail(message: string) {
    setFormError(message);
    setSaving(false);
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Excluir a ficha técnica "${recipe.name}"?`)) return;
    const { error } = await supabase.from("recipes").delete().eq("id", recipe.id);
    if (error) {
      setError(
        error.code === "23503"
          ? `"${recipe.name}" já tem vendas registradas e não pode ser excluída. Desative-a no Cardápio.`
          : error.message
      );
    } else {
      await load();
    }
  }

  return (
    <div>
      <PageHeader
        title="Fichas Técnicas"
        subtitle="Controle detalhado de custos e ingredientes com margem personalizável"
        action={
          canManage && (
            <button onClick={openCreate} className={primaryButton}>
              <Plus className="h-4 w-4" /> Nova Receita
            </button>
          )
        }
      />

      <ErrorBanner message={error} />

      <div className="relative max-w-md mb-5">
        <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar fichas técnicas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-9`}
        />
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma receita cadastrada"
          description="Crie suas fichas técnicas para controlar custos e margens"
          action={
            canManage && (
              <button onClick={openCreate} className={primaryButton}>
                <Plus className="h-4 w-4" /> Criar Primeira Receita
              </button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma receita encontrada.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((recipe) => {
            const cost = recipeCost(recipe);
            const price = Number(recipe.selling_price);
            return (
              <div key={recipe.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold">{recipe.name}</p>
                  {!recipe.is_active && (
                    <span className="text-[10px] uppercase font-semibold bg-border text-muted rounded-full px-2 py-0.5">Inativa</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3">{recipe.category}</p>
                <div className="flex gap-4 text-xs text-muted mb-4">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {recipe.preparation_time} min</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {recipe.servings} porç.</span>
                  <span>{recipe.recipe_ingredients.length} ingred.</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center bg-bg rounded-xl p-3 mb-4">
                  <div>
                    <p className="text-[11px] text-muted">Custo</p>
                    <p className="text-sm font-semibold">{formatBRL(cost)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Margem</p>
                    <p className="text-sm font-semibold">{formatPercent(Number(recipe.target_margin))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Preço</p>
                    <p className="text-sm font-bold text-green-dark">{formatBRL(price)}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-auto">
                    <button onClick={() => openEdit(recipe)} className={`${secondaryButton} flex-1`}>
                      <Pencil className="h-4 w-4" /> Editar
                    </button>
                    <button onClick={() => handleDelete(recipe)} className="rounded-lg border border-border px-3 text-red hover:border-red" aria-label="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Editar ficha técnica" : "Nova ficha técnica"} onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-4 gap-3">
              <Field label="Nome" className="col-span-2">
                <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Categoria" className="col-span-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                  {RECIPE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição" className="col-span-4">
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Preparo (min)">
                <input type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Porções">
                <input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Margem alvo (%)">
                <input type="number" step="0.1" min="0" max="99" required value={margin} onChange={(e) => setMargin(e.target.value)} className={inputClass} />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Ingredientes</p>
                <button
                  type="button"
                  onClick={() => setLines((l) => [...l, { ingredient_id: "", quantity: "" }])}
                  className="text-sm text-green-dark font-semibold flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </div>
              {ingredients.length === 0 ? (
                <p className="text-sm text-muted">Cadastre ingredientes na tela de Ingredientes primeiro.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const ing = ingredientById.get(line.ingredient_id);
                    const lineCost =
                      ing && line.quantity
                        ? ingredientLineCost(Number(line.quantity), Number(ing.cost_per_unit), Number(ing.correction_factor))
                        : 0;
                    return (
                      <div key={idx} className="grid grid-cols-[1fr_140px_110px_32px] gap-2 items-center">
                        <select
                          value={line.ingredient_id}
                          onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ingredient_id: e.target.value } : l)))}
                          className={inputClass}
                        >
                          <option value="">Selecione...</option>
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="Qtd."
                            value={line.quantity}
                            onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))}
                            className={`${inputClass} pr-10`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{ing?.unit ?? ""}</span>
                        </div>
                        <span className="text-sm text-right">{formatBRL(lineCost)}</span>
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded hover:bg-red/10 text-red"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 bg-bg rounded-xl p-4 text-center">
              <div>
                <p className="text-xs text-muted">Custo total</p>
                <p className="font-semibold">{formatBRL(previewCost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Custo por porção</p>
                <p className="font-semibold">{formatBRL(previewCost / Math.max(Number(servings || 1), 1))}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Preço de venda sugerido</p>
                <p className="font-bold text-green-dark">{formatBRL(previewPrice)}</p>
              </div>
            </div>

            {formError && <p className="text-sm text-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={secondaryButton}>Cancelar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar ficha"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
