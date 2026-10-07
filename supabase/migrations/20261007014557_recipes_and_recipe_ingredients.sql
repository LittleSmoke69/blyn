-- recipes = fichas técnicas E itens do cardápio (não existe tabela de menu
-- separada no sistema de referência, e replicamos isso aqui). category é um enum
-- único (recipe_category) usado em TODAS as telas que filtram por categoria —
-- corrige o bug do sistema de referência onde o filtro do PDV usava uma lista hardcoded
-- diferente da categoria real das receitas e nunca batia.

create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category recipe_category not null default 'Pratos Principais',
  description text,
  preparation_time int not null default 30,
  servings int not null default 1,
  target_margin numeric(5, 2) not null default 60 check (target_margin < 100),
  selling_price numeric(12, 2) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index recipes_user_id_idx on recipes (user_id);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  quantity numeric(12, 4) not null
);

create index recipe_ingredients_recipe_id_idx on recipe_ingredients (recipe_id);
create index recipe_ingredients_ingredient_id_idx on recipe_ingredients (ingredient_id);

-- Recalcula o preço de venda = custo / (1 - margem/100). O CHECK em
-- target_margin < 100 garante que o denominador nunca zera/inverte.
create or replace function recalc_recipe_price(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric(14, 4);
  v_margin numeric(5, 2);
begin
  select coalesce(sum(ri.quantity * i.cost_per_unit * i.correction_factor), 0)
  into v_cost
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id;

  select target_margin into v_margin from recipes where id = p_recipe_id;

  update recipes
  set selling_price = round(v_cost / (1 - v_margin / 100), 2)
  where id = p_recipe_id;
end;
$$;

create or replace function trg_recalc_price_on_recipe_ingredients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform recalc_recipe_price(coalesce(new.recipe_id, old.recipe_id));
  return coalesce(new, old);
end;
$$;

create trigger recipe_ingredients_recalc_price
  after insert or update or delete on recipe_ingredients
  for each row execute function trg_recalc_price_on_recipe_ingredients();

create or replace function trg_recalc_price_on_recipe_margin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform recalc_recipe_price(new.id);
  return new;
end;
$$;

create trigger recipes_recalc_price_on_margin_change
  after update of target_margin on recipes
  for each row execute function trg_recalc_price_on_recipe_margin();

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

-- Visão interna (dono/equipe), gated por recipes.* OU menu.* (a tela de
-- Cardápio só precisa ver/editar, não gerencia fichas técnicas completas).
create policy recipes_select on recipes for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.view') or has_permission('menu.view')));

create policy recipes_insert on recipes for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')));

create policy recipes_update on recipes for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')))
  with check (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')));

create policy recipes_delete on recipes for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('recipes.manage'));

-- Cardápio digital público: qualquer um pode ler receitas ativas, sem login.
create policy recipes_public_select on recipes for select to anon
  using (is_active = true);

-- recipe_ingredients (dados de custo) NUNCA ficam públicos.
create policy recipe_ingredients_select on recipe_ingredients for select to authenticated
  using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and get_owner_id(auth.uid()) = r.user_id
        and (has_permission('recipes.view') or has_permission('menu.view'))
    )
  );

create policy recipe_ingredients_insert on recipe_ingredients for insert to authenticated
  with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and get_owner_id(auth.uid()) = r.user_id
        and (has_permission('recipes.manage') or has_permission('menu.edit'))
    )
  );

create policy recipe_ingredients_update on recipe_ingredients for update to authenticated
  using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and get_owner_id(auth.uid()) = r.user_id
        and (has_permission('recipes.manage') or has_permission('menu.edit'))
    )
  );

create policy recipe_ingredients_delete on recipe_ingredients for delete to authenticated
  using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and get_owner_id(auth.uid()) = r.user_id
        and (has_permission('recipes.manage') or has_permission('menu.edit'))
    )
  );
