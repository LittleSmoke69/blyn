-- RPCs atômicas que substituem os 3 awaits sequenciais não-atômicos do
-- FoodFlow original (baixa de estoque + stock_movements + financial_records
-- feitos um por um no cliente). Aqui tudo roda numa função security definer
-- só, numa transação implícita só — ou tudo aplica, ou nada aplica.

create type sale_line as (recipe_id uuid, quantity numeric);

-- Função compartilhada entre close_order e complete_public_order: dado um
-- conjunto de linhas vendidas, dá baixa no estoque de cada ingrediente usado
-- (via insert em stock_movements — o trigger da migration anterior já cuida
-- de decrementar ingredients.current_stock) e lança a receita em
-- financial_records.
create or replace function apply_sale_stock_and_financials(
  p_owner_id uuid,
  p_lines sale_line[],
  p_reference_type stock_reference_type,
  p_reference_id uuid,
  p_total numeric,
  p_payment_method payment_method,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line sale_line;
  v_ri record;
begin
  foreach v_line in array p_lines loop
    for v_ri in
      select ingredient_id, quantity from recipe_ingredients where recipe_id = v_line.recipe_id
    loop
      insert into stock_movements (user_id, ingredient_id, type, quantity, reference_type, reference_id)
      values (p_owner_id, v_ri.ingredient_id, 'saida', v_ri.quantity * v_line.quantity, p_reference_type, p_reference_id);
    end loop;
  end loop;

  insert into financial_records (user_id, type, category, category_type, description, amount, payment_method, date)
  values (p_owner_id, 'income', p_category, 'revenue', 'Venda #' || p_reference_id::text, p_total, p_payment_method, current_date);
end;
$$;

-- Fecha uma venda interna (PDV ou Mesas): valida dono/permissão/status, dá
-- baixa de estoque + lança financeiro (via a função acima), e só então marca
-- a orders como 'closed'.
create or replace function close_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_lines sale_line[];
begin
  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'order não encontrada';
  end if;
  if get_owner_id(auth.uid()) <> v_order.user_id then
    raise exception 'sem permissão: order pertence a outro restaurante';
  end if;
  if not has_permission('pdv.create') then
    raise exception 'sem permissão: pdv.create é necessária';
  end if;
  if v_order.status <> 'open' then
    raise exception 'order já está %', v_order.status;
  end if;

  select array_agg(row(recipe_id, quantity)::sale_line) into v_lines
  from order_items where order_id = p_order_id;

  perform apply_sale_stock_and_financials(
    v_order.user_id, coalesce(v_lines, array[]::sale_line[]),
    'venda', p_order_id, v_order.total, v_order.payment_method, 'Vendas'
  );

  update orders set status = 'closed', closed_at = now() where id = p_order_id;
end;
$$;

-- Marca um pedido público como entregue: mesmo efeito colateral (baixa de
-- estoque + financeiro), categoria "Vendas Online". É o ÚNICO caminho que
-- pode levar public_orders.status a 'delivered' (a policy de UPDATE da
-- migration anterior bloqueia isso num update direto do cliente).
create or replace function complete_public_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public_orders%rowtype;
  v_lines sale_line[];
begin
  select * into v_order from public_orders where id = p_order_id;

  if not found then
    raise exception 'pedido público não encontrado';
  end if;
  if get_owner_id(auth.uid()) <> v_order.restaurant_user_id then
    raise exception 'sem permissão: pedido pertence a outro restaurante';
  end if;
  if not has_permission('online_orders.manage') then
    raise exception 'sem permissão: online_orders.manage é necessária';
  end if;
  if v_order.status = 'delivered' then
    raise exception 'pedido já foi entregue';
  end if;

  select array_agg(row(recipe_id, quantity)::sale_line) into v_lines
  from public_order_items where order_id = p_order_id;

  perform apply_sale_stock_and_financials(
    v_order.restaurant_user_id, coalesce(v_lines, array[]::sale_line[]),
    'venda_online', p_order_id, v_order.total, null, 'Vendas Online'
  );

  update public_orders set status = 'delivered', completed_at = now() where id = p_order_id;
end;
$$;

grant execute on function close_order(uuid) to authenticated;
grant execute on function complete_public_order(uuid) to authenticated;
