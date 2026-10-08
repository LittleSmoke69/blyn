import { Circle, LayoutGrid, Pencil, Plus, Square, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, StatCard, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { PAYMENT_METHODS, formatBRL, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";

type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  shape: "square" | "round";
  status: TableStatus;
}

interface OpenOrder {
  id: string;
  order_number: number;
  table_id: string;
  total: number;
  payment_method: string | null;
  created_at: string;
  order_items: { id: string; recipe_name: string; quantity: number; subtotal: number }[];
}

interface RecipeOption {
  id: string;
  name: string;
  selling_price: number;
}

const STATUS_LABEL: Record<TableStatus, string> = {
  available: "Disponível",
  occupied: "Ocupada",
  reserved: "Reservada",
  cleaning: "Limpeza",
};

const STATUS_STYLE: Record<TableStatus, string> = {
  available: "border-green/40 bg-green/5",
  occupied: "border-red/40 bg-red/5",
  reserved: "border-yellow-400/60 bg-yellow-50",
  cleaning: "border-blue-300 bg-blue-50",
};

const STATUS_BADGE: Record<TableStatus, string> = {
  available: "bg-green/15 text-green-dark",
  occupied: "bg-red/10 text-red",
  reserved: "bg-yellow-100 text-yellow-800",
  cleaning: "bg-blue-100 text-blue-800",
};

export function Tables() {
  const { ownerId, can } = useAuth();
  const canManage = can("tables.manage");
  const canSell = can("pdv.create");

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // modal de cadastro
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [shape, setShape] = useState<"square" | "round">("square");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // modal da comanda
  const [selected, setSelected] = useState<RestaurantTable | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("Dinheiro");
  const [recipeId, setRecipeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [tablesRes, ordersRes, recipesRes] = await Promise.all([
      supabase.from("tables").select("id, name, capacity, shape, status").order("name"),
      supabase
        .from("orders")
        .select("id, order_number, table_id, total, payment_method, created_at, order_items(id, recipe_name, quantity, subtotal)")
        .eq("status", "open")
        .not("table_id", "is", null),
      supabase.from("recipes").select("id, name, selling_price").eq("is_active", true).order("name"),
    ]);
    if (tablesRes.error) setError(tablesRes.error.message);
    setTables(tablesRes.data ?? []);
    setOpenOrders((ordersRes.data as OpenOrder[]) ?? []);
    setRecipes(recipesRes.data ?? []);
    setLoading(false);
  }

  const orderByTable = useMemo(() => new Map(openOrders.map((o) => [o.table_id, o])), [openOrders]);

  const stats = {
    total: tables.length,
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    capacity: tables.reduce((s, t) => s + t.capacity, 0),
    open: openOrders.reduce((s, o) => s + Number(o.total), 0),
  };

  function openCreate() {
    setEditing(null);
    setName(`Mesa ${tables.length + 1}`);
    setCapacity("4");
    setShape("square");
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(table: RestaurantTable) {
    setEditing(table);
    setName(table.name);
    setCapacity(String(table.capacity));
    setShape(table.shape);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim(), capacity: Number(capacity), shape };
    const { error } = editing
      ? await supabase.from("tables").update(payload).eq("id", editing.id)
      : await supabase.from("tables").insert({ ...payload, user_id: ownerId });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setShowForm(false);
    await load();
  }

  async function handleDelete(table: RestaurantTable) {
    if (orderByTable.has(table.id)) {
      setError(`${table.name} tem uma comanda aberta. Feche a comanda antes de excluir.`);
      return;
    }
    if (!confirm(`Excluir ${table.name}?`)) return;
    const { error } = await supabase.from("tables").delete().eq("id", table.id);
    if (error) setError(error.message);
    await load();
  }

  async function setStatus(table: RestaurantTable, status: TableStatus) {
    const { error } = await supabase.from("tables").update({ status }).eq("id", table.id);
    if (error) {
      setTabError(error.message);
      return;
    }
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status } : t)));
    setSelected((s) => (s && s.id === table.id ? { ...s, status } : s));
  }

  function openTab(table: RestaurantTable) {
    setSelected(table);
    setRecipeId("");
    setQuantity("1");
    setPaymentMethod("Dinheiro");
    setTabError(null);
  }

  async function startOrder() {
    if (!selected) return;
    setBusy(true);
    setTabError(null);
    // A forma de pagamento é gravada na abertura: orders não tem policy de
    // UPDATE (tabela append-only), e close_order() usa o valor gravado aqui.
    const { error } = await supabase
      .from("orders")
      .insert({ user_id: ownerId, table_id: selected.id, payment_method: paymentMethod });
    if (error) {
      setTabError(error.message);
    } else if (canManage) {
      await setStatus(selected, "occupied");
    }
    await load();
    setBusy(false);
  }

  async function addItem(order: OpenOrder) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const qty = Number(quantity);
    if (!recipe || !(qty > 0)) return;
    setBusy(true);
    setTabError(null);
    const unitPrice = Number(recipe.selling_price);
    const { error } = await supabase.from("order_items").insert({
      order_id: order.id,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      quantity: qty,
      unit_price: unitPrice,
      subtotal: Math.round(unitPrice * qty * 100) / 100,
    });
    if (error) setTabError(error.message);
    setRecipeId("");
    setQuantity("1");
    await load();
    setBusy(false);
  }

  async function closeTab(order: OpenOrder) {
    if (!selected) return;
    if (order.order_items.length === 0) {
      setTabError("Adicione ao menos um item antes de fechar a comanda.");
      return;
    }
    if (!confirm(`Fechar a comanda de ${selected.name} no valor de ${formatBRL(Number(order.total))}?`)) return;
    setBusy(true);
    setTabError(null);
    const { error } = await supabase.rpc("close_order", { p_order_id: order.id });
    if (error) {
      setTabError(error.message);
      setBusy(false);
      return;
    }
    if (canManage) await setStatus(selected, "cleaning");
    await load();
    setBusy(false);
    setSelected(null);
  }

  const selectedOrder = selected ? orderByTable.get(selected.id) : undefined;

  return (
    <div>
      <PageHeader
        title="Gestão de Mesas"
        subtitle="Controle suas mesas, comandas e pedidos"
        icon={LayoutGrid}
        action={
          canManage && (
            <button onClick={openCreate} className={primaryButton}>
              <Plus className="h-4 w-4" /> Nova Mesa
            </button>
          )
        }
      />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Disponíveis" value={stats.available} valueClassName="text-green-dark" />
        <StatCard label="Ocupadas" value={stats.occupied} valueClassName="text-red" />
        <StatCard label="Capacidade" icon={Users} value={stats.capacity} />
        <StatCard label="Em aberto" value={formatBRL(stats.open)} valueClassName="text-green-dark" />
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhuma mesa cadastrada"
          action={
            canManage && (
              <button onClick={openCreate} className={secondaryButton}>
                Criar primeira mesa
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {tables.map((table) => {
            const order = orderByTable.get(table.id);
            const ShapeIcon = table.shape === "round" ? Circle : Square;
            return (
              <div key={table.id} className={`rounded-2xl border-2 p-5 ${STATUS_STYLE[table.status]}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShapeIcon className="h-5 w-5 text-muted" />
                    <p className="font-bold">{table.name}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[table.status]}`}>
                    {STATUS_LABEL[table.status]}
                  </span>
                </div>
                <p className="text-sm text-muted flex items-center gap-1 mb-3">
                  <Users className="h-4 w-4" /> {table.capacity} lugares
                </p>
                {order ? (
                  <p className="text-sm mb-4">
                    Comanda #{order.order_number} · <span className="font-bold">{formatBRL(Number(order.total))}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted mb-4">Sem comanda aberta</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => openTab(table)} className={`${order ? primaryButton : secondaryButton} flex-1`}>
                    {order ? "Ver comanda" : "Abrir"}
                  </button>
                  {canManage && (
                    <>
                      <button onClick={() => openEdit(table)} className="p-2 rounded-lg hover:bg-white text-muted" aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(table)} className="p-2 rounded-lg hover:bg-white text-red" aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Editar mesa" : "Nova mesa"} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <Field label="Nome" className="col-span-2">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Capacidade (1 a 20)">
              <input type="number" min="1" max="20" required value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Formato">
              <select value={shape} onChange={(e) => setShape(e.target.value as "square" | "round")} className={inputClass}>
                <option value="square">Quadrada</option>
                <option value="round">Redonda</option>
              </select>
            </Field>
            {formError && <p className="col-span-2 text-sm text-red">{formError}</p>}
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className={secondaryButton}>Cancelar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.name} · ${STATUS_LABEL[selected.status]}`} onClose={() => setSelected(null)}>
          {canManage && (
            <div className="flex gap-2 mb-5 flex-wrap">
              {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(selected, s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                    selected.status === s ? "border-green bg-green text-white" : "border-border text-muted hover:border-green"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {!selectedOrder ? (
            canSell ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Nenhuma comanda aberta nesta mesa.</p>
                <Field label="Forma de pagamento">
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <button onClick={startOrder} disabled={busy} className={`${primaryButton} w-full`}>
                  {busy ? "Abrindo..." : "Abrir comanda"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhuma comanda aberta. Você não tem permissão para abrir comandas.</p>
            )
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Comanda #{selectedOrder.order_number} · aberta em {formatDateTime(selectedOrder.created_at)} · {selectedOrder.payment_method}
              </p>
              {selectedOrder.order_items.length === 0 ? (
                <p className="text-sm text-muted">Nenhum item lançado ainda.</p>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-xl">
                  {selectedOrder.order_items.map((item) => (
                    <li key={item.id} className="flex justify-between px-4 py-2.5 text-sm">
                      <span>
                        {Number(item.quantity)}x {item.recipe_name}
                      </span>
                      <span className="font-medium">{formatBRL(Number(item.subtotal))}</span>
                    </li>
                  ))}
                </ul>
              )}

              {canSell && (
                <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                  <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
                    <option value="">Adicionar prato...</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — {formatBRL(Number(r.selling_price))}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
                  <button onClick={() => addItem(selectedOrder)} disabled={busy || !recipeId} className={primaryButton}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">{formatBRL(Number(selectedOrder.total))}</span>
              </div>

              {canSell && (
                <button onClick={() => closeTab(selectedOrder)} disabled={busy} className={`${primaryButton} w-full`}>
                  {busy ? "Processando..." : "Fechar comanda"}
                </button>
              )}
            </div>
          )}
          {tabError && <p className="text-sm text-red mt-3">{tabError}</p>}
        </Modal>
      )}
    </div>
  );
}
