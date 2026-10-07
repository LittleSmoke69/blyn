// Endpoint de TESTE/SANDBOX — é essa URL que vai no campo "Modo teste" do
// painel de webhooks do Mercado Pago. Mesma lógica do endpoint de produção,
// só muda a tag de ambiente gravada em webhook_events.
import { handleOptions } from "../_shared/cors.ts";
import { handleMercadoPagoWebhook } from "../_shared/mercadoPagoWebhook.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  return handleMercadoPagoWebhook(req, "test");
});
