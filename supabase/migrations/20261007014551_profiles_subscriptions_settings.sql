-- profiles: identidade privada do dono. subscriptions: status trial/pro.
-- restaurant_settings: dados públicos da loja (cardápio digital).
-- Todas as três são criadas pelo trigger de signup (próxima migration) — nunca
-- inseridas diretamente pelo cliente.

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  restaurant_name text not null,
  phone text,
  address text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_select on profiles for select to authenticated
  using (auth.uid() = user_id);
create policy profiles_update on profiles for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Sem policy de INSERT/DELETE: só o trigger (security definer) cria a linha.

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status subscription_status not null default 'trial',
  plan text not null default 'pro',
  billing_cycle billing_cycle not null default 'monthly',
  trial_end_date timestamptz,
  expires_at timestamptz,
  started_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy subscriptions_select on subscriptions for select to authenticated
  using (auth.uid() = user_id);
-- updates de status só via Edge Functions (service role, ignora RLS) — sem
-- policy de UPDATE aqui, intencional.

create table restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  restaurant_name text not null,
  phone text,
  address text,
  opening_hours text,
  email text,
  logo_url text,
  slug text not null unique,
  updated_at timestamptz not null default now()
);

alter table restaurant_settings enable row level security;

create policy restaurant_settings_select on restaurant_settings for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('settings.view'));
create policy restaurant_settings_update on restaurant_settings for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('settings.manage'))
  with check (get_owner_id(auth.uid()) = user_id and has_permission('settings.manage'));

-- View pública: só as colunas seguras para o cardápio digital não-autenticado.
-- A tabela base NUNCA é legível por anon (defesa em profundidade além da RLS).
create view restaurant_settings_public as
  select user_id, restaurant_name, phone, address, opening_hours, logo_url, slug
  from restaurant_settings;

revoke all on restaurant_settings from anon;
grant select on restaurant_settings_public to anon, authenticated;
