-- Ledger de estoque: é o ÚNICO lugar que altera ingredients.current_stock
-- (via trigger). Nenhum código, RPC ou cliente deve fazer UPDATE direto em
-- ingredients.current_stock — isso elimina a race condition de read-modify-
-- write que o FoodFlow original tinha.

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  type stock_movement_type not null,
  quantity numeric(12, 4) not null,
  unit_cost numeric(12, 4),
  reference_type stock_reference_type,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index stock_movements_user_id_idx on stock_movements (user_id);
create index stock_movements_ingredient_id_idx on stock_movements (ingredient_id);
create index stock_movements_created_at_idx on stock_movements (created_at desc);

comment on column stock_movements.reference_id is
  'Referência polimórfica pra orders.id (reference_type=venda) ou public_orders.id '
  '(reference_type=venda_online). Não é uma FK de verdade (não dá pra referenciar '
  'duas tabelas); validado apenas na camada de aplicação/RPC.';

-- entrada soma, saida subtrai, ajuste soma um delta (pode ser negativo).
create or replace function trg_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update ingredients
  set current_stock = coalesce(current_stock, 0) + (
    case new.type
      when 'entrada' then new.quantity
      when 'saida' then -new.quantity
      when 'ajuste' then new.quantity
    end
  )
  where id = new.ingredient_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on stock_movements
  for each row execute function trg_apply_stock_movement();

-- Custo médio ponderado: só roda em entradas com unit_cost informado.
-- IMPORTANTE: precisa rodar ANTES do trigger acima ter atualizado
-- current_stock, então usamos o estoque/custo atuais (pré-movimento) lidos
-- no início da função — por isso esta trigger também é AFTER INSERT, mas lê
-- ingredients ANTES de aplicar sua própria atualização de cost_per_unit; a
-- ordem de execução entre as duas triggers AFTER INSERT segue a ordem
-- alfabética do nome da trigger, então nomeamos esta para rodar depois
-- ("stock_movements_recompute_cost" > "stock_movements_apply") e calculamos
-- o estoque pré-entrada subtraindo a própria quantity do current_stock já
-- atualizado, evitando qualquer dependência de ordem.
create or replace function trg_recompute_ingredient_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock numeric(12, 4);
  v_current_cost numeric(12, 4);
  v_stock_before numeric(12, 4);
begin
  if new.type <> 'entrada' or new.unit_cost is null then
    return new;
  end if;

  select current_stock, cost_per_unit into v_current_stock, v_current_cost
  from ingredients where id = new.ingredient_id;

  v_stock_before := coalesce(v_current_stock, 0) - new.quantity;

  if v_stock_before + new.quantity <= 0 then
    update ingredients set cost_per_unit = new.unit_cost where id = new.ingredient_id;
  else
    update ingredients
    set cost_per_unit = round(
      (v_stock_before * coalesce(v_current_cost, 0) + new.quantity * new.unit_cost)
      / (v_stock_before + new.quantity),
      4
    )
    where id = new.ingredient_id;
  end if;

  return new;
end;
$$;

create trigger stock_movements_recompute_cost
  after insert on stock_movements
  for each row execute function trg_recompute_ingredient_cost();

alter table stock_movements enable row level security;

create policy stock_movements_select on stock_movements for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('stock.view') or has_permission('stock.manage')));

-- Cliente pode lançar entrada/ajuste manualmente, mas NUNCA 'saida' direto —
-- saída só sai das RPCs close_order()/complete_public_order() (security
-- definer, ignora RLS), garantindo que toda baixa de estoque por venda vem
-- acompanhada do lançamento financeiro correspondente.
create policy stock_movements_insert on stock_movements for insert to authenticated
  with check (
    get_owner_id(auth.uid()) = user_id
    and has_permission('stock.manage')
    and type <> 'saida'
  );
-- Sem UPDATE/DELETE: ledger imutável.
