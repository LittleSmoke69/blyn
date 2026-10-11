import { CalendarClock, Download, LayoutList, Kanban, MessageCircle, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorBanner, Field, Modal, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";
import { exportCsv } from "../lib/exporters";
import { formatBRL, formatDate, formatDateTime, localDateKey } from "../lib/format";
import { supabase } from "../lib/supabase";
import { LEAD_SELECT, SOURCE_LABEL, STAGES, STAGE_LABEL, daysSince, useCrmTeam, whatsappLink, type CrmStage, type Lead } from "./crm";
import { LeadDrawer } from "./LeadDrawer";

type View = "kanban" | "list";

export function AdminCrm() {
  const team = useCrmTeam();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("kanban");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("todos");
  const [source, setSource] = useState("todas");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);
  const [params, setParams] = useSearchParams();
  const openId = params.get("lead");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase.from("crm_leads").select(LEAD_SELECT).order("position").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }

  const teamName = useMemo(() => new Map(team.map((t) => [t.user_id, t.name])), [team]);
  const sources = useMemo(() => [...new Set(leads.map((l) => l.source))], [leads]);

  const filtered = leads.filter((l) => {
    const q = search.trim().toLowerCase();
    const matches =
      !q ||
      [l.name, l.email, l.whatsapp, l.business_name, l.instagram].some((v) => v?.toLowerCase().includes(q));
    const byOwner = owner === "todos" || (owner === "nenhum" ? !l.assigned_to : l.assigned_to === owner);
    return matches && byOwner && (source === "todas" || l.source === source);
  });

  const byStage = (stage: CrmStage) => filtered.filter((l) => l.stage === stage).sort((a, b) => a.position - b.position);

  async function moveLead(leadId: string, stage: CrmStage, beforeId: string | null) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const column = leads.filter((l) => l.stage === stage && l.id !== leadId).sort((a, b) => a.position - b.position);
    let position: number;
    if (beforeId) {
      const idx = column.findIndex((l) => l.id === beforeId);
      const next = column[idx]?.position ?? 0;
      const prev = idx > 0 ? column[idx - 1].position : next - 2;
      position = (prev + next) / 2;
    } else {
      position = (column[column.length - 1]?.position ?? 0) + 1;
    }
    if (stage === "perdido" && lead.stage !== "perdido") {
      const reason = prompt("Motivo da perda (opcional):") ?? "";
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage, position, lost_reason: reason || null } : l)));
      const { error } = await supabase.from("crm_leads").update({ stage, position, lost_reason: reason || null }).eq("id", leadId);
      if (error) setError(error.message);
      return;
    }
    // Atualização otimista: o card muda de coluna na hora.
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage, position } : l)));
    const { error } = await supabase.from("crm_leads").update({ stage, position }).eq("id", leadId);
    if (error) {
      setError(error.message);
      await load();
    }
  }

  function onDrop(e: DragEvent, stage: CrmStage, beforeId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setOverStage(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id && id !== beforeId) moveLead(id, stage, beforeId);
    setDragId(null);
  }

  function openLead(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("lead", id);
    else next.delete("lead");
    setParams(next, { replace: true });
  }

  function exportLeads() {
    exportCsv(`leads-${localDateKey()}`, [
      {
        headers: ["Nome", "E-mail", "WhatsApp", "Delivery", "Instagram", "Desafio", "Origem", "Etapa", "Responsável", "Valor estimado", "Criado em"],
        rows: filtered.map((l) => [
          l.name,
          l.email ?? "",
          l.whatsapp ?? "",
          l.business_name ?? "",
          l.instagram ?? "",
          l.challenge ?? "",
          SOURCE_LABEL[l.source] ?? l.source,
          STAGE_LABEL[l.stage],
          l.assigned_to ? teamName.get(l.assigned_to) ?? "" : "",
          l.estimated_value != null ? Number(l.estimated_value) : "",
          formatDateTime(l.created_at),
        ]),
      },
    ]);
  }

  const pipelineValue = filtered
    .filter((l) => !["ganho", "perdido"].includes(l.stage))
    .reduce((s, l) => s + Number(l.estimated_value ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle={`${filtered.length} leads · ${formatBRL(pipelineValue)}/mês em negociação`}
        action={
          <div className="flex gap-2">
            <button onClick={() => load()} className={secondaryButton} aria-label="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={exportLeads} className={secondaryButton}>
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setShowNew(true)} className={primaryButton}>
              <Plus className="h-4 w-4" /> Novo lead
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Buscar por nome, e-mail, WhatsApp, delivery..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${inputClass} w-48`}>
          <option value="todos">Todos os responsáveis</option>
          <option value="nenhum">Sem responsável</option>
          {team.map((t) => (
            <option key={t.user_id} value={t.user_id}>{t.name}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputClass} w-48`}>
          <option value="todas">Todas as origens</option>
          {sources.map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
          ))}
        </select>
        <div className="ml-auto flex rounded-lg border border-border overflow-hidden">
          <button onClick={() => setView("kanban")} className={`px-3 py-2 ${view === "kanban" ? "bg-green text-white" : "bg-card text-muted"}`} aria-label="Kanban">
            <Kanban className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={`px-3 py-2 ${view === "list" ? "bg-green text-white" : "bg-card text-muted"}`} aria-label="Lista">
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
          {STAGES.map((stage) => {
            const items = byStage(stage.key);
            const total = items.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0);
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.key);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
                onDrop={(e) => onDrop(e, stage.key, null)}
                className={`w-72 shrink-0 rounded-2xl p-3 transition-colors ${overStage === stage.key ? "bg-green/10" : "bg-border/40"}`}
              >
                <div className="flex items-center justify-between px-1 mb-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                    {stage.label}
                    <span className="text-muted font-normal">{items.length}</span>
                  </span>
                  {total > 0 && <span className="text-xs text-muted">{formatBRL(total)}</span>}
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      ownerName={lead.assigned_to ? teamName.get(lead.assigned_to) : undefined}
                      dragging={dragId === lead.id}
                      onOpen={() => openLead(lead.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(lead.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onDrop={(e) => onDrop(e, stage.key, lead.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Lead</th>
                <th className="text-left px-5 py-3 font-medium">Contato</th>
                <th className="text-left px-5 py-3 font-medium">Origem</th>
                <th className="text-left px-5 py-3 font-medium">Etapa</th>
                <th className="text-left px-5 py-3 font-medium">Responsável</th>
                <th className="text-left px-5 py-3 font-medium">Follow-up</th>
                <th className="text-left px-5 py-3 font-medium">Entrou em</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted">Nenhum lead encontrado.</td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} onClick={() => openLead(l.id)} className="border-t border-border cursor-pointer hover:bg-bg/60">
                    <td className="px-5 py-3">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted">{l.business_name ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <p>{l.whatsapp ?? "—"}</p>
                      <p className="text-xs">{l.email}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">{SOURCE_LABEL[l.source] ?? l.source}</td>
                    <td className="px-5 py-3">{STAGE_LABEL[l.stage]}</td>
                    <td className="px-5 py-3 text-muted">{l.assigned_to ? teamName.get(l.assigned_to) ?? "—" : "—"}</td>
                    <td className="px-5 py-3">{l.next_follow_up ? formatDate(l.next_follow_up) : "—"}</td>
                    <td className="px-5 py-3 text-muted">{formatDate(l.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <LeadDrawer
          leadId={openId}
          team={team}
          onClose={() => openLead(null)}
          onChanged={(updated) => {
            if (updated) setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            else load();
          }}
        />
      )}

      {showNew && (
        <NewLeadModal
          team={team}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await load();
            openLead(id);
          }}
        />
      )}
    </div>
  );
}

function LeadCard({
  lead,
  ownerName,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  lead: Lead;
  ownerName?: string;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  const today = localDateKey();
  const overdue = lead.next_follow_up && lead.next_follow_up < today && !["ganho", "perdido"].includes(lead.stage);
  const idle = daysSince(lead.last_activity_at);
  const isNew = lead.stage === "novo" && daysSince(lead.created_at) < 1;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onOpen}
      className={`bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-green transition ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm leading-tight">{lead.name}</p>
        {isNew && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded-full px-1.5 py-0.5">novo</span>}
      </div>
      {lead.business_name && <p className="text-xs text-muted mt-0.5">{lead.business_name}</p>}
      {lead.challenge && <p className="text-[11px] mt-2 inline-block bg-bg rounded-md px-1.5 py-0.5 text-muted">{lead.challenge}</p>}
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted">
        <span className="flex items-center gap-2">
          {lead.whatsapp && (
            <a
              href={whatsappLink(lead.whatsapp, `Olá ${lead.name.split(" ")[0]}! Aqui é da Blyn.`)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-green-dark hover:text-green"
              aria-label="Abrir WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
          {lead.next_follow_up && (
            <span className={`flex items-center gap-1 ${overdue ? "text-red font-semibold" : ""}`}>
              <CalendarClock className="h-3.5 w-3.5" /> {formatDate(lead.next_follow_up).slice(0, 5)}
            </span>
          )}
          {lead.estimated_value != null && <span>{formatBRL(Number(lead.estimated_value))}</span>}
        </span>
        <span title={`Última atividade há ${idle} dia(s)`}>{ownerName ? ownerName.split(" ")[0] : `${idle}d`}</span>
      </div>
    </div>
  );
}

function NewLeadModal({
  team,
  onClose,
  onCreated,
}: {
  team: { user_id: string; name: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    whatsapp: "",
    business_name: "",
    instagram: "",
    source: "manual",
    estimated_value: "",
    assigned_to: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .insert({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase() || null,
        whatsapp: form.whatsapp.trim() || null,
        business_name: form.business_name.trim() || null,
        instagram: form.instagram.trim().replace(/^@/, "") || null,
        source: form.source,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
        assigned_to: form.assigned_to || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "falha ao criar lead");
      return;
    }
    onCreated(data.id);
  }

  return (
    <Modal title="Novo lead" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Nome" className="col-span-2">
          <input required value={form.name} onChange={set("name")} className={inputClass} />
        </Field>
        <Field label="WhatsApp">
          <input value={form.whatsapp} onChange={set("whatsapp")} className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
        </Field>
        <Field label="Delivery / empresa">
          <input value={form.business_name} onChange={set("business_name")} className={inputClass} />
        </Field>
        <Field label="Instagram">
          <input value={form.instagram} onChange={set("instagram")} className={inputClass} />
        </Field>
        <Field label="Origem">
          <select value={form.source} onChange={set("source")} className={inputClass}>
            {["manual", "indicacao", "instagram", "evento"].map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Valor mensal estimado (R$)">
          <input type="number" step="0.01" min="0" value={form.estimated_value} onChange={set("estimated_value")} className={inputClass} />
        </Field>
        <Field label="Responsável" className="col-span-2">
          <select value={form.assigned_to} onChange={set("assigned_to")} className={inputClass}>
            <option value="">Sem responsável</option>
            {team.map((t) => (
              <option key={t.user_id} value={t.user_id}>{t.name}</option>
            ))}
          </select>
        </Field>
        {error && <p className="col-span-2 text-sm text-red">{error}</p>}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Criar lead"}</button>
        </div>
      </form>
    </Modal>
  );
}
