import { getCallerClient } from "./supabaseAdmin.ts";

export class AdminAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Confirma que quem chamou é um admin da PLATAFORMA (tabela admins, via
// is_admin()) — usado por toda Edge Function do painel admin. Lança
// AdminAuthError (com status HTTP pronto) se não for.
export async function requireAdmin(req: Request): Promise<string> {
  const caller = getCallerClient(req);
  const { data: userData, error } = await caller.auth.getUser();
  if (error || !userData.user) {
    throw new AdminAuthError(401, "não autenticado");
  }
  const { data: allowed } = await caller.rpc("is_admin", { uid: userData.user.id });
  if (!allowed) {
    throw new AdminAuthError(403, "só administradores da plataforma podem usar esse painel");
  }
  return userData.user.id;
}
