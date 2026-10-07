// Endpoint de PRODUÇÃO — é essa URL que vai no campo "Modo produção" do
// painel de webhooks do Mercado Pago.
import { handleOptions } from "../_shared/cors.ts";
import { handleMercadoPagoWebhook } from "../_shared/mercadoPagoWebhook.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  return handleMercadoPagoWebhook(req, "production");
});
