import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled" | "expired";

/** Situação da assinatura da conta (do dono, se for membro de equipe) — RPC account_access. */
export interface AccountAccess {
  status: SubscriptionStatus | null;
  trialEndDate: string | null;
  expiresAt: string | null;
  allowed: boolean;
}

interface AuthState {
  /** true até a sessão E o perfil (admin, permissões, assinatura) estarem carregados. */
  loading: boolean;
  session: Session | null;
  restaurantName: string | null;
  /** Dono efetivo da conta (o próprio uid, ou owner_id se for membro de equipe).
   * Toda tabela com dono exige user_id = ownerId nos inserts (sem default no banco). */
  ownerId: string | null;
  /** Admin da PLATAFORMA (equipe Blyn) — libera o painel /admin. */
  isAdmin: boolean;
  /** null = dono (acesso total); array = membro de equipe, só essas chaves */
  permissions: string[] | null;
  access: AccountAccess | null;
  /** true logo depois de um login pelo formulário (pra mandar admin pro painel). */
  freshLogin: boolean;
  clearFreshLogin: () => void;
  can: (key: string) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionKnown, setSessionKnown] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  // uid cujo perfil já está carregado; enquanto for diferente do uid da
  // sessão, o app fica em "Carregando..." em vez de montar rotas com
  // isAdmin/permissões ainda no valor padrão (o que redirecionava /admin pra home).
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const requestedUid = useRef<string | null>(null);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [freshLogin, setFreshLogin] = useState(false);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  async function loadProfile(currentSession: Session) {
    const uid = currentSession.user.id;

    const [{ data: teamRow }, { data: adminFlag }, { data: accessRows, error: accessError }] = await Promise.all([
      supabase.from("team_members").select("owner_id, permissions").eq("user_id", uid).maybeSingle(),
      supabase.rpc("is_admin", { uid }),
      supabase.rpc("account_access"),
    ]);
    setIsAdmin(adminFlag === true);

    const row = Array.isArray(accessRows) ? accessRows[0] : null;
    // Falha na consulta (rede, função ausente) não tranca o usuário fora.
    setAccess(
      accessError
        ? null
        : {
            status: row?.status ?? null,
            trialEndDate: row?.trial_end_date ?? null,
            expiresAt: row?.expires_at ?? null,
            allowed: row?.allowed === true,
          }
    );

    const ownerId = teamRow?.owner_id ?? uid;
    setOwnerId(ownerId);
    setPermissions(teamRow ? (teamRow.permissions as string[]) : null);

    const { data: settings } = await supabase
      .from("restaurant_settings_public")
      .select("restaurant_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    setRestaurantName(settings?.restaurant_name ?? null);
    setProfileUid(uid);
  }

  useEffect(() => {
    // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED... O perfil só é recarregado
    // quando muda o usuário — renovar o token (a cada hora) não pisca a tela.
    // setTimeout: chamar o supabase de dentro do callback pode travar o lock
    // de auth do supabase-js.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSessionKnown(true);
      if (!newSession) {
        requestedUid.current = null;
        setProfileUid(null);
        setRestaurantName(null);
        setOwnerId(null);
        setIsAdmin(false);
        setPermissions(null);
        setAccess(null);
        return;
      }
      if (requestedUid.current !== newSession.user.id) {
        requestedUid.current = newSession.user.id;
        setTimeout(() => {
          loadProfile(newSession).catch(() => setProfileUid(newSession.user.id));
        }, 0);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function can(key: string) {
    // dono (permissions === null) sempre pode; membro de equipe só se a
    // chave estiver no array concedido.
    return permissions === null || permissions.includes(key);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) setFreshLogin(true);
    return error ? translateAuthError(error.message) : null;
  }

  /** Recarrega nome do restaurante etc. depois de editar Configurações. */
  async function refreshProfile() {
    if (session) await loadProfile(session);
  }

  async function signOut() {
    setFreshLogin(false);
    await supabase.auth.signOut();
  }

  const loading = !sessionKnown || (!!session && profileUid !== session.user.id);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        restaurantName,
        ownerId,
        isAdmin,
        permissions,
        access,
        freshLogin,
        clearFreshLogin: () => setFreshLogin(false),
        can,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

function translateAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "E-mail ainda não confirmado. Fale com a equipe Blyn.";
  if (/too many|rate limit|429/i.test(message)) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return message;
}
