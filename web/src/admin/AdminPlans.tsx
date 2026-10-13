import { Pencil, Plus, Tag } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { supabase } from "../lib/supabase";
import { CYCLE_DAYS, CYCLE_LABEL, formatPlanPrice, type BillingCycle, type Plan } from "./plans";

export function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [planRes, subRes] = await Promise.all([
      supabase.from("plans").select("*").order("active", { ascending: false }).order("duration_days"),
      supabase.from("subscriptions").select("plan_id").eq("status", "active").not("plan_id", "is", null),
    ]);
    if (planRes.error) setError(planRes.error.message);
    setPlans((planRes.data as Plan[]) ?? []);
    const counts = new Map<string, number>();
    for (const s of subRes.data ?? []) counts.set(s.plan_id as string, (counts.get(s.plan_id as string) ?? 0) + 1);
    setUsage(counts);
    setLoading(false);
  }

  async function toggleActive(plan: Plan) {
    const { error } = await supabase.from("plans").update({ active: !plan.active }).eq("id", plan.id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <PageHeader
        title="Planos"
        subtitle="Planos que podem ser ativados nas contas dos restaurantes"
        icon={Tag}
        action={
          <button onClick={() => setEditing("new")} className={primaryButton}>
            <Plus className="h-4 w-4" /> Novo plano
          </button>
        }
      />

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : plans.length === 0 ? (
        <EmptyState icon={Tag} title="Nenhum plano cadastrado" description="Crie um plano mensal ou anual para ativar nas contas." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`bg-card border rounded-2xl p-5 ${p.active ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-lg">{p.name}</p>
                  <p className="text-xs text-muted">
                    {CYCLE_LABEL[p.billing_cycle]} · {p.duration_days} dias
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.active ? "bg-green/15 text-green-dark" : "bg-border text-muted"}`}>
                  {p.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-2xl font-semibold mb-2">{formatPlanPrice(p.price_cents)}</p>
              {p.description && <p className="text-sm text-muted mb-3">{p.description}</p>}
              <p className="text-xs text-muted mb-4">
                {usage.get(p.id) ?? 0} assinatura(s) ativa(s) neste plano
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditing(p)} className={secondaryButton}>
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <button onClick={() => toggleActive(p)} className={secondaryButton}>
                  {p.active ? "Desativar" : "Reativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted mt-6">
        Plano desativado some da lista de ativação, mas as assinaturas que já usam ele continuam valendo até o vencimento.
      </p>

      {editing && (
        <PlanModal
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PlanModal({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [cycle, setCycle] = useState<BillingCycle>(plan?.billing_cycle ?? "monthly");
  const [days, setDays] = useState(String(plan?.duration_days ?? CYCLE_DAYS.monthly));
  const [price, setPrice] = useState(plan?.price_cents != null ? (plan.price_cents / 100).toFixed(2).replace(".", ",") : "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeCycle(c: BillingCycle) {
    setCycle(c);
    setDays(String(CYCLE_DAYS[c]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const durationDays = Number(days);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 1825) {
      setError("Validade deve ser entre 1 e 1825 dias.");
      return;
    }
    let priceCents: number | null = null;
    if (price.trim()) {
      const value = Number(price.trim().replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        setError("Preço inválido. Use o formato 99,90.");
        return;
      }
      priceCents = Math.round(value * 100);
    }

    const row = {
      name: name.trim(),
      billing_cycle: cycle,
      duration_days: durationDays,
      price_cents: priceCents,
      description: description.trim() || null,
    };
    setSaving(true);
    const { error } = plan
      ? await supabase.from("plans").update(row).eq("id", plan.id)
      : await supabase.from("plans").insert(row);
    setSaving(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <Modal title={plan ? `Editar ${plan.name}` : "Novo plano"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome do plano">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pro Mensal" className={inputClass} />
        </Field>
        <Field label="Cobrança">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(CYCLE_LABEL) as BillingCycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => changeCycle(c)}
                className={`rounded-xl border p-3 text-sm font-medium ${cycle === c ? "border-green bg-green/5" : "border-border"}`}
              >
                {CYCLE_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Validade (dias)">
            <input required inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Preço (R$)">
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 197,00" className={inputClass} />
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        {plan && <p className="text-xs text-muted">Alterações valem para as próximas ativações; assinaturas já ativas mantêm o vencimento atual.</p>}
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar plano"}</button>
        </div>
      </form>
    </Modal>
  );
}
