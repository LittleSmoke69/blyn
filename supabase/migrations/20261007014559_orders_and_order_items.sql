-- Vendas internas (PDV + Mesas). Sem table_number redundante (só table_id,
-- nullable — null = venda de balcão/PDV sem mesa). order_items ganha
-- recipe_name/unit_price como snapshot (o FoodFlow original só fazia isso em
-- public_order_items; replicamos aqui também pra vendas internas sobreviverem
-- a renomeação/exclusão de receita).
--
-- Fluxo: cliente insere orders (status='open') + order_items; um trigger em
-- order_items mantém orders.subtotal/total atualizados automaticamente; ao
-- finalizar (PDV ou fechamento de mesa), o cliente chama a RPC close_order()
-- (migration rpc_close_order_and_complete_public_order), que faz a baixa de
-- estoque + lançamento financeiro de forma atômica e muda o status pra
-- 'closed'. Não existe policy de UPDATE pra clientes — as tabelas de venda
-- são append-only; só a RPC (security definer) muda o status.

create table order_number_counters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_number int not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_number int,
  table_id uuid references tables (id) on delete set null,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method payment_method,
  status order_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index orders_user_id_idx on orders (user_id);
create index orders_table_id_idx on orders (table_id);

-- Numeração por dono, atômica via UPDATE travado por linha (evita vazamento
-- cross-tenant de um sequence global e evita duas vendas com o mesmo número).
create or replace function trg_assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into order_number_counters (user_id, last_number)
  values (new.user_id, 1)
  on conflict (user_id) do update set last_number = order_number_counters.last_number + 1
  returning last_number into v_next;

  new.order_number := v_next;
  return new;
end;
$$;

create trigger orders_assign_number
  before insert on orders
  for each row execute function trg_assign_order_number();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete restrict,
  recipe_name text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  subtotal numeric(12, 2) not null
);

create index order_items_order_id_idx on order_items (order_id);

-- Mantém orders.subtotal/total em dia conforme order_items é populado —
-- cliente nunca precisa (nem pode) fazer UPDATE direto em orders pra isso.
create or replace function trg_recalc_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(12, 2);
begin
  select coalesce(sum(subtotal), 0) into v_subtotal from order_items where order_id = v_order_id;
  update orders set subtotal = v_subtotal, total = v_subtotal - discount where id = v_order_id;
  return coalesce(new, old);
end;
$$;

create trigger order_items_recalc_totals
  after insert or update or delete on order_items
  for each row execute function trg_recalc_order_totals();

alter table orders enable row level security;
alter table order_items enable row level security;

create policy orders_select on orders for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('pdv.view') or has_permission('sales.view')));

create policy orders_insert on orders for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and has_permission('pdv.create'));
-- Sem UPDATE/DELETE: tabela append-only, status só muda via RPC close_order().

create policy order_items_select on order_items for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and get_owner_id(auth.uid()) = o.user_id
        and (has_permission('pdv.view') or has_permission('sales.view'))
    )
  );

create policy order_items_insert on order_items for insert to authenticated
  with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and get_owner_id(auth.uid()) = o.user_id
        and has_permission('pdv.create')
        and o.status = 'open'
    )
  );
