import { LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NAV_ITEMS } from "./navItems";

export function Sidebar() {
  const { can, restaurantName, session, signOut } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-bg border-r border-sidebar-border">
      <div className="flex h-20 items-center px-6 border-b border-sidebar-border">
        <img src="/logo-blyn-branca.png" alt="Blyn" className="h-9 w-auto object-contain" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
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
            <span className="flex-1">{item.label}</span>
            {!item.implemented && (
              <span className="text-[10px] uppercase tracking-wide text-sidebar-text/50">em breve</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-[13px] font-medium text-sidebar-text-hover truncate">
            {restaurantName ?? "Carregando..."}
          </p>
          <p className="text-[11px] text-sidebar-text truncate mt-0.5">{session?.user.email}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-sidebar-text hover:bg-white/5 hover:text-sidebar-text-hover transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair
        </button>
      </div>
    </aside>
  );
}
