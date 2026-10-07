// Cancela a assinatura do PRÓPRIO dono (nunca um membro de equipe — não há
// permission key de billing no catálogo, então membros de equipe são
// rejeitados por completo).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseAdmin.ts";

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

  const { data: ownerId } = await caller.rpc("get_owner_id", { uid: callerId });
  if (ownerId !== callerId) {
    return jsonResponse({ error: "só o dono da assinatura pode cancelá-la" }, 403);
  }

  const admin = getAdminClient();
  const { data: row, error } = await admin
    .from("subscriptions")
    .update({ status: "canceled", expires_at: new Date().toISOString() })
    .eq("user_id", callerId)
    .is("expires_at", null)
    .select()
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  if (!row) {
    // já tinha expires_at setado (ex: já tava cancelada antes) — atualiza só o status
    const { data: fallbackRow, error: fallbackError } = await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", callerId)
      .select()
      .single();
    if (fallbackError) return jsonResponse({ error: fallbackError.message }, 500);
    return jsonResponse(fallbackRow);
  }

  return jsonResponse(row);
});
