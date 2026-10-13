import { CheckCircle2, CheckSquare, Circle, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorBanner, PageHeader, PillTabs, inputClass, primaryButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { formatDate, localDateKey } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useCrmTeam, type Task } from "./crm";

type Filter = "mine" | "open" | "overdue" | "done";

export function AdminTasks() {
  const { session } = useAuth();
  const me = session?.user.id;
  const team = useCrmTeam();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("mine");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from("crm_tasks")
      .select("id, lead_id, title, due_date, done, assigned_to, created_at, crm_leads(name, business_name)")
      .order("done")
      .order("due_date", { nullsFirst: false })
      .limit(500);
    if (error) setError(error.message);
    setTasks((data as unknown as Task[]) ?? []);
    setLoading(false);
  }

  const today = localDateKey();
  const visible = tasks.filter((t) => {
    if (filter === "done") return t.done;
    if (t.done) return false;
    if (filter === "mine") return t.assigned_to === me;
    if (filter === "overdue") return !!t.due_date && t.due_date < today;
    return true;
  });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase
      .from("crm_tasks")
      .insert({ title: title.trim(), due_date: due || null, assigned_to: assignee || me });
    if (error) {
      setError(error.message);
      return;
    }
    setTitle("");
    setDue("");
    await load();
  }

  async function toggle(t: Task) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabase.from("crm_tasks").update({ done: !t.done }).eq("id", t.id);
    if (error) {
      setError(error.message);
      await load();
    }
  }

  async function remove(t: Task) {
    if (!confirm(`Excluir a tarefa "${t.title}"?`)) return;
    await supabase.from("crm_tasks").delete().eq("id", t.id);
    await load();
  }

  const name = (id: string | null) => (id ? team.find((m) => m.user_id === id)?.name ?? "—" : "—");
  const overdueCount = tasks.filter((t) => !t.done && t.due_date && t.due_date < today).length;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Tarefas da equipe" subtitle="Follow-ups e pendências do time comercial e de suporte" icon={CheckSquare} />

      <ErrorBanner message={error} />

      <form onSubmit={add} className="bg-card border border-border rounded-2xl p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_160px_200px_auto] gap-2">
        <input placeholder="Nova tarefa..." value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
          <option value="">Para mim</option>
          {team.filter((m) => m.user_id !== me).map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.name}</option>
          ))}
        </select>
        <button type="submit" className={primaryButton}>Adicionar</button>
      </form>

      <div className="mb-4">
        <PillTabs
          value={filter}
          onChange={setFilter}
          options={[
            { key: "mine", label: "Minhas" },
            { key: "open", label: "Todas abertas" },
            { key: "overdue", label: `Atrasadas${overdueCount ? ` (${overdueCount})` : ""}` },
            { key: "done", label: "Concluídas" },
          ]}
        />
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nada por aqui" description="Nenhuma tarefa neste filtro." />
      ) : (
        <ul className="bg-card border border-border rounded-2xl divide-y divide-border">
          {visible.map((t) => {
            const late = !t.done && t.due_date && t.due_date < today;
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <button onClick={() => toggle(t)} aria-label={t.done ? "Reabrir" : "Concluir"}>
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-green" /> : <Circle className="h-5 w-5 text-muted" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${t.done ? "line-through text-muted" : "font-medium"}`}>{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.lead_id && t.crm_leads ? (
                      <Link to={`/admin/crm?lead=${t.lead_id}`} className="text-green-dark hover:underline">
                        {t.crm_leads.business_name ?? t.crm_leads.name}
                      </Link>
                    ) : (
                      "Tarefa avulsa"
                    )}{" "}
                    · {name(t.assigned_to)}
                  </p>
                </div>
                {t.due_date && <span className={`text-xs ${late ? "text-red font-semibold" : "text-muted"}`}>{formatDate(t.due_date)}</span>}
                <button onClick={() => remove(t)} className="p-1 text-muted hover:text-red" aria-label="Excluir">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
