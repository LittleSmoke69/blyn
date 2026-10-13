// Painel admin: criar/editar conta de empresa (restaurante) e ativar
// assinatura (mensal ou anual). Listagem NÃO passa por aqui — profiles/
// subscriptions/restaurant_settings já têm policy de SELECT pra is_admin(),
// então o painel lê direto via gateway+RLS, igual qualquer outra tela.
// Aqui só ficam as ações que exigem privilégio de servidor:
//   - create: usa auth.admin.createUser() (não dá pra fazer do navegador);
//     a criação de profiles/subscriptions/restaurant_settings acontece pelo
//     MESMO trigger handle_new_user() do signup normal — não duplicamos
//     essa lógica aqui.
//   - update: edita campos de profiles/restaurant_settings de QUALQUER
//     empresa (as tables só têm policy de UPDATE pro próprio dono).
//   - activate_subscription: ativa um plano cadastrado em "plans" (painel
//     admin > Planos). A validade soma duration_days a partir de hoje — ou do
//     vencimento atual, se a assinatura ainda estiver ativa (renovação
//     antecipada não perde os dias que faltavam).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { AdminAuthError, requireAdmin } from "../_shared/requireAdmin.ts";

interface Payload {
  action: "create" | "update" | "activate_subscription";
  user_id?: string; // obrigatório em update/activate_subscription
  restaurant_name?: string;
  email?: string;
  password?: string;
  phone?: string;
  address?: string;
  plan_id?: string; // obrigatório em activate_subscription
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "método não suportado" }, 405);
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse({ error: "falha de autorização" }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const admin = getAdminClient();

  if (payload.action === "create") {
    if (!payload.restaurant_name || !payload.email || !payload.password) {
      return jsonResponse({ error: "restaurant_name, email e password são obrigatórios" }, 400);
    }
    if (payload.password.length < 6) {
      return jsonResponse({ error: "senha deve ter ao menos 6 caracteres" }, 400);
    }

    // Reaproveita o MESMO caminho do signup público — o trigger
    // handle_new_user() cria profiles/subscriptions/restaurant_settings
    // automaticamente, igual faria se a empresa tivesse se cadastrado
    // sozinha.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { restaurant_name: payload.restaurant_name },
    });
    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message ?? "falha ao criar conta" }, 400);
    }

    return jsonResponse({ user_id: created.user.id }, 201);
  }

  if (payload.action === "update") {
    if (!payload.user_id) {
      return jsonResponse({ error: "user_id é obrigatório" }, 400);
    }

    const profileUpdate: Record<string, string> = {};
    const settingsUpdate: Record<string, string> = {};
    if (payload.restaurant_name) {
      profileUpdate.restaurant_name = payload.restaurant_name;
      settingsUpdate.restaurant_name = payload.restaurant_name;
    }
    if (payload.phone) {
      profileUpdate.phone = payload.phone;
      settingsUpdate.phone = payload.phone;
    }
    if (payload.address) {
      profileUpdate.address = payload.address;
      settingsUpdate.address = payload.address;
    }

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await admin.from("profiles").update(profileUpdate).eq("user_id", payload.user_id);
      if (error) return jsonResponse({ error: error.message }, 400);
    }
    if (Object.keys(settingsUpdate).length > 0) {
      const { error } = await admin.from("restaurant_settings").update(settingsUpdate).eq("user_id", payload.user_id);
      if (error) return jsonResponse({ error: error.message }, 400);
    }
    if (payload.email) {
      const { error } = await admin.auth.admin.updateUser(payload.user_id, { email: payload.email });
      if (error) return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ success: true });
  }

  if (payload.action === "activate_subscription") {
    if (!payload.user_id) {
      return jsonResponse({ error: "user_id é obrigatório" }, 400);
    }
    if (!payload.plan_id) {
      return jsonResponse({ error: "plan_id é obrigatório" }, 400);
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id, name, billing_cycle, duration_days, active")
      .eq("id", payload.plan_id)
      .maybeSingle();
    if (planError) return jsonResponse({ error: planError.message }, 400);
    if (!plan || !plan.active) return jsonResponse({ error: "plano não encontrado ou inativo" }, 400);

    const { data: current, error: currentError } = await admin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", payload.user_id)
      .maybeSingle();
    if (currentError) return jsonResponse({ error: currentError.message }, 400);
    if (!current) return jsonResponse({ error: "conta sem assinatura" }, 404);

    const now = Date.now();
    const currentEnd = current.expires_at ? new Date(current.expires_at).getTime() : 0;
    const base = current.status === "active" && currentEnd > now ? currentEnd : now;

    const { data: row, error } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        plan: plan.name,
        plan_id: plan.id,
        billing_cycle: plan.billing_cycle,
        expires_at: new Date(base + plan.duration_days * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("user_id", payload.user_id)
      .select()
      .single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse(row);
  }

  return jsonResponse({ error: "action inválida" }, 400);
});
