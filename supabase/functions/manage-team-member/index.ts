// Cria/edita/remove um membro de equipe. Precisa de auth.admin.* (service
// role) porque um membro de equipe é um auth.users de verdade, com login
// próprio — algo que não pode ser feito com a chave anon/authenticated do
// navegador. Usa o cliente do chamador só pra validar permissão (team.manage)
// com a RLS real do usuário; todo o trabalho privilegiado usa o client admin.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseAdmin.ts";

interface Payload {
  action: "create" | "update" | "delete";
  team_member_id?: string; // obrigatório em update/delete
  name?: string;
  email?: string;
  password?: string;
  permissions?: string[];
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "método não suportado" }, 405);
  }

  const caller = getCallerClient(req);
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "não autenticado" }, 401);
  }
  const callerId = userData.user.id;

  const { data: isAllowed } = await caller.rpc("has_permission", { check_key: "team.manage" });
  if (!isAllowed) {
    return jsonResponse({ error: "sem permissão: team.manage é necessária" }, 403);
  }
  const { data: ownerId } = await caller.rpc("get_owner_id", { uid: callerId });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const admin = getAdminClient();

  if (payload.action === "create") {
    if (!payload.name || !payload.email || !payload.password) {
      return jsonResponse({ error: "name, email e password são obrigatórios" }, 400);
    }
    if (payload.password.length < 6) {
      return jsonResponse({ error: "senha deve ter ao menos 6 caracteres" }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message ?? "falha ao criar login" }, 400);
    }

    const { data: row, error: insertError } = await admin
      .from("team_members")
      .insert({
        owner_id: ownerId,
        user_id: created.user.id,
        name: payload.name,
        email: payload.email,
        permissions: payload.permissions ?? [],
      })
      .select()
      .single();

    if (insertError) {
      // rollback: não deixa um auth.users órfão sem team_members
      await admin.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: "permissões inválidas ou falha ao gravar membro" }, 400);
    }
    return jsonResponse(row, 201);
  }

  if (payload.action === "update") {
    if (!payload.team_member_id) {
      return jsonResponse({ error: "team_member_id é obrigatório" }, 400);
    }
    const { data: member } = await admin
      .from("team_members")
      .select("id, user_id, owner_id")
      .eq("id", payload.team_member_id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!member) {
      return jsonResponse({ error: "membro não encontrado" }, 404);
    }

    if (payload.email || payload.password) {
      const { error: updateAuthError } = await admin.auth.admin.updateUser(member.user_id, {
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.password ? { password: payload.password } : {}),
      });
      if (updateAuthError) {
        return jsonResponse({ error: updateAuthError.message }, 400);
      }
    }

    const { data: row, error: updateError } = await admin
      .from("team_members")
      .update({
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.permissions ? { permissions: payload.permissions } : {}),
      })
      .eq("id", payload.team_member_id)
      .select()
      .single();

    if (updateError) {
      return jsonResponse({ error: "permissões inválidas ou falha ao atualizar" }, 400);
    }
    return jsonResponse(row);
  }

  if (payload.action === "delete") {
    if (!payload.team_member_id) {
      return jsonResponse({ error: "team_member_id é obrigatório" }, 400);
    }
    const { data: member } = await admin
      .from("team_members")
      .select("user_id")
      .eq("id", payload.team_member_id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!member) {
      return jsonResponse({ error: "membro não encontrado" }, 404);
    }
    // team_members tem FK on delete cascade em user_id -> apagar o login
    // já remove a linha de team_members junto.
    const { error: deleteError } = await admin.auth.admin.deleteUser(member.user_id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 400);
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "action inválida" }, 400);
});
