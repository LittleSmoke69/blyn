// Gateway genérico: o navegador NUNCA chama o Supabase direto, nem conhece
// a apikey. Ele só chama esta função (que, por sua vez, é alcançada através
// do domínio da própria aplicação quando um proxy reverso — qualquer um,
// BunkerWeb incluso — repassa `/api/*` pra cá na hora do deploy). O gateway
// injeta a apikey no servidor e repassa pro Kong (o gateway interno do
// Supabase), preservando o Authorization do usuário pra que o RLS continue
// sendo a segurança de verdade — isso aqui só evita que a apikey e a URL do
// Supabase apareçam em algum momento no DevTools do cliente.
//
// Rotas suportadas (tudo depois de /functions/v1/gateway/ é repassado tal
// qual pro Kong):
//   /functions/v1/gateway/rest/v1/<tabela>      -> PostgREST
//   /functions/v1/gateway/auth/v1/<endpoint>    -> GoTrue (signup/login/etc)
//   /functions/v1/gateway/storage/v1/<path>     -> Storage API
//   /functions/v1/gateway/functions/v1/<nome>   -> outras Edge Functions
//     (ex: create-public-order, chamada pelo cardápio digital público)
//
// Limitação conhecida, documentada e não escondida: Realtime (websocket) não
// dá pra proxiar por uma function request/response — isso exige um proxy de
// rede de verdade na frente (o BunkerWeb, quando entrar em produção). Até lá,
// a conexão de Realtime é a única coisa que ainda apontaria pro host do
// Supabase; todo o resto (CRUD, auth, storage, outras functions) passa por
// aqui.
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const KONG_INTERNAL_URL = Deno.env.get("KONG_INTERNAL_URL") ?? "http://kong:8000";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// No Supabase Cloud/CLI a função recebe o path completo; no self-hosted o
// Envoy/Kong já tira o "/functions/v1" e ela recebe só "/gateway/...".
const FUNCTION_PREFIXES = ["/functions/v1/gateway", "/gateway"];

// Headers que nunca devem ir pro cliente de volta (vazariam detalhes internos
// do Supabase/Kong) nem precisam ser repassados pro Kong na ida.
const STRIPPED_REQUEST_HEADERS = new Set(["host", "apikey", "content-length"]);
const STRIPPED_RESPONSE_HEADERS = new Set(["server", "x-kong-", "via"]);

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!ANON_KEY) {
    return new Response(JSON.stringify({ error: "gateway mal configurado (SUPABASE_ANON_KEY ausente)" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const incomingUrl = new URL(req.url);
  const prefix = FUNCTION_PREFIXES.find((p) => incomingUrl.pathname.startsWith(p));
  if (!prefix) {
    return new Response(JSON.stringify({ error: "rota inválida" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const forwardedPath = incomingUrl.pathname.slice(prefix.length) || "/";
  const targetUrl = new URL(forwardedPath + incomingUrl.search, KONG_INTERNAL_URL);

  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }
  // apikey é sempre a nossa (o cliente nunca manda/sabe disso). Se o cliente
  // já estiver logado, o Authorization dele é preservado — é o que o RLS usa
  // pra resolver auth.uid() e aplicar as policies normalmente.
  forwardHeaders.set("apikey", ANON_KEY);
  // Sem sessão, o supabase-js manda "Bearer <a chave placeholder do front>" —
  // não é JWT e o PostgREST recusaria (401 PGRST301), derrubando o cardápio
  // público. Qualquer Authorization que não seja um JWT vira o anon.
  const auth = forwardHeaders.get("authorization") ?? "";
  if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth)) {
    forwardHeaders.set("authorization", `Bearer ${ANON_KEY}`);
  }

  // Corpo repassado em streaming (não bufferiza): upload de vídeo do cardápio
  // chega a 50 MB e o worker tem limite de memória de 150 MB.
  const upstreamResponse = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
  });

  const responseHeaders = new Headers(corsHeaders);
  for (const [key, value] of upstreamResponse.headers.entries()) {
    const lower = key.toLowerCase();
    const isStripped = [...STRIPPED_RESPONSE_HEADERS].some((prefix) => lower.startsWith(prefix));
    if (!isStripped) {
      responseHeaders.set(key, value);
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
});
