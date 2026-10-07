-- Papel de admin da PLATAFORMA (não confundir com "dono do restaurante" —
-- esse já existe e corresponde ao papel "empresa": é só quem tem uma linha
-- em profiles/subscriptions/restaurant_settings e nenhuma linha em
-- team_members). Admin enxerga/gerencia contas de todas as empresas, mas
-- NÃO ganha acesso aos dados operacionais de cada restaurante (vendas,
-- estoque, financeiro continuam privados — admin não é "super dono").
--
-- Não existe fluxo de auto-promoção a admin: a primeira conta vira admin via
-- seed.sql (dev local) ou um insert manual direto no banco (produção) — é
-- intencional não ter nenhuma API que crie um admin a partir de outro admin
-- sozinho, pra não virar uma escalada de privilégio recursiva sem auditoria.

create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- Nenhuma policy: a tabela só é lida pela função is_admin() (security
-- definer) — nem o próprio admin consegue fazer select direto nela.

create or replace function is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = uid);
$$;

grant execute on function is_admin(uuid) to authenticated;

-- Admin passa a enxergar profiles/subscriptions/restaurant_settings de TODAS
-- as empresas (necessário pra tela de Usuários), além do que já podia ver
-- de si mesmo. Escrita continua só via Edge Function admin-manage-accounts
-- (precisa de auth.admin.createUser() pra criar conta nova, então tem que
-- ser service role de qualquer forma).
create policy profiles_admin_select on profiles for select to authenticated
  using (is_admin(auth.uid()));

create policy subscriptions_admin_select on subscriptions for select to authenticated
  using (is_admin(auth.uid()));

create policy restaurant_settings_admin_select on restaurant_settings for select to authenticated
  using (is_admin(auth.uid()));

-- Log de eventos recebidos por webhook (Mercado Pago, e outros no futuro).
-- Toda chamada recebida é gravada aqui ANTES de qualquer tentativa de
-- processamento — é o que alimenta a tela de "Eventos" do painel admin,
-- e serve de auditoria mesmo quando o processamento automático falha ou
-- ainda nem existe (caso do Mercado Pago, que por enquanto só loga).
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  processing_note text,
  received_at timestamptz not null default now()
);

create index webhook_events_received_at_idx on webhook_events (received_at desc);
create index webhook_events_source_idx on webhook_events (source);

alter table webhook_events enable row level security;

create policy webhook_events_admin_select on webhook_events for select to authenticated
  using (is_admin(auth.uid()));
-- Sem policy de INSERT/UPDATE/DELETE: só a Edge Function do webhook (service
-- role) grava aqui.
