-- Correções de segurança encontradas na auditoria do deploy.

-- 1. Contadores de número de pedido: estavam sem RLS e com grants padrão pra
-- anon/authenticated — qualquer um mexia neles pelo PostgREST (número de
-- pedido duplicado/zerado). Só os triggers trg_assign_*order_number (security
-- definer) precisam deles.
alter table order_number_counters enable row level security;
alter table public_order_number_counters enable row level security;
revoke all on order_number_counters from anon, authenticated;
revoke all on public_order_number_counters from anon, authenticated;

-- 2. restaurant_settings_public: a view roda como o dono (postgres), ignora a
-- RLS de restaurant_settings e é atualizável — com os grants padrão do
-- Supabase, anon conseguia INSERT/UPDATE/DELETE em qualquer restaurante
-- através dela. A view é só leitura pro cardápio digital.
revoke all on restaurant_settings_public from anon, authenticated;
grant select on restaurant_settings_public to anon, authenticated;

-- 3. Funções internas security definer sem checagem de quem chama, expostas
-- como RPC (/rest/v1/rpc/...). apply_sale_stock_and_financials deixava
-- qualquer um, sem login, lançar receita e baixa de estoque em qualquer
-- restaurante. Só são chamadas por outras funções security definer (que rodam
-- como o dono), então nada legítimo depende desses grants.
revoke execute on function apply_sale_stock_and_financials(uuid, sale_line[], stock_reference_type, uuid, numeric, payment_method, text) from public, anon, authenticated;
revoke execute on function recalc_recipe_price(uuid) from public, anon, authenticated;
revoke execute on function generate_unique_slug(text) from public, anon, authenticated;

-- Helpers de RLS: authenticated precisa (as policies rodam como quem consulta
-- e as Edge Functions chamam via RPC); anon não usa nenhuma delas e só
-- ganhava um oráculo de "esse uuid é admin?/dono de quem?".
revoke execute on function is_admin(uuid) from public, anon;
revoke execute on function get_owner_id(uuid) from public, anon;
revoke execute on function has_permission(permission_key) from public, anon;

-- 4. close_order / complete_public_order: sem login, auth.uid() é null,
-- "get_owner_id(null) <> user_id" dá null (não true) e a checagem de dono não
-- disparava; has_permission() também devolve true pra quem não é membro de
-- equipe. Resultado: anon fechava pedido de qualquer restaurante sabendo o id
-- (o cliente do cardápio digital recebe o id do próprio pedido). Exige login e
-- compara com "is distinct from".
revoke execute on function close_order(uuid) from public, anon;
revoke execute on function complete_public_order(uuid) from public, anon;

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
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'order não encontrada';
  end if;
  if get_owner_id(auth.uid()) is distinct from v_order.user_id then
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
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_order from public_orders where id = p_order_id;

  if not found then
    raise exception 'pedido público não encontrado';
  end if;
  if get_owner_id(auth.uid()) is distinct from v_order.restaurant_user_id then
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

-- 5. Bucket público de logos sem limite de tamanho nem de tipo: aceitava
-- qualquer arquivo (inclusive HTML/SVG com script, servido pelo domínio do
-- Supabase). Só imagem raster, até 5 MB.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'restaurant-logos';
