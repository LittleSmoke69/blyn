import { ArrowLeft, Building2, CheckSquare, FormInput, Kanban, LayoutDashboard, LogOut, Webhook } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const ADMIN_NAV = [
  { label: "Visão geral", path: "/admin", icon: LayoutDashboard },
  { label: "CRM · Funil", path: "/admin/crm", icon: Kanban },
  { label: "Tarefas", path: "/admin/tasks", icon: CheckSquare },
  { label: "Contas", path: "/admin/accounts", icon: Building2 },
  { label: "Formulário do site", path: "/admin/forms", icon: FormInput },
  { label: "Webhooks", path: "/admin/events", icon: Webhook },
];

export function AdminLayout() {
  const { session, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-bg border-r border-sidebar-border">
        <div className="flex h-20 items-center gap-3 px-6 border-b border-sidebar-border">
          <img src={`${import.meta.env.BASE_URL}logo-blyn-branca.png`} alt="Blyn" className="h-8 w-auto object-contain" />
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-green text-sidebar-bg px-2 py-0.5">Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/admin"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-active-bg text-sidebar-active-text"
                    : "text-sidebar-text hover:bg-white/5 hover:text-sidebar-text-hover",
                ].join(" ")
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          <NavLink
            to="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-sidebar-text hover:bg-white/5 hover:text-sidebar-text-hover"
          >
            <ArrowLeft className="h-[18px] w-[18px]" /> Voltar ao sistema
          </NavLink>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-[11px] text-sidebar-text truncate">Equipe Blyn</p>
            <p className="text-[13px] text-sidebar-text-hover truncate">{session?.user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-sidebar-text hover:bg-white/5 hover:text-sidebar-text-hover"
          >
            <LogOut className="h-[18px] w-[18px]" /> Sair
          </button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen">
        <div className="p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
