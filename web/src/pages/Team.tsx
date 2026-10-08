import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  permissions: string[];
  created_at: string;
}

// Agrupa as 26 chaves do enum permission_key por tela, pra exibição.
const PERMISSION_GROUPS: { screen: string; keys: { key: string; label: string }[] }[] = [
  { screen: "Dashboard", keys: [{ key: "dashboard.view", label: "Ver" }] },
  { screen: "PDV", keys: [{ key: "pdv.view", label: "Ver" }, { key: "pdv.create", label: "Registrar vendas" }] },
  { screen: "Mesas", keys: [{ key: "tables.view", label: "Ver" }, { key: "tables.manage", label: "Gerenciar" }] },
  { screen: "Vendas", keys: [{ key: "sales.view", label: "Ver" }] },
  { screen: "Ingredientes", keys: [{ key: "ingredients.view", label: "Ver" }, { key: "ingredients.manage", label: "Gerenciar" }] },
  { screen: "Estoque", keys: [{ key: "stock.view", label: "Ver" }, { key: "stock.manage", label: "Movimentar" }] },
  { screen: "Cardápio", keys: [{ key: "menu.view", label: "Ver" }, { key: "menu.edit", label: "Editar" }] },
  { screen: "Fichas Técnicas", keys: [{ key: "recipes.view", label: "Ver" }, { key: "recipes.manage", label: "Gerenciar" }] },
  { screen: "Financeiro", keys: [{ key: "financial.view", label: "Ver" }, { key: "financial.manage", label: "Lançar" }] },
  { screen: "Análise de Lucro", keys: [{ key: "profit.view", label: "Ver" }] },
  { screen: "DRE", keys: [{ key: "dre.view", label: "Ver" }] },
  { screen: "Relatórios", keys: [{ key: "reports.view", label: "Ver" }] },
  { screen: "Cardápio Digital", keys: [{ key: "digital_menu.view", label: "Ver" }, { key: "digital_menu.manage", label: "Gerenciar" }] },
  { screen: "Pedidos Online", keys: [{ key: "online_orders.view", label: "Ver" }, { key: "online_orders.manage", label: "Gerenciar" }] },
  { screen: "Configurações", keys: [{ key: "settings.view", label: "Ver" }, { key: "settings.manage", label: "Editar" }] },
  { screen: "Equipe", keys: [{ key: "team.manage", label: "Gerenciar" }] },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap((g) => g.keys.map((k) => k.key));

const PRESETS: { label: string; keys: string[] }[] = [
  { label: "Garçom", keys: ["pdv.view", "pdv.create", "tables.view", "tables.manage", "menu.view"] },
  { label: "Caixa", keys: ["dashboard.view", "pdv.view", "pdv.create", "tables.view", "sales.view", "online_orders.view", "online_orders.manage"] },
  { label: "Cozinha", keys: ["online_orders.view", "online_orders.manage", "recipes.view", "stock.view", "ingredients.view"] },
  { label: "Gerente", keys: ALL_KEYS.filter((k) => k !== "team.manage" && k !== "settings.manage") },
];

async function callTeamFunction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-team-member", { body });
  if (error) {
    // Erros HTTP da function vêm com o corpo JSON em error.context.
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) return { error: payload.error as string };
    } catch {
      // cai no genérico
    }
    return { error: error.message };
  }
  return { data };
}

export function Team() {
  const { ownerId } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (ownerId) load();
  }, [ownerId]);

  async function load() {
    const { data, error } = await supabase
      .from("team_members")
      .select("id, name, email, permissions, created_at")
      .eq("owner_id", ownerId)
      .order("name");
    if (error) setError(error.message);
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setPermissions(new Set(PRESETS[0].keys));
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(member: TeamMember) {
    setEditing(member);
    setName(member.name);
    setEmail(member.email);
    setPassword("");
    setPermissions(new Set(member.permissions));
    setFormError(null);
    setShowForm(true);
  }

  function toggle(key: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Qualquer ação numa tela implica poder ver a tela.
        const viewKey = `${key.split(".")[0]}.view`;
        if (ALL_KEYS.includes(viewKey)) next.add(viewKey);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing && password.length < 6) {
      setFormError("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const perms = [...permissions];
    const result = editing
      ? await callTeamFunction({
          action: "update",
          team_member_id: editing.id,
          name: name.trim(),
          email: email.trim() !== editing.email ? email.trim() : undefined,
          password: password || undefined,
          permissions: perms,
        })
      : await callTeamFunction({ action: "create", name: name.trim(), email: email.trim(), password, permissions: perms });
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    await load();
  }

  async function handleDelete(member: TeamMember) {
    if (!confirm(`Remover ${member.name} da equipe? O login dele(a) será apagado.`)) return;
    const result = await callTeamFunction({ action: "delete", team_member_id: member.id });
    if (result.error) setError(result.error);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Gerencie os membros da sua equipe e suas permissões de acesso."
        icon={Users}
        action={
          <button onClick={openCreate} className={primaryButton}>
            <Plus className="h-4 w-4" /> Novo Membro
          </button>
        }
      />

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum membro na equipe"
          description="Adicione garçons, caixas e outros funcionários com acessos limitados."
          action={
            <button onClick={openCreate} className={primaryButton}>
              <Plus className="h-4 w-4" /> Adicionar primeiro membro
            </button>
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Nome</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Acessos</th>
                <th className="text-left px-5 py-3 font-medium">Desde</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const screens = PERMISSION_GROUPS.filter((g) => g.keys.some((k) => m.permissions.includes(k.key))).map((g) => g.screen);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{m.name}</td>
                    <td className="px-5 py-3 text-muted">{m.email}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {screens.length === 0 ? (
                          <span className="text-muted">Nenhum</span>
                        ) : (
                          screens.map((s) => (
                            <span key={s} className="text-[11px] bg-green/10 text-green-dark rounded-full px-2 py-0.5">{s}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(m.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-bg text-muted" aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(m)} className="p-1.5 rounded hover:bg-red/10 text-red" aria-label="Remover">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? `Editar ${editing.name}` : "Novo membro"} onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Nome">
                <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Email de login">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </Field>
              <Field label={editing ? "Nova senha (opcional)" : "Senha"}>
                <input
                  type="password"
                  required={!editing}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Permissões</p>
                <div className="flex gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setPermissions(new Set(p.keys))}
                      className="text-xs rounded-full border border-border px-3 py-1 hover:border-green"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 border border-border rounded-xl p-4 max-h-80 overflow-y-auto">
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.screen} className="flex items-center justify-between py-1.5 border-b border-border/60 last:border-0">
                    <span className="text-sm">{g.screen}</span>
                    <div className="flex gap-3">
                      {g.keys.map((k) => (
                        <label key={k.key} className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                          <input type="checkbox" checked={permissions.has(k.key)} onChange={() => toggle(k.key)} className="accent-[var(--green)]" />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {formError && <p className="text-sm text-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={secondaryButton}>Cancelar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : editing ? "Salvar" : "Criar membro"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
