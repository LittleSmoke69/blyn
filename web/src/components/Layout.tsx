import { Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import { MobileShell } from "./MobileShell";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { access, isAdmin } = useAuth();
  const trialEnd = access?.status === "trial" ? access.trialEndDate : null;
  const trialDaysLeft = trialEnd ? Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <MobileShell sidebar={<Sidebar />} maxWidth="max-w-[1400px]">
      {!isAdmin && access?.status === "past_due" && (
        <div className="mb-6 rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">
          Há um pagamento pendente na sua assinatura. Regularize para não perder o acesso.
        </div>
      )}
      {!isAdmin && trialDaysLeft !== null && trialDaysLeft <= 3 && trialEnd && (
        <div className="mb-6 rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-sm text-green-dark">
          Seu teste gratuito termina em {formatDate(trialEnd)}. Fale com a equipe Blyn para assinar.
        </div>
      )}
      <Outlet />
    </MobileShell>
  );
}
