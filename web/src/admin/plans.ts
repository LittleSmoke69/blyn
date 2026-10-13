export type BillingCycle = "monthly" | "semiannual" | "annual";

export interface Plan {
  id: string;
  name: string;
  billing_cycle: BillingCycle;
  duration_days: number;
  price_cents: number | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
};

/** Validade sugerida ao escolher o ciclo (pode ser ajustada no formulário). */
export const CYCLE_DAYS: Record<BillingCycle, number> = {
  monthly: 30,
  semiannual: 180,
  annual: 365,
};

export function formatPlanPrice(cents: number | null) {
  return cents === null
    ? "Preço a definir"
    : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
