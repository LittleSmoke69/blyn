-- Pedidos do cardápio digital / pedidos online, feitos por clientes NÃO
-- autenticados. Criação só pela Edge Function create-public-order (service
-- role) — por isso não existe policy de INSERT pra anon/authenticated aqui.
-- recipe_name é sempre um snapshot (igual order_items agora).

create table public_order_number_counters (
  restaurant_user_id uuid primary key references auth.users (id) on delete cascade,
  last_number int not null default 0
);

create table public_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_user_id uuid not null references auth.users (id) on delete cascade,
  order_number int,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  order_type public_order_type not null,
  table_number text,
  delivery_fee numeric(10, 2),
  payment_method text default 'Pendente',
  notes text,
  status public_order_status not null default 'pending',
  confirmed_at timestamptz,
  completed_at timestamptz,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index public_orders_restaurant_user_id_idx on public_orders (restaurant_user_id);

create or replace function trg_assign_public_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into public_order_number_counters (restaurant_user_id, last_number)
  values (new.restaurant_user_id, 1)
  on conflict (restaurant_user_id) do update set last_number = public_order_number_counters.last_number + 1
  returning last_number into v_next;

  new.order_number := v_next;
  return new;
end;
$$;

create trigger public_orders_assign_number
  before insert on public_orders
  for each row execute function trg_assign_public_order_number();

create table public_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public_orders (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete restrict,
  recipe_name text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  subtotal numeric(12, 2) not null,
  notes text
);

create index public_order_items_order_id_idx on public_order_items (order_id);

alter table public_orders enable row level security;
alter table public_order_items enable row level security;

-- Leitura: só o dono/equipe com online_orders.view. Nenhuma policy de INSERT
-- pra anon/authenticated (só a Edge Function, via service role, escreve).
create policy public_orders_select on public_orders for select to authenticated
  using (get_owner_id(auth.uid()) = restaurant_user_id and has_permission('online_orders.view'));

-- UPDATE liberado pro dono/equipe, MAS nunca pode setar 'delivered' direto —
-- só a RPC complete_public_order() (security definer) pode fazer essa
-- transição, garantindo que a baixa de estoque e o lançamento financeiro
-- nunca sejam pulados.
create policy public_orders_update on public_orders for update to authenticated
  using (get_owner_id(auth.uid()) = restaurant_user_id and has_permission('online_orders.manage'))
  with check (
    get_owner_id(auth.uid()) = restaurant_user_id
    and has_permission('online_orders.manage')
    and status <> 'delivered'
  );

create policy public_order_items_select on public_order_items for select to authenticated
  using (
    exists (
      select 1 from public_orders po
      where po.id = public_order_items.order_id
        and get_owner_id(auth.uid()) = po.restaurant_user_id
        and has_permission('online_orders.view')
    )
  );
