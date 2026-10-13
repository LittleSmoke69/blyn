import { Building2, Crown, ExternalLink, Pencil, Plus, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, Field, Modal, PageHeader, PillTabs, StatCard, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import { STATUS_BADGE, STATUS_LABEL, effectiveStatus, type Account, type SubStatus } from "./accounts";
import { CYCLE_LABEL, formatPlanPrice, type Plan } from "./plans";

async function callAccounts(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-manage-accounts", { body });
  if (error) {
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) return { error: payload.error as string };
    } catch {
      // genérico
    }
    return { error: error.message };
  }
  return { data };
}

type Filter = "all" | SubStatus;

interface RoleChange {
  id: number;
  target_email: string;
  action: "grant" | "revoke";
  changed_by_email: string | null;
  created_at: string;
}

export function AdminAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leadByAccount, setLeadByAccount] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Account | null>(null);
  const [activating, setActivating] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [changingRole, setChangingRole] = useState<Account | null>(null);
  const [roleChanges, setRoleChanges] = useState<RoleChange[]>([]);
  const { session } = useAuth();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [accRes, leadRes, roleRes] = await Promise.all([
      supabase.rpc("admin_list_accounts"),
      supabase.from("crm_leads").select("id, account_user_id").not("account_user_id", "is", null),
      supabase.from("admin_role_changes").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setRoleChanges((roleRes.data as RoleChange[]) ?? []);
    if (accRes.error) setError(accRes.error.message);
    // Membros de equipe também ganham profile pelo trigger de signup, mas não
    // são clientes — ficam fora da lista de contas.
    setAccounts(((accRes.data as Account[]) ?? []).filter((a) => !a.is_team_member));
    setLeadByAccount(new Map((leadRes.data ?? []).map((l) => [l.account_user_id as string, l.id as string])));
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c = { trial: 0, active: 0, past_due: 0, canceled: 0, expired: 0 } as Record<SubStatus, number>;
    for (const a of accounts) c[effectiveStatus(a)]++;
    return c;
  }, [accounts]);

  const visible = accounts.filter((a) => {
    const q = search.trim().toLowerCase();
    const matches = !q || [a.restaurant_name, a.email, a.phone, a.slug].some((v) => v?.toLowerCase().includes(q));
    return matches && (filter === "all" || effectiveStatus(a) === filter);
  });

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle="Restaurantes que usam a Blyn"
        icon={Building2}
        action={
          <button onClick={() => setCreating(true)} className={primaryButton}>
            <Plus className="h-4 w-4" /> Nova conta
          </button>
        }
      />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total de contas" value={accounts.length} />
        <StatCard label="Assinantes ativos" value={counts.active} valueClassName="text-green-dark" />
        <StatCard label="Em teste" value={counts.trial} valueClassName="text-blue-700" />
        <StatCard label="Expiradas / pendentes" value={counts.expired + counts.past_due + counts.canceled} valueClassName="text-red" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input placeholder="Buscar restaurante, e-mail, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} />
        </div>
        <PillTabs
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "Todas" },
            { key: "active", label: "Ativas" },
            { key: "trial", label: "Teste" },
            { key: "expired", label: "Expiradas" },
            { key: "past_due", label: "Pendentes" },
          ]}
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-bg text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Restaurante</th>
              <th className="text-left px-5 py-3 font-medium">Assinatura</th>
              <th className="text-left px-5 py-3 font-medium">Vence em</th>
              <th className="text-left px-5 py-3 font-medium">Último acesso</th>
              <th className="text-left px-5 py-3 font-medium">Criada em</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-muted">Carregando...</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-muted">Nenhuma conta encontrada.</td>
              </tr>
            ) : (
              visible.map((a) => {
                const st = effectiveStatus(a);
                const ends = a.status === "trial" ? a.trial_end_date : a.expires_at;
                const leadId = leadByAccount.get(a.user_id);
                return (
                  <tr key={a.user_id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <p className="font-medium flex items-center gap-2">
                        {a.restaurant_name}
                        {a.is_platform_admin && <span className="text-[10px] uppercase font-bold bg-sidebar-bg text-white rounded-full px-1.5 py-0.5">admin</span>}
                      </p>
                      <p className="text-xs text-muted">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span>
                      {a.status === "active" && (a.plan || a.billing_cycle) && (
                        <span className="text-xs text-muted ml-2">{a.plan ?? CYCLE_LABEL[a.billing_cycle!]}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">{ends ? formatDate(ends) : "—"}</td>
                    <td className="px-5 py-3 text-muted">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Nunca"}</td>
                    <td className="px-5 py-3 text-muted">{formatDate(a.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {leadId && (
                          <Link to={`/admin/crm?lead=${leadId}`} className="p-1.5 rounded hover:bg-bg text-muted text-xs" title="Ver no CRM">
                            CRM
                          </Link>
                        )}
                        {a.slug && (
                          <a href={`${import.meta.env.BASE_URL}cardapio/${a.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-bg text-muted" title="Cardápio digital">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button onClick={() => setEditing(a)} className="p-1.5 rounded hover:bg-bg text-muted" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setActivating(a)} className="p-1.5 rounded hover:bg-green/10 text-green-dark" title="Ativar / renovar plano">
                          <Crown className="h-4 w-4" />
                        </button>
                        {a.user_id !== session?.user.id && (
                          <button
                            onClick={() => setChangingRole(a)}
                            className={`p-1.5 rounded ${a.is_platform_admin ? "hover:bg-red/10 text-red" : "hover:bg-bg text-muted"}`}
                            title={a.is_platform_admin ? "Remover admin" : "Tornar admin"}
                          >
                            {a.is_platform_admin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {creating && <CreateAccountModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {roleChanges.length > 0 && (
        <div className="mt-6 bg-card border border-border rounded-2xl p-5">
          <p className="font-semibold mb-3">Histórico de cargos de admin</p>
          <ul className="space-y-1.5 text-sm">
            {roleChanges.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-2 text-muted">
                <span>{formatDateTime(c.created_at)}</span>
                <span className="text-text">
                  {c.changed_by_email ?? "—"} {c.action === "grant" ? "tornou admin" : "removeu o admin de"} <strong>{c.target_email}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {changingRole && <RoleModal account={changingRole} onClose={() => setChangingRole(null)} onDone={() => { setChangingRole(null); load(); }} />}
      {activating && <ActivateModal account={activating} onClose={() => setActivating(null)} onDone={() => { setActivating(null); load(); }} />}
    </div>
  );
}

function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await callAccounts({ action: "create", restaurant_name: name.trim(), email: email.trim().toLowerCase(), password });
    setSaving(false);
    if (res.error) setError(res.error);
    else onDone();
  }

  return (
    <Modal title="Nova conta de restaurante" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome do restaurante">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="E-mail de login">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Senha provisória (mín. 6 caracteres)">
          <input required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <p className="text-xs text-muted">A conta começa com 7 dias de teste, igual ao cadastro pelo site.</p>
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Criando..." : "Criar conta"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditAccountModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(account.restaurant_name);
  const [email, setEmail] = useState(account.email);
  const [phone, setPhone] = useState(account.phone ?? "");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await callAccounts({
      action: "update",
      user_id: account.user_id,
      restaurant_name: name.trim() !== account.restaurant_name ? name.trim() : undefined,
      email: email.trim().toLowerCase() !== account.email ? email.trim().toLowerCase() : undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
    });
    setSaving(false);
    if (res.error) setError(res.error);
    else onDone();
  }

  return (
    <Modal title={`Editar ${account.restaurant_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome do restaurante">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="E-mail de login">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Telefone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Endereço (deixe vazio para não alterar)">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ActivateModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("duration_days")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        const list = (data as Plan[]) ?? [];
        setPlans(list);
        setPlanId(list[0]?.id ?? null);
      });
  }, []);

  const selected = plans?.find((p) => p.id === planId) ?? null;
  // Mesma regra da Edge Function: assinatura ativa e ainda válida soma a partir do vencimento.
  const renewing = account.status === "active" && !!account.expires_at && new Date(account.expires_at).getTime() > Date.now();
  const base = renewing ? new Date(account.expires_at!) : new Date();
  const newEnd = selected ? new Date(base.getTime() + selected.duration_days * 86_400_000) : null;

  async function submit() {
    if (!planId) return;
    setSaving(true);
    const res = await callAccounts({ action: "activate_subscription", user_id: account.user_id, plan_id: planId });
    setSaving(false);
    if (res.error) setError(res.error);
    else onDone();
  }

  return (
    <Modal title="Ativar / renovar plano" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm">
          Escolha o plano para <strong>{account.restaurant_name}</strong>.
        </p>
        {plans === null ? (
          <p className="text-sm text-muted">Carregando planos...</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum plano ativo. Cadastre um em <Link to="/admin/plans" className="text-green-dark underline">Planos</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                className={`rounded-xl border p-4 text-left ${planId === p.id ? "border-green bg-green/5" : "border-border"}`}
              >
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted">{CYCLE_LABEL[p.billing_cycle]} · {p.duration_days} dias</p>
                <p className="text-sm mt-1">{formatPlanPrice(p.price_cents)}</p>
              </button>
            ))}
          </div>
        )}
        {newEnd && (
          <p className="text-xs text-muted">
            {renewing ? "Renovação: soma ao vencimento atual" : "Validade a partir de hoje"} — vence em {formatDate(newEnd.toISOString())}.
          </p>
        )}
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button onClick={submit} disabled={saving || !planId} className={primaryButton}>{saving ? "Ativando..." : "Ativar plano"}</button>
        </div>
      </div>
    </Modal>
  );
}

function RoleModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const makeAdmin = !account.is_platform_admin;
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = !makeAdmin || confirmText.trim().toLowerCase() === account.email.toLowerCase();

  async function submit() {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_platform_admin", { p_user_id: account.user_id, p_make_admin: makeAdmin });
    setSaving(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <Modal title={makeAdmin ? "Tornar admin da plataforma" : "Remover admin"} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {makeAdmin ? (
          <>
            <p>
              <strong>{account.restaurant_name}</strong> ({account.email}) vai ter acesso total ao Painel Admin: todos os
              restaurantes, assinaturas e planos, o CRM com os leads, a configuração de IA e o cargo de outros admins.
            </p>
            <Field label={`Para confirmar, digite o e-mail ${account.email}`}>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} autoComplete="off" />
            </Field>
          </>
        ) : (
          <p>
            <strong>{account.restaurant_name}</strong> ({account.email}) perde o acesso ao Painel Admin. A conta continua
            existindo como usuário normal. A mudança vale no próximo carregamento do app dessa pessoa.
          </p>
        )}
        {error && <p className="text-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !confirmed}
            className={makeAdmin ? primaryButton : `${primaryButton} !bg-red hover:!bg-red/90`}
          >
            {saving ? "Salvando..." : makeAdmin ? "Tornar admin" : "Remover admin"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
