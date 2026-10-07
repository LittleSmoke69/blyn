import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface OrderItem {
  recipe_name: string;
  quantity: number;
}

interface PublicOrder {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  order_type: "delivery" | "table" | "pickup";
  status: "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";
  total: number;
  created_at: string;
  public_order_items: OrderItem[];
}

const STATUS_FLOW: Record<string, string | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
  delivered: null,
  cancelled: null,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green/15 text-green-dark",
  delivered: "bg-border text-muted",
  cancelled: "bg-red/10 text-red",
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OnlineOrders() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    load();

    // Realtime em vez de polling — public_orders já está habilitado pra
    // Realtime no backend (migration realtime_publication).
    const channel = supabase
      .channel("public_orders_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_orders" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    const { data } = await supabase
      .from("public_orders")
      .select("id, order_number, customer_name, customer_phone, order_type, status, total, created_at, public_order_items(recipe_name, quantity)")
      .order("created_at", { ascending: false });
    setOrders((data as PublicOrder[]) ?? []);
    setLoading(false);
  }

  async function advance(order: PublicOrder) {
    const next = STATUS_FLOW[order.status];
    if (!next) return;
    setBusyId(order.id);

    if (next === "delivered") {
      await supabase.rpc("complete_public_order", { p_order_id: order.id });
    } else {
      await supabase.from("public_orders").update({ status: next }).eq("id", order.id);
    }
    await load();
    setBusyId(null);
  }

  async function cancel(order: PublicOrder) {
    setBusyId(order.id);
    await supabase.from("public_orders").update({ status: "cancelled" }).eq("id", order.id);
    await load();
    setBusyId(null);
  }

  return (
    <div>
      <h1 className="text-2xl mb-6">Pedidos Online</h1>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : orders.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-16 text-center text-muted">
          Nenhum pedido ainda. Novos pedidos do cardápio digital aparecem aqui em tempo real.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold">#{order.order_number}</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[order.status]}`}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>
              <p className="font-semibold text-sm">{order.customer_name}</p>
              <p className="text-xs text-muted mb-3">
                {order.customer_phone} · {order.order_type}
              </p>
              <ul className="text-sm text-muted mb-3 space-y-0.5">
                {order.public_order_items.map((item, idx) => (
                  <li key={idx}>
                    {item.quantity}x {item.recipe_name}
                  </li>
                ))}
              </ul>
              <p className="font-bold mb-4">{formatBRL(Number(order.total))}</p>

              <div className="flex gap-2">
                {STATUS_FLOW[order.status] && (
                  <button
                    onClick={() => advance(order)}
                    disabled={busyId === order.id}
                    className="flex-1 rounded-lg bg-green text-white text-sm font-semibold py-2 hover:bg-green-dark transition-colors disabled:opacity-50"
                  >
                    {busyId === order.id ? "..." : `Marcar ${STATUS_LABEL[STATUS_FLOW[order.status]!]}`}
                  </button>
                )}
                {order.status !== "delivered" && order.status !== "cancelled" && (
                  <button
                    onClick={() => cancel(order)}
                    disabled={busyId === order.id}
                    className="rounded-lg border border-border text-sm font-medium px-3 py-2 text-muted hover:border-red hover:text-red transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
