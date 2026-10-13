import { Building2, Crown, ExternalLink, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, Field, Modal, PageHeader, PillTabs, StatCard, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { formatDate, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import { STATUS_BADGE, STATUS_LABEL, effectiveStatus, type Account, type SubStatus } from "./accounts";

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

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [accRes, leadRes] = await Promise.all([
      supabase.rpc("admin_list_accounts"),
      supabase.from("crm_leads").select("id, account_user_id").not("account_user_id", "is", null),
    ]);
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

      <div className="grid grid-cols-4 gap-4 mb-6">
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

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
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
                      {a.status === "active" && a.billing_cycle && (
                        <span className="text-xs text-muted ml-2">{a.billing_cycle === "annual" ? "anual" : a.billing_cycle === "semiannual" ? "semestral" : "mensal"}</span>
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
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    const res = await callAccounts({ action: "activate_subscription", user_id: account.user_id, billing_cycle: cycle });
    setSaving(false);
    if (res.error) setError(res.error);
    else onDone();
  }

  return (
    <Modal title="Ativar / renovar plano" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm">
          Ativar o plano Pro para <strong>{account.restaurant_name}</strong>. A validade conta a partir de hoje
          ({cycle === "annual" ? "365" : "30"} dias).
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-xl border p-4 text-left ${cycle === c ? "border-green bg-green/5" : "border-border"}`}
            >
              <p className="font-semibold">{c === "monthly" ? "Mensal" : "Anual"}</p>
              <p className="text-xs text-muted">{c === "monthly" ? "30 dias" : "365 dias"}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button onClick={submit} disabled={saving} className={primaryButton}>{saving ? "Ativando..." : "Ativar plano"}</button>
        </div>
      </div>
    </Modal>
  );
}
