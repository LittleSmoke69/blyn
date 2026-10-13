import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Casca responsiva compartilhada pelo app e pelo painel admin: no desktop o
 * menu lateral fica fixo; abaixo de md ele vira gaveta, aberta pela barra do topo.
 */
export function MobileShell({
  sidebar,
  children,
  maxWidth,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  maxWidth: string;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Fecha a gaveta ao trocar de tela.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar-bg px-4">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="text-sidebar-text-hover">
          <Menu className="h-6 w-6" />
        </button>
        <img src={`${import.meta.env.BASE_URL}logo-blyn-branca.png`} alt="Blyn" className="h-7 w-auto object-contain" />
      </header>

      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}

      <div
        className={[
          "fixed left-0 top-0 z-50 h-screen w-64 transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {open && (
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden absolute -right-11 top-3 rounded-full bg-sidebar-bg p-2 text-sidebar-text-hover"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {sidebar}
      </div>

      <main className="md:ml-64 min-h-screen">
        <div className={`p-4 md:p-8 ${maxWidth} mx-auto`}>{children}</div>
      </main>
    </div>
  );
}
