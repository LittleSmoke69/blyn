import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

interface AuthState {
  loading: boolean;
  session: Session | null;
  restaurantName: string | null;
  /** Dono efetivo da conta (o próprio uid, ou owner_id se for membro de equipe).
   * Toda tabela com dono exige user_id = ownerId nos inserts (sem default no banco). */
  ownerId: string | null;
  /** null = dono (acesso total); array = membro de equipe, só essas chaves */
  permissions: string[] | null;
  can: (key: string) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  async function loadProfile(currentSession: Session) {
    const uid = currentSession.user.id;

    const { data: teamRow } = await supabase
      .from("team_members")
      .select("owner_id, permissions")
      .eq("user_id", uid)
      .maybeSingle();

    const ownerId = teamRow?.owner_id ?? uid;
    setOwnerId(ownerId);
    setPermissions(teamRow ? (teamRow.permissions as string[]) : null);

    const { data: settings } = await supabase
      .from("restaurant_settings_public")
      .select("restaurant_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    setRestaurantName(settings?.restaurant_name ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession);
      } else {
        setRestaurantName(null);
        setOwnerId(null);
        setPermissions(null);
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
    return error?.message ?? null;
  }

  /** Recarrega nome do restaurante etc. depois de editar Configurações. */
  async function refreshProfile() {
    if (session) await loadProfile(session);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ loading, session, restaurantName, ownerId, permissions, can, signIn, signOut, refreshProfile }}
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
