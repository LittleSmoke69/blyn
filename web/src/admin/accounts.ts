export type SubStatus = "trial" | "active" | "past_due" | "canceled" | "expired";

export interface Account {
  user_id: string;
  email: string;
  restaurant_name: string;
  phone: string | null;
  slug: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  status: SubStatus | null;
  billing_cycle: "monthly" | "semiannual" | "annual" | null;
  trial_end_date: string | null;
  expires_at: string | null;
  is_team_member: boolean;
  is_platform_admin: boolean;
}

export const STATUS_LABEL: Record<SubStatus, string> = {
  trial: "Teste",
  active: "Ativo",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
  expired: "Expirado",
};

export const STATUS_BADGE: Record<SubStatus, string> = {
  trial: "bg-blue-100 text-blue-800",
  active: "bg-green/15 text-green-dark",
  past_due: "bg-amber-100 text-amber-800",
  canceled: "bg-border text-muted",
  expired: "bg-red/10 text-red",
};

/** Status efetivo: um trial vencido conta como expirado mesmo que o banco ainda diga 'trial'. */
export function effectiveStatus(a: Pick<Account, "status" | "trial_end_date" | "expires_at">): SubStatus {
  const now = Date.now();
  if (a.status === "trial" && a.trial_end_date && new Date(a.trial_end_date).getTime() < now) return "expired";
  if (a.status === "active" && a.expires_at && new Date(a.expires_at).getTime() < now) return "expired";
  return a.status ?? "expired";
}

