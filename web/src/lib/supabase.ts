import { createClient } from "@supabase/supabase-js";

// O cliente aponta pro GATEWAY, nunca pro host do Supabase direto — a apikey
// real é injetada lá dentro, no servidor. A chave aqui é só um placeholder
// que o gateway ignora (ver supabase/functions/gateway/index.ts).
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL as string;

if (!GATEWAY_URL) {
  console.error(
    "VITE_GATEWAY_URL não configurada — copie .env.example para .env.local e ajuste."
  );
}

export const supabase = createClient(
  GATEWAY_URL || "http://localhost/gateway-nao-configurado",
  "placeholder-o-gateway-ignora-isso",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Cliente sempre anônimo pro cardápio digital público: sem sessão persistida,
// então mesmo com alguém logado no app no mesmo navegador a página pública lê
// as receitas pela policy de anon (recipes_public_select), igual um cliente.
export const publicSupabase = createClient(
  GATEWAY_URL || "http://localhost/gateway-nao-configurado",
  "placeholder-o-gateway-ignora-isso",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: "blyn-public-menu",
    },
  }
);
