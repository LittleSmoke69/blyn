// Devolve as URLs de webhook (produção e teste) pro painel admin mostrar/
// copiar — sempre com o DOMÍNIO DA APLICAÇÃO, nunca o host do Supabase. A
// variável de ambiente PUBLIC_APP_DOMAIN precisa ser configurada quando o
// domínio real existir (ex: na VPS, apontando pro BunkerWeb); até lá, a
// function avisa claramente que está usando um valor provisório.
//
// Caminho "limpo" (/webhooks/mercado-pago e /webhooks/mercado-pago/test):
// isso exige uma regra no proxy reverso de produção (BunkerWeb) reescrevendo
// esses paths pros internos reais (/functions/v1/mercado-pago-webhook e
// /functions/v1/mercado-pago-webhook-test) — essa regra ainda não existe
// (não há VPS/BunkerWeb configurado ainda), por isso o campo
// "proxy_rule_pending" vem true até alguém confirmar que a regra foi criada.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { AdminAuthError, requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    await requireAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse({ error: "falha de autorização" }, 403);
  }

  const configuredDomain = Deno.env.get("PUBLIC_APP_DOMAIN");
  const domainConfigured = !!configuredDomain;
  const domain = configuredDomain || "SEU-DOMINIO-AQUI.exemplo";

  return jsonResponse({
    domain_configured: domainConfigured,
    proxy_rule_pending: true,
    note: domainConfigured
      ? "Domínio configurado. Falta confirmar que o BunkerWeb já reescreve /webhooks/mercado-pago* pros paths internos antes de cadastrar essas URLs no Mercado Pago."
      : "PUBLIC_APP_DOMAIN ainda não configurado — essas URLs são só um exemplo do formato final, não cadastre no Mercado Pago ainda.",
    production: {
      url: `https://${domain}/webhooks/mercado-pago`,
      internal_path: "/functions/v1/mercado-pago-webhook",
    },
    test: {
      url: `https://${domain}/webhooks/mercado-pago/test`,
      internal_path: "/functions/v1/mercado-pago-webhook-test",
    },
  });
});
