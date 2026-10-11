import { AtSign, Building2, CheckCircle2, Circle, Copy, Mail, MessageCircle, Phone, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Field, Modal, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import {
  ACTIVITY_LABEL,
  LEAD_SELECT,
  SOURCE_LABEL,
  STAGES,
  whatsappLink,
  type Activity,
  type ActivityType,
  type CrmStage,
  type Lead,
  type Task,
  type TeamMember,
} from "./crm";

const COMPOSER_TYPES: ActivityType[] = ["nota", "ligacao", "whatsapp", "email", "reuniao"];

export function LeadDrawer({
  leadId,
  team,
  onClose,
  onChanged,
}: {
  leadId: string;
  team: TeamMember[];
  onClose: () => void;
  /** lead atualizado, ou null quando foi excluído */
  onChanged: (lead: Lead | null) => void;
}) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [lead, setLead] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [noteType, setNoteType] = useState<ActivityType>("nota");
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [showConvert, setShowConvert] = useState(false);

  useEffect(() => {
    load();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId]);

  async function load() {
    const [leadRes, actRes, taskRes] = await Promise.all([
      supabase.from("crm_leads").select(LEAD_SELECT).eq("id", leadId).maybeSingle(),
      supabase.from("crm_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      supabase.from("crm_tasks").select("*").eq("lead_id", leadId).order("done").order("due_date", { nullsFirst: false }),
    ]);
    if (leadRes.error) setError(leadRes.error.message);
    setLead(leadRes.data as Lead | null);
    setDraft(leadRes.data as Lead | null);
    setActivities((actRes.data as Activity[]) ?? []);
    setTasks((taskRes.data as Task[]) ?? []);
  }

  const teamName = (id: string | null) => (id ? team.find((t) => t.user_id === id)?.name ?? "Equipe" : "Site");

  async function save(patch: Partial<Lead>) {
    if (!lead) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.from("crm_leads").update(patch).eq("id", lead.id).select(LEAD_SELECT).single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "falha ao salvar");
      return;
    }
    setLead(data as Lead);
    setDraft(data as Lead);
    onChanged(data as Lead);
    // mudança de etapa gera atividade automática no banco
    if (patch.stage) await load();
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await save({
      name: draft.name.trim(),
      email: draft.email?.trim().toLowerCase() || null,
      whatsapp: draft.whatsapp?.trim() || null,
      business_name: draft.business_name?.trim() || null,
      instagram: draft.instagram?.trim().replace(/^@/, "") || null,
      estimated_value: draft.estimated_value != null && String(draft.estimated_value) !== "" ? Number(draft.estimated_value) : null,
      assigned_to: draft.assigned_to || null,
      next_follow_up: draft.next_follow_up || null,
    });
  }

  async function changeStage(stage: CrmStage) {
    if (!lead || stage === lead.stage) return;
    let lost_reason = lead.lost_reason;
    if (stage === "perdido") lost_reason = prompt("Motivo da perda (opcional):", lead.lost_reason ?? "") || null;
    await save({ stage, lost_reason });
  }

  async function addActivity(e: FormEvent) {
    e.preventDefault();
    if (!note.trim() || !lead) return;
    const { error } = await supabase.from("crm_activities").insert({ lead_id: lead.id, author_id: me, type: noteType, content: note.trim() });
    if (error) {
      setError(error.message);
      return;
    }
    setNote("");
    await load();
  }

  async function deleteActivity(a: Activity) {
    if (!confirm("Excluir este registro?")) return;
    await supabase.from("crm_activities").delete().eq("id", a.id);
    await load();
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !lead) return;
    const { error } = await supabase.from("crm_tasks").insert({
      lead_id: lead.id,
      title: taskTitle.trim(),
      due_date: taskDue || null,
      assigned_to: lead.assigned_to ?? me,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setTaskTitle("");
    setTaskDue("");
    await load();
  }

  async function toggleTask(t: Task) {
    await supabase.from("crm_tasks").update({ done: !t.done }).eq("id", t.id);
    await load();
  }

  async function deleteLead() {
    if (!lead || !confirm(`Excluir o lead "${lead.name}" e todo o histórico? Isso não pode ser desfeito.`)) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", lead.id);
    if (error) {
      setError(error.message);
      return;
    }
    onChanged(null);
    onClose();
  }

  const set = (k: keyof Lead) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl bg-bg overflow-y-auto shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {!lead || !draft ? (
          <div className="p-8 text-muted">{error ?? "Carregando..."}</div>
        ) : (
          <>
            <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl truncate">{lead.name}</h2>
                  <p className="text-sm text-muted">
                    {lead.business_name ?? "Sem delivery informado"} · {SOURCE_LABEL[lead.source] ?? lead.source} · entrou em {formatDate(lead.created_at)}
                  </p>
                </div>
                <button onClick={onClose} className="p-1 text-muted hover:text-text" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {STAGES.map((s) => (
                  <button
                    key={s.key}
                    disabled={saving}
                    onClick={() => changeStage(s.key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                      lead.stage === s.key ? "bg-sidebar-bg text-white border-sidebar-bg" : "border-border text-muted hover:border-green bg-card"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {lead.stage === "perdido" && lead.lost_reason && <p className="text-xs text-red mt-2">Motivo: {lead.lost_reason}</p>}
            </header>

            <div className="p-6 space-y-6">
              {error && <p className="text-sm text-red">{error}</p>}

              <div className="flex flex-wrap gap-2">
                {lead.whatsapp && (
                  <a href={whatsappLink(lead.whatsapp, `Olá ${lead.name.split(" ")[0]}! Aqui é da Blyn.`)} target="_blank" rel="noreferrer" className={primaryButton}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                )}
                {lead.whatsapp && (
                  <a href={`tel:${lead.whatsapp.replace(/\D/g, "")}`} className={secondaryButton}>
                    <Phone className="h-4 w-4" /> Ligar
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className={secondaryButton}>
                    <Mail className="h-4 w-4" /> E-mail
                  </a>
                )}
                {lead.instagram && (
                  <a href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noreferrer" className={secondaryButton}>
                    <AtSign className="h-4 w-4" /> Instagram
                  </a>
                )}
                {lead.account_user_id ? (
                  <span className="inline-flex items-center gap-2 rounded-lg bg-green/10 text-green-dark px-3 py-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4" /> Conta criada
                  </span>
                ) : (
                  <button onClick={() => setShowConvert(true)} className={secondaryButton}>
                    <UserPlus className="h-4 w-4" /> Criar conta
                  </button>
                )}
              </div>

              {(lead.challenge || lead.message || lead.utm) && (
                <section className="bg-card border border-border rounded-2xl p-5 text-sm space-y-2">
                  <h3 className="text-sm uppercase tracking-wide text-muted">Respostas do formulário</h3>
                  {lead.challenge && (
                    <p><span className="text-muted">Principal desafio:</span> <strong>{lead.challenge}</strong></p>
                  )}
                  {lead.message && <p className="whitespace-pre-wrap"><span className="text-muted">Mensagem:</span> {lead.message}</p>}
                  {lead.utm && Object.keys(lead.utm).length > 0 && (
                    <p className="text-xs text-muted">
                      {Object.entries(lead.utm).map(([k, v]) => `${k.replace("utm_", "")}: ${v}`).join(" · ")}
                    </p>
                  )}
                </section>
              )}

              <form onSubmit={saveDetails} className="bg-card border border-border rounded-2xl p-5 grid grid-cols-2 gap-3">
                <h3 className="col-span-2 text-sm uppercase tracking-wide text-muted">Dados do lead</h3>
                <Field label="Nome">
                  <input required value={draft.name} onChange={set("name")} className={inputClass} />
                </Field>
                <Field label="Delivery / empresa">
                  <input value={draft.business_name ?? ""} onChange={set("business_name")} className={inputClass} />
                </Field>
                <Field label="WhatsApp">
                  <input value={draft.whatsapp ?? ""} onChange={set("whatsapp")} className={inputClass} />
                </Field>
                <Field label="E-mail">
                  <input type="email" value={draft.email ?? ""} onChange={set("email")} className={inputClass} />
                </Field>
                <Field label="Instagram">
                  <input value={draft.instagram ?? ""} onChange={set("instagram")} className={inputClass} />
                </Field>
                <Field label="Valor mensal estimado (R$)">
                  <input type="number" step="0.01" min="0" value={draft.estimated_value ?? ""} onChange={set("estimated_value")} className={inputClass} />
                </Field>
                <Field label="Responsável">
                  <select value={draft.assigned_to ?? ""} onChange={set("assigned_to")} className={inputClass}>
                    <option value="">Sem responsável</option>
                    {team.map((t) => (
                      <option key={t.user_id} value={t.user_id}>{t.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Próximo follow-up">
                  <input type="date" value={draft.next_follow_up ?? ""} onChange={set("next_follow_up")} className={inputClass} />
                </Field>
                <div className="col-span-2 flex justify-between items-center pt-1">
                  <button type="button" onClick={deleteLead} className="text-sm text-red hover:underline flex items-center gap-1">
                    <Trash2 className="h-4 w-4" /> Excluir lead
                  </button>
                  <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar dados"}</button>
                </div>
              </form>

              <section className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Tarefas</h3>
                <ul className="space-y-1.5 mb-3">
                  {tasks.length === 0 && <li className="text-sm text-muted">Nenhuma tarefa para este lead.</li>}
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <button onClick={() => toggleTask(t)} aria-label={t.done ? "Reabrir" : "Concluir"}>
                        {t.done ? <CheckCircle2 className="h-5 w-5 text-green" /> : <Circle className="h-5 w-5 text-muted" />}
                      </button>
                      <span className={`flex-1 ${t.done ? "line-through text-muted" : ""}`}>{t.title}</span>
                      {t.due_date && <span className="text-xs text-muted">{formatDate(t.due_date)}</span>}
                    </li>
                  ))}
                </ul>
                <form onSubmit={addTask} className="flex gap-2">
                  <input placeholder="Nova tarefa (ex.: enviar proposta)" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className={inputClass} />
                  <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={`${inputClass} w-40`} />
                  <button type="submit" className={secondaryButton}>Adicionar</button>
                </form>
              </section>

              <section className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm uppercase tracking-wide text-muted mb-3">Histórico</h3>
                <form onSubmit={addActivity} className="mb-5">
                  <div className="flex gap-1.5 mb-2">
                    {COMPOSER_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNoteType(t)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border ${noteType === t ? "bg-green text-white border-green" : "border-border text-muted"}`}
                      >
                        {ACTIVITY_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    placeholder="O que aconteceu neste contato?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex justify-end mt-2">
                    <button type="submit" disabled={!note.trim()} className={primaryButton}>Registrar</button>
                  </div>
                </form>

                <ol className="relative border-l border-border ml-2 space-y-4">
                  {activities.map((a) => (
                    <li key={a.id} className="ml-4">
                      <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${a.type === "formulario" ? "bg-blue-500" : a.type === "etapa" ? "bg-amber-500" : "bg-green"}`} />
                      <div className="flex items-center justify-between gap-2 text-xs text-muted">
                        <span>
                          <strong className="text-text">{ACTIVITY_LABEL[a.type]}</strong> · {teamName(a.author_id)} · {formatDateTime(a.created_at)}
                        </span>
                        {a.author_id === me && a.type !== "etapa" && (
                          <button onClick={() => deleteActivity(a)} className="hover:text-red" aria-label="Excluir registro">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-1">{a.content}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </aside>

      {showConvert && lead && (
        <ConvertModal
          lead={lead}
          onClose={() => setShowConvert(false)}
          onDone={async (accountId) => {
            setShowConvert(false);
            await supabase.from("crm_activities").insert({
              lead_id: lead.id,
              author_id: me,
              type: "sistema",
              content: "Conta de restaurante criada a partir do lead.",
            });
            await save({ account_user_id: accountId, stage: "ganho" });
          }}
        />
      )}
    </div>
  );
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function ConvertModal({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: (accountId: string) => void }) {
  const [restaurantName, setRestaurantName] = useState(lead.business_name ?? lead.name);
  const [email, setEmail] = useState(lead.email ?? "");
  const [password] = useState(randomPassword);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("admin-manage-accounts", {
      body: { action: "create", restaurant_name: restaurantName.trim(), email: email.trim().toLowerCase(), password },
    });
    setSaving(false);
    if (error || !data?.user_id) {
      let message = error?.message ?? "falha ao criar conta";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // mantém a mensagem
      }
      setError(message);
      return;
    }
    setCreated(data.user_id);
  }

  const credentials = `Acesso Blyn\nE-mail: ${email}\nSenha: ${password}\nEntre e troque a senha em Configurações.`;

  return (
    <Modal title="Criar conta de restaurante" onClose={created ? () => onDone(created) : onClose}>
      {created ? (
        <div className="space-y-4">
          <p className="text-sm">Conta criada com 7 dias de teste. Envie os dados de acesso ao cliente:</p>
          <pre className="bg-bg rounded-xl p-4 text-sm whitespace-pre-wrap">{credentials}</pre>
          <div className="flex gap-2 justify-end">
            <button onClick={() => navigator.clipboard.writeText(credentials)} className={secondaryButton}>
              <Copy className="h-4 w-4" /> Copiar
            </button>
            {lead.whatsapp && (
              <a href={whatsappLink(lead.whatsapp, credentials)} target="_blank" rel="noreferrer" className={secondaryButton}>
                <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
              </a>
            )}
            <button onClick={() => onDone(created)} className={primaryButton}>Concluir</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nome do restaurante">
            <input required value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="E-mail de login">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Senha provisória (gerada)">
            <input readOnly value={password} className={`${inputClass} font-mono bg-bg`} />
          </Field>
          <p className="text-xs text-muted">O lead vai para "Ganho" e fica vinculado à conta. A assinatura começa em teste; ative o plano em Contas.</p>
          {error && <p className="text-sm text-red">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button>
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Criando..." : "Criar conta"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
