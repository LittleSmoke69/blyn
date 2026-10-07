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
//   - activate_subscription: ativa um plano mensal ou anual, calculando
//     expires_at a partir do billing_cycle.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseAdmin.ts";

interface Payload {
  action: "create" | "update" | "activate_subscription";
  user_id?: string; // obrigatório em update/activate_subscription
  restaurant_name?: string;
  email?: string;
  password?: string;
  phone?: string;
  address?: string;
  billing_cycle?: "monthly" | "annual";
}

const CYCLE_TO_INTERVAL: Record<string, string> = {
  monthly: "1 month",
  annual: "1 year",
};

async function requireAdmin(req: Request) {
  const caller = getCallerClient(req);
  const { data: userData, error } = await caller.auth.getUser();
  if (error || !userData.user) {
    throw { status: 401, message: "não autenticado" };
  }
  const { data: allowed } = await caller.rpc("is_admin", { uid: userData.user.id });
  if (!allowed) {
    throw { status: 403, message: "só administradores da plataforma podem usar esse painel" };
  }
  return userData.user.id;
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
    const e = err as { status?: number; message?: string };
    return jsonResponse({ error: e.message ?? "falha de autorização" }, e.status ?? 403);
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
    if (!payload.billing_cycle || !CYCLE_TO_INTERVAL[payload.billing_cycle]) {
      return jsonResponse({ error: "billing_cycle deve ser 'monthly' ou 'annual'" }, 400);
    }

    const { data: row, error } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        plan: "pro",
        billing_cycle: payload.billing_cycle,
        expires_at: new Date(
          Date.now() + (payload.billing_cycle === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq("user_id", payload.user_id)
      .select()
      .single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse(row);
  }

  return jsonResponse({ error: "action inválida" }, 400);
});
