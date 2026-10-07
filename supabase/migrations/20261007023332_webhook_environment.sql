-- Mercado Pago (e a maioria dos gateways de pagamento) tem URLs de webhook
-- SEPARADAS pra produção e pra teste/sandbox no próprio painel deles. Em vez
-- de inferir isso só pelo campo live_mode do payload (que pode não vir, ou
-- vir errado em teste manual), marcamos explicitamente pelo endpoint que
-- recebeu a chamada — cada ambiente tem sua própria Edge Function.

alter table webhook_events
  add column environment text not null default 'production'
    check (environment in ('production', 'test'));

create index webhook_events_environment_idx on webhook_events (environment);
