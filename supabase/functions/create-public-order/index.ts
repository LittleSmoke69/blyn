// Cria um pedido do cardápio digital/pedidos online, chamado por um cliente
// NÃO autenticado (verify_jwt=false no config.toml). Roda com service role
// porque precisa: (1) ler receitas/preços reais ignorando o que o cliente
// mandar, e (2) inserir em public_orders/public_order_items, que não têm
// nenhuma policy de INSERT pra anon/authenticated.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

interface IncomingItem {
  recipe_id: string;
  quantity: number;
  notes?: string;
}

interface IncomingPayload {
  restaurant_slug: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  order_type: "delivery" | "table" | "pickup";
  table_number?: string;
  payment_method?: string;
  notes?: string;
  items: IncomingItem[];
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "método não suportado" }, 405);
  }

  let payload: IncomingPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (
    !payload.restaurant_slug || !payload.customer_name || !payload.customer_phone ||
    !payload.order_type || !Array.isArray(payload.items) || payload.items.length === 0
  ) {
    return jsonResponse({ error: "campos obrigatórios ausentes" }, 400);
  }
  for (const item of payload.items) {
    if (!item.recipe_id || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      return jsonResponse({ error: "item inválido no pedido" }, 400);
    }
  }

  const admin = getAdminClient();

  const { data: settings, error: settingsError } = await admin
    .from("restaurant_settings")
    .select("user_id")
    .eq("slug", payload.restaurant_slug)
    .maybeSingle();

  if (settingsError || !settings) {
    return jsonResponse({ error: "restaurante não encontrado" }, 404);
  }
  const ownerId = settings.user_id as string;

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_end_date, expires_at")
    .eq("user_id", ownerId)
    .maybeSingle();

  const now = new Date();
  const trialActive = subscription?.status === "trial" &&
    subscription.trial_end_date && new Date(subscription.trial_end_date) > now;
  const planActive = subscription?.status === "active" &&
    (!subscription.expires_at || new Date(subscription.expires_at) > now);
  if (!trialActive && !planActive) {
    return jsonResponse({ error: "restaurante sem assinatura ativa" }, 403);
  }

  // Busca as receitas reais do dono — ignora QUALQUER preço vindo do cliente.
  const recipeIds = [...new Set(payload.items.map((i) => i.recipe_id))];
  const { data: recipes, error: recipesError } = await admin
    .from("recipes")
    .select("id, name, selling_price, is_active")
    .eq("user_id", ownerId)
    .in("id", recipeIds);

  if (recipesError) {
    return jsonResponse({ error: "falha ao validar itens do pedido" }, 500);
  }
  const recipeById = new Map((recipes ?? []).map((r) => [r.id, r]));
  for (const id of recipeIds) {
    const recipe = recipeById.get(id);
    if (!recipe || !recipe.is_active) {
      return jsonResponse({ error: `item indisponível: ${id}` }, 400);
    }
  }

  const lineItems = payload.items.map((item) => {
    const recipe = recipeById.get(item.recipe_id)!;
    const unitPrice = Number(recipe.selling_price);
    return {
      recipe_id: item.recipe_id,
      recipe_name: recipe.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      subtotal: Math.round(unitPrice * item.quantity * 100) / 100,
      notes: item.notes ?? null,
    };
  });
  const total = Math.round(lineItems.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;

  const { data: order, error: orderError } = await admin
    .from("public_orders")
    .insert({
      restaurant_user_id: ownerId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_address: payload.customer_address ?? null,
      order_type: payload.order_type,
      table_number: payload.table_number ?? null,
      payment_method: payload.payment_method ?? "Pendente",
      notes: payload.notes ?? null,
      total,
    })
    .select("id, order_number, total")
    .single();

  if (orderError || !order) {
    return jsonResponse({ error: "falha ao criar pedido" }, 500);
  }

  const { error: itemsError } = await admin
    .from("public_order_items")
    .insert(lineItems.map((l) => ({ ...l, order_id: order.id })));

  if (itemsError) {
    // best-effort rollback do pedido-pai se os itens falharem
    await admin.from("public_orders").delete().eq("id", order.id);
    return jsonResponse({ error: "falha ao gravar itens do pedido" }, 500);
  }

  return jsonResponse({ id: order.id, order_number: order.order_number, total: order.total }, 201);
});
