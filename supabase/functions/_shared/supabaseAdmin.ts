import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Cliente com service_role — ignora RLS. Só usar para operações que
// genuinamente precisam de privilégio de servidor (auth.admin.*, validar
// preço real antes de gravar um pedido público, etc.).
export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Cliente que roda com o JWT de quem chamou a função — respeita a RLS do
// próprio usuário (usado pra checar get_owner_id/has_permission com a
// identidade real de quem fez a requisição, não com o service role).
export function getCallerClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY não configurados");
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
