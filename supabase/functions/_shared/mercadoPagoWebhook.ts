// Lógica compartilhada pelos dois endpoints de webhook do Mercado Pago
// (produção e teste) — o Mercado Pago tem um campo de URL separado pra cada
// ambiente no painel deles, então em vez de um endpoint só tentando adivinhar
// pelo live_mode do payload, cada ambiente tem sua própria function, e o
// ambiente é gravado de forma explícita (não inferida).
import { jsonResponse } from "./cors.ts";
import { getAdminClient } from "./supabaseAdmin.ts";

export async function handleMercadoPagoWebhook(req: Request, environment: "production" | "test") {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    const url = new URL(req.url);
    payload = Object.fromEntries(url.searchParams.entries());
  }

  const admin = getAdminClient();
  const eventType =
    (payload as Record<string, unknown>)?.type ??
    (payload as Record<string, unknown>)?.topic ??
    "unknown";

  const { error } = await admin.from("webhook_events").insert({
    source: "mercado_pago",
    environment,
    event_type: String(eventType),
    payload,
    processed: false,
    processing_note:
      "Recebido e logado. Verificação de assinatura + ativação automática ainda não implementadas " +
      "(fase futura) — ativar manualmente via painel admin.",
  });

  if (error) {
    console.error(`mercado-pago-webhook (${environment}): falha ao gravar webhook_events`, error);
  }

  // Sempre 200 pro Mercado Pago, mesmo se o log interno falhar — evita
  // retentativas excessivas por um problema nosso.
  return jsonResponse({ received: true, environment }, 200);
}
