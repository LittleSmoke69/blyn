import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

interface Recipe {
  id: string;
  name: string;
  category: string;
  selling_price: number;
}

interface TableOption {
  id: string;
  name: string;
}

interface CartItem {
  recipe_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Pdv() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableId, setTableId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Dinheiro");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    supabase
      .from("recipes")
      .select("id, name, category, selling_price")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setRecipes(data ?? []));
    supabase
      .from("tables")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTables(data ?? []));
  }, []);

  // Categorias derivadas dos dados reais, não uma lista hardcoded que pode
  // divergir do enum de verdade (era exatamente o bug do sistema de
  // referência: o filtro do PDV nunca batia com as categorias reais).
  const categories = useMemo(
    () => ["Todos", ...new Set(recipes.map((r) => r.category))],
    [recipes]
  );

  const filtered = recipes.filter(
    (r) =>
      (category === "Todos" || r.category === category) &&
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  function addToCart(recipe: Recipe) {
    setCart((prev) => {
      const existing = prev.find((i) => i.recipe_id === recipe.id);
      if (existing) {
        return prev.map((i) => (i.recipe_id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { recipe_id: recipe.id, name: recipe.name, unit_price: Number(recipe.selling_price), quantity: 1 }];
    });
  }

  function changeQuantity(recipeId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.recipe_id === recipeId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(recipeId: string) {
    setCart((prev) => prev.filter((i) => i.recipe_id !== recipeId));
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  async function finalizeSale() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setMessage(null);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({ table_id: tableId || null, payment_method: paymentMethod })
      .select()
      .single();

    if (orderError || !order) {
      setMessage({ type: "err", text: orderError?.message ?? "falha ao criar venda" });
      setSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      cart.map((item) => ({
        order_id: order.id,
        recipe_id: item.recipe_id,
        recipe_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.unit_price * item.quantity,
      }))
    );

    if (itemsError) {
      setMessage({ type: "err", text: itemsError.message });
      setSubmitting(false);
      return;
    }

    const { error: closeError } = await supabase.rpc("close_order", { p_order_id: order.id });
    if (closeError) {
      setMessage({ type: "err", text: `venda criada, mas falha ao fechar: ${closeError.message}` });
    } else {
      setMessage({ type: "ok", text: `Venda #${order.order_number} finalizada com sucesso.` });
      setCart([]);
      setTableId("");
    }
    setSubmitting(false);
  }

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6 h-[calc(100vh-4rem)]">
      <div>
        <h1 className="text-2xl mb-4">PDV</h1>
        <input
          type="text"
          placeholder="Buscar prato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm mb-3 outline-none focus:ring-2 focus:ring-green"
        />
        <div className="flex gap-2 flex-wrap mb-5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                category === c
                  ? "bg-green text-white border-green"
                  : "border-border text-muted hover:border-green"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted text-sm">Nenhum prato encontrado.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => addToCart(recipe)}
                className="text-left bg-card border border-border rounded-xl p-4 hover:border-green transition-colors"
              >
                <p className="font-semibold text-sm mb-1">{recipe.name}</p>
                <p className="text-green-dark font-bold">{formatBRL(Number(recipe.selling_price))}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
        <h3 className="flex items-center gap-2 font-semibold mb-4">
          <ShoppingCart className="h-4 w-4" /> Carrinho
        </h3>

        {cart.length === 0 ? (
          <p className="text-sm text-muted flex-1 flex items-center justify-center text-center">Carrinho vazio</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3">
            {cart.map((item) => (
              <div key={item.recipe_id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted">{formatBRL(item.unit_price)}</p>
                </div>
                <button onClick={() => changeQuantity(item.recipe_id, -1)} className="p-1 rounded hover:bg-bg">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-sm w-5 text-center">{item.quantity}</span>
                <button onClick={() => changeQuantity(item.recipe_id, 1)} className="p-1 rounded hover:bg-bg">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeFromCart(item.recipe_id)} className="p-1 rounded hover:bg-red/10 text-red">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border mt-4 pt-4 space-y-3">
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="">Sem mesa (balcão)</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            {["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{formatBRL(subtotal)}</span>
          </div>

          {message && (
            <p className={`text-xs ${message.type === "ok" ? "text-green-dark" : "text-red"}`}>{message.text}</p>
          )}

          <button
            onClick={finalizeSale}
            disabled={cart.length === 0 || submitting}
            className="w-full rounded-lg bg-green text-white font-semibold py-2.5 text-sm hover:bg-green-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Finalizando..." : "Finalizar Venda"}
          </button>
        </div>
      </div>
    </div>
  );
}
