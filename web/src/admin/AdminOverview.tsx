import { LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBanner, PageHeader, StatCard } from "../components/ui";
import { formatDate, formatPercent, localDateKey } from "../lib/format";
import { supabase } from "../lib/supabase";
import { effectiveStatus, type Account } from "./accounts";
import { STAGES, SOURCE_LABEL, type CrmStage } from "./crm";

interface LeadLite {
  id: string;
  name: string;
  business_name: string | null;
  source: string;
  stage: CrmStage;
  assigned_to: string | null;
  created_at: string;
}

export function AdminOverview() {
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openTasks, setOpenTasks] = useState<{ due_date: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [leadsRes, accRes, taskRes] = await Promise.all([
      supabase.from("crm_leads").select("id, name, business_name, source, stage, assigned_to, created_at").order("created_at", { ascending: false }),
      supabase.rpc("admin_list_accounts"),
      supabase.from("crm_tasks").select("due_date").eq("done", false),
    ]);
    const err = leadsRes.error ?? accRes.error ?? taskRes.error;
    if (err) setError(err.message);
    setLeads((leadsRes.data as LeadLite[]) ?? []);
    setAccounts(((accRes.data as Account[]) ?? []).filter((a) => !a.is_team_member));
    setOpenTasks(taskRes.data ?? []);
    setLoading(false);
  }

  const today = localDateKey();

  const stats = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekKey = localDateKey(weekAgo);
    const won = leads.filter((l) => l.stage === "ganho").length;
    const lost = leads.filter((l) => l.stage === "perdido").length;
    const in3days = new Date(Date.now() + 3 * 86_400_000).toISOString();
    return {
      newThisWeek: leads.filter((l) => localDateKey(new Date(l.created_at)) >= weekKey).length,
      open: leads.filter((l) => !["ganho", "perdido"].includes(l.stage)).length,
      conversion: won + lost > 0 ? (won / (won + lost)) * 100 : 0,
      active: accounts.filter((a) => effectiveStatus(a) === "active").length,
      trialsEnding: accounts.filter(
        (a) => effectiveStatus(a) === "trial" && a.trial_end_date && a.trial_end_date <= in3days
      ),
      overdueTasks: openTasks.filter((t) => t.due_date && t.due_date < today).length,
      todayTasks: openTasks.filter((t) => t.due_date === today).length,
    };
  }, [leads, accounts, openTasks, today]);

  const daily = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return localDateKey(d);
    });
    const count = new Map(days.map((d) => [d, 0]));
    for (const l of leads) {
      const k = localDateKey(new Date(l.created_at));
      if (count.has(k)) count.set(k, count.get(k)! + 1);
    }
    return days.map((d) => ({ label: d.slice(8, 10) + "/" + d.slice(5, 7), leads: count.get(d)! }));
  }, [leads]);

  const funnel = STAGES.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.key).length }));
  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);
  const unassigned = leads.filter((l) => l.stage === "novo" && !l.assigned_to).slice(0, 6);

  const show = (v: number | string) => (loading ? "..." : v);

  return (
    <div>
      <PageHeader title="Visão geral" subtitle="Painel da equipe Blyn" icon={LayoutDashboard} />
      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard label="Leads novos (7 dias)" value={show(stats.newThisWeek)} valueClassName="text-blue-700" />
        <StatCard label="Leads em negociação" value={show(stats.open)} />
        <StatCard label="Taxa de conversão" value={show(formatPercent(stats.conversion))} valueClassName="text-green-dark" />
        <StatCard label="Assinantes ativos" value={show(stats.active)} valueClassName="text-green-dark" />
        <StatCard
          label="Tarefas atrasadas"
          value={show(stats.overdueTasks)}
          valueClassName={stats.overdueTasks > 0 ? "text-red" : ""}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted mb-4">Leads recebidos · últimos 30 dias</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={4} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
              <Bar dataKey="leads" name="Leads" fill="var(--green)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted mb-4">Funil</h3>
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{f.label}</span>
                  <span className="font-semibold">{f.count}</span>
                </div>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted">Leads novos sem responsável</h3>
            <Link to="/admin/crm" className="text-sm text-green-dark hover:underline">Abrir CRM</Link>
          </div>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted">Tudo distribuído. 👌</p>
          ) : (
            <ul className="divide-y divide-border">
              {unassigned.map((l) => (
                <li key={l.id}>
                  <Link to={`/admin/crm?lead=${l.id}`} className="flex justify-between gap-3 py-2.5 text-sm hover:text-green-dark min-w-0">
                    <span>
                      <strong>{l.name}</strong> {l.business_name && <span className="text-muted">· {l.business_name}</span>}
                    </span>
                    <span className="text-xs text-muted">{SOURCE_LABEL[l.source] ?? l.source} · {formatDate(l.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted">Testes terminando em até 3 dias</h3>
            <Link to="/admin/accounts" className="text-sm text-green-dark hover:underline">Ver contas</Link>
          </div>
          {stats.trialsEnding.length === 0 ? (
            <p className="text-sm text-muted">Nenhum teste terminando agora.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.trialsEnding.map((a) => (
                <li key={a.user_id} className="flex justify-between gap-3 py-2.5 text-sm min-w-0">
                  <span>
                    <strong>{a.restaurant_name}</strong> <span className="text-muted">· {a.email}</span>
                  </span>
                  <span className="text-xs text-amber-700 font-semibold">{a.trial_end_date ? formatDate(a.trial_end_date) : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {stats.todayTasks > 0 && (
            <p className="text-sm mt-4">
              Você tem <Link to="/admin/tasks" className="text-green-dark font-semibold hover:underline">{stats.todayTasks} tarefa(s) para hoje</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
