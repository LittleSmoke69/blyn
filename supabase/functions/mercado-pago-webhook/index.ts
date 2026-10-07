// STUB — só a rota e o contrato estão definidos nesta fase. Integração
// completa com o Mercado Pago (verificação de assinatura, busca do pagamento
// real na API deles, criação da preference) é trabalho futuro, fora do
// escopo desta fase (schema + auth).
//
// Contrato pretendido:
//   1. Receber a notificação IPN do Mercado Pago (query params: topic, id).
//   2. NUNCA confiar no corpo do webhook sozinho — verificar o header
//      x-signature contra um segredo guardado em env, e then buscar o status
//      real do pagamento na API do Mercado Pago (GET /v1/payments/{id}).
//   3. Se status aprovado: resolver a assinatura alvo via `external_reference`
//      (setado na criação da preference, deve ser o user_id do dono) e setar
//      subscriptions.status='active', plan='pro', expires_at calculado a
//      partir de billing_cycle.
//   4. Sempre responder 200 pro Mercado Pago (mesmo em erro de validação
//      interna) pra evitar retentativas excessivas — logar o erro, não
//      propagar como erro HTTP.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  console.log("mercado-pago-webhook: recebido, integração ainda não implementada", {
    method: req.method,
    url: req.url,
  });

  // TODO (fase futura): verificar assinatura, buscar pagamento real, ativar
  // a assinatura correspondente via supabase admin client.
  return jsonResponse({ received: true }, 200);
});
