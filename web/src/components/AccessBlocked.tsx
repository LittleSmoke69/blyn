import { LogOut } from "lucide-react";
import { useAuth, type SubscriptionStatus } from "../lib/auth";
import { formatDate } from "../lib/format";

const REASON: Record<SubscriptionStatus, string> = {
  trial: "O seu período de teste gratuito terminou",
  active: "A sua assinatura venceu",
  past_due: "Há um pagamento pendente na sua assinatura",
  canceled: "A sua assinatura foi cancelada",
  expired: "A sua assinatura expirou",
};

/** Tela única pra conta sem assinatura ativa (regra em account_access()). */
export function AccessBlocked() {
  const { access, session, signOut } = useAuth();
  const status = access?.status ?? null;
  const endedAt = status === "trial" ? access?.trialEndDate : access?.expiresAt;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src={`${import.meta.env.BASE_URL}logo-blyn-preta.png`} alt="Blyn" className="h-10 w-auto object-contain" />
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <h1 className="text-xl mb-2">{status ? REASON[status] : "Conta sem assinatura ativa"}</h1>
          {endedAt && <p className="text-muted text-sm mb-1">Desde {formatDate(endedAt)}.</p>}
          <p className="text-muted text-sm mb-6">
            Os seus dados continuam guardados. Fale com a equipe Blyn para reativar o acesso.
          </p>
          <p className="text-[12px] text-muted mb-4 truncate">{session?.user.email}</p>
          <div className="flex flex-col gap-2">
            <a
              href="/"
              className="w-full rounded-lg bg-green text-white font-semibold py-2.5 text-sm hover:bg-green-dark transition-colors"
            >
              Ir para o site da Blyn
            </a>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-black/5"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
