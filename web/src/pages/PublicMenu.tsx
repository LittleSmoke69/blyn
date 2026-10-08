import { CheckCircle2, Clock, ImageOff, MapPin, Minus, Phone, Plus, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Field, inputClass, primaryButton } from "../components/ui";
import { RECIPE_CATEGORIES, formatBRL } from "../lib/format";
import { publicSupabase } from "../lib/supabase";

interface Restaurant {
  user_id: string;
  restaurant_name: string;
  phone: string | null;
  address: string | null;
  opening_hours: string | null;
  logo_url: string | null;
  slug: string;
}

interface Dish {
  id: string;
  name: string;
  category: string;
  description: string | null;
  selling_price: number;
  image_url: string | null;
}

type OrderType = "delivery" | "pickup" | "table";

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  table: "Na mesa",
};

export function PublicMenu() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [category, setCategory] = useState<string>("Todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [address, setAddress] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ order_number: number; total: number } | null>(null);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    const { data: settings } = await publicSupabase
      .from("restaurant_settings_public")
      .select("user_id, restaurant_name, phone, address, opening_hours, logo_url, slug")
      .eq("slug", slug ?? "")
      .maybeSingle();
    if (!settings) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRestaurant(settings);
    document.title = `${settings.restaurant_name} — Cardápio`;
    // A policy de anon só filtra is_active; o filtro por dono é obrigatório
    // aqui pra não misturar pratos de outros restaurantes.
    const { data } = await publicSupabase
      .from("recipes")
      .select("id, name, category, description, selling_price, image_url")
      .eq("user_id", settings.user_id)
      .eq("is_active", true)
      .order("name");
    setDishes(data ?? []);
    setLoading(false);
  }

  const categories = useMemo(
    () => ["Todos", ...RECIPE_CATEGORIES.filter((c) => dishes.some((d) => d.category === c))],
    [dishes]
  );

  const visible = RECIPE_CATEGORIES.map((c) => ({
    category: c,
    items: dishes.filter((d) => d.category === c && (category === "Todos" || category === c)),
  })).filter((g) => g.items.length > 0);

  const cartLines = dishes.filter((d) => cart[d.id]).map((d) => ({ dish: d, quantity: cart[d.id] }));
  const cartCount = cartLines.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.quantity * Number(l.dish.selling_price), 0);

  function change(id: string, delta: number) {
    setCart((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + delta };
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!restaurant || cartLines.length === 0) return;
    setSending(true);
    setSendError(null);

    // O preço NÃO vai no payload — a Edge Function busca o preço real no
    // banco e ignora qualquer valor vindo do cliente.
    const { data, error } = await publicSupabase.functions.invoke("create-public-order", {
      body: {
        restaurant_slug: restaurant.slug,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: orderType === "delivery" ? address.trim() : undefined,
        order_type: orderType,
        table_number: orderType === "table" ? tableNumber.trim() : undefined,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        items: cartLines.map((l) => ({ recipe_id: l.dish.id, quantity: l.quantity })),
      },
    });

    setSending(false);
    if (error || !data) {
      let message = "Não foi possível enviar o pedido. Tente novamente.";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // mantém a mensagem genérica
      }
      setSendError(message);
      return;
    }
    setConfirmed({ order_number: data.order_number, total: Number(data.total) });
    setCart({});
    setCheckout(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Carregando cardápio...</div>;
  }

  if (notFound || !restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-xl mb-2">Cardápio não encontrado</h1>
        <p className="text-muted text-sm">Confira o link ou o QR Code com o restaurante.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-28">
      <header className="bg-sidebar-bg text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 flex items-center gap-4">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover bg-white" />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-green flex items-center justify-center text-2xl font-bold text-sidebar-bg">
              {restaurant.restaurant_name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl">{restaurant.restaurant_name}</h1>
            <div className="text-sm text-sidebar-text space-y-0.5 mt-1">
              {restaurant.opening_hours && <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {restaurant.opening_hours}</p>}
              {restaurant.address && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {restaurant.address}</p>}
              {restaurant.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {restaurant.phone}</p>}
            </div>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium border ${
                category === c ? "bg-green text-white border-green" : "border-border text-muted bg-card"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {confirmed && (
          <div className="bg-green/10 border border-green/30 rounded-2xl p-5 flex gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-dark shrink-0" />
            <div>
              <p className="font-semibold">Pedido #{confirmed.order_number} enviado!</p>
              <p className="text-sm text-muted">
                Total de {formatBRL(confirmed.total)}. O restaurante já recebeu seu pedido e vai entrar em contato.
              </p>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="text-center text-muted py-16">Nenhum prato disponível no momento.</p>
        ) : (
          visible.map((g) => (
            <section key={g.category}>
              <h2 className="text-lg mb-3">{g.category}</h2>
              <div className="space-y-3">
                {g.items.map((dish) => (
                  <div key={dish.id} className="bg-card border border-border rounded-2xl p-3 flex gap-3">
                    <div className="h-24 w-24 rounded-xl bg-bg overflow-hidden flex items-center justify-center shrink-0">
                      {dish.image_url ? (
                        <img src={dish.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-6 w-6 text-muted/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <p className="font-semibold">{dish.name}</p>
                      <p className="text-sm text-muted line-clamp-2 flex-1">{dish.description ?? ""}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-bold text-green-dark">{formatBRL(Number(dish.selling_price))}</p>
                        {cart[dish.id] ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => change(dish.id, -1)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center" aria-label="Remover um">
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-5 text-center font-semibold">{cart[dish.id]}</span>
                            <button onClick={() => change(dish.id, 1)} className="h-8 w-8 rounded-full bg-green text-white flex items-center justify-center" aria-label="Adicionar mais um">
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => change(dish.id, 1)} className="rounded-full bg-green text-white text-sm font-semibold px-4 py-1.5">
                            Adicionar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
        <p className="text-center text-xs text-muted pt-4">Cardápio digital por Blyn</p>
      </main>

      {cartCount > 0 && !checkout && (
        <div className="fixed bottom-0 inset-x-0 p-4">
          <button
            onClick={() => {
              setCheckout(true);
              setConfirmed(null);
            }}
            className="max-w-2xl mx-auto w-full flex items-center justify-between rounded-2xl bg-sidebar-bg text-white px-5 py-4 shadow-xl"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingBag className="h-5 w-5 text-green" /> Ver pedido ({cartCount})
            </span>
            <span className="font-bold">{formatBRL(cartTotal)}</span>
          </button>
        </div>
      )}

      {checkout && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onMouseDown={() => setCheckout(false)}>
          <div
            className="bg-card w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg">Seu pedido</h3>
              <button onClick={() => setCheckout(false)} className="p-1 text-muted" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="divide-y divide-border mb-4">
              {cartLines.map((l) => (
                <li key={l.dish.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <button onClick={() => change(l.dish.id, -1)} className="h-6 w-6 rounded-full border border-border flex items-center justify-center" aria-label="Remover um">
                      <Minus className="h-3 w-3" />
                    </button>
                    {l.quantity}x {l.dish.name}
                  </span>
                  <span className="font-medium">{formatBRL(l.quantity * Number(l.dish.selling_price))}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-bold mb-5">
              <span>Total</span>
              <span>{formatBRL(cartTotal)}</span>
            </div>

            <form onSubmit={submitOrder} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(ORDER_TYPE_LABEL) as OrderType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOrderType(t)}
                    className={`rounded-xl border py-2 text-sm font-medium ${
                      orderType === t ? "border-green bg-green/10 text-green-dark" : "border-border text-muted"
                    }`}
                  >
                    {ORDER_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <Field label="Seu nome">
                <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="WhatsApp / telefone">
                <input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 99999-9999" className={inputClass} />
              </Field>
              {orderType === "delivery" && (
                <Field label="Endereço de entrega">
                  <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro" className={inputClass} />
                </Field>
              )}
              {orderType === "table" && (
                <Field label="Número da mesa">
                  <input required value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className={inputClass} />
                </Field>
              )}
              <Field label="Forma de pagamento">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                  {["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Observações (opcional)">
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              </Field>
              {sendError && <p className="text-sm text-red">{sendError}</p>}
              <button type="submit" disabled={sending} className={`${primaryButton} w-full py-3`}>
                {sending ? "Enviando..." : `Enviar pedido · ${formatBRL(cartTotal)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
