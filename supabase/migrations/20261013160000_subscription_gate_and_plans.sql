-- 1) Bloqueio por assinatura NO BANCO (não só na tela).
--
-- account_access() (migration anterior) já decide se a conta do usuário logado
-- está liberada; account_access_ok() é o booleano usado nas policies.
-- Policy RESTRICTIVE: soma (AND) às policies que já existem — o dono/equipe
-- continua precisando das permissões de sempre E de uma assinatura válida.
-- Só vale pro papel authenticated: o cardápio público (anon) e as Edge
-- Functions (service role) não são afetados. Admin da plataforma passa sempre.
--
-- Ficam de fora, de propósito: profiles, subscriptions, restaurant_settings e
-- team_members (identidade da conta — o app precisa deles pra mostrar a tela
-- de assinatura inativa) e as tabelas da equipe Blyn (CRM, admins, etc.).

create or replace function account_access_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select allowed from account_access()), false);
$$;

revoke all on function account_access_ok() from public, anon;
grant execute on function account_access_ok() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'financial_records', 'ingredients', 'order_items', 'orders',
    'public_order_items', 'public_orders', 'recipe_ingredients', 'recipes',
    'stock_movements', 'tables'
  ] loop
    -- (select ...) vira initplan: avaliado uma vez por consulta, não por linha.
    execute format(
      'create policy subscription_gate on %I as restrictive for all to authenticated
         using ((select account_access_ok())) with check ((select account_access_ok()))',
      t
    );
  end loop;
end $$;

-- As RPCs security definer ignoram RLS, então recebem a mesma checagem logo
-- depois da de autenticação.
do $$
declare
  fn text;
  def text;
  needle constant text := E'raise exception ''não autenticado'';\n  end if;\n';
begin
  foreach fn in array array['close_order(uuid)', 'complete_public_order(uuid)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position(needle in def) = 0 then
      raise exception 'trecho de autenticação não encontrado em %', fn;
    end if;
    def := replace(
      def,
      needle,
      needle || E'  if not account_access_ok() then\n    raise exception ''assinatura inativa'';\n  end if;\n'
    );
    execute def;
  end loop;
end $$;

-- 2) Planos, cadastrados pelo painel admin. A assinatura guarda o plano
-- escolhido (plan_id) e uma cópia do nome (plan, texto que já existia) pra o
-- histórico não mudar se o plano for renomeado.

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  billing_cycle billing_cycle not null,
  duration_days int not null check (duration_days between 1 and 1825),
  price_cents int check (price_cents >= 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plans enable row level security;

create policy plans_admin_all on plans for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Cliente logado pode ver os planos ativos (nome/preço na tela de Configurações).
create policy plans_select_active on plans for select to authenticated
  using (active);

create or replace function trg_plans_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger plans_touch
  before update on plans
  for each row execute function trg_plans_touch();

alter table subscriptions add column plan_id uuid references plans (id) on delete set null;

-- Os dois ciclos que o painel já oferecia; preço fica pra equipe definir.
insert into plans (name, billing_cycle, duration_days, description) values
  ('Pro Mensal', 'monthly', 30, 'Acesso completo à plataforma, renovação mensal.'),
  ('Pro Anual', 'annual', 365, 'Acesso completo à plataforma, renovação anual.');

-- admin_list_accounts passa a devolver o nome do plano.
drop function admin_list_accounts();

create function admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  restaurant_name text,
  phone text,
  slug text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  status subscription_status,
  plan text,
  billing_cycle billing_cycle,
  trial_end_date timestamptz,
  expires_at timestamptz,
  is_team_member boolean,
  is_platform_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    u.email::text,
    p.restaurant_name,
    p.phone,
    rs.slug,
    p.created_at,
    u.last_sign_in_at,
    s.status,
    s.plan,
    s.billing_cycle,
    s.trial_end_date,
    s.expires_at,
    exists (select 1 from team_members tm where tm.user_id = p.user_id),
    exists (select 1 from admins a where a.user_id = p.user_id)
  from profiles p
  join auth.users u on u.id = p.user_id
  left join subscriptions s on s.user_id = p.user_id
  left join restaurant_settings rs on rs.user_id = p.user_id
  where is_admin(auth.uid())
  order by p.created_at desc;
$$;

revoke all on function admin_list_accounts() from public, anon;
grant execute on function admin_list_accounts() to authenticated;
