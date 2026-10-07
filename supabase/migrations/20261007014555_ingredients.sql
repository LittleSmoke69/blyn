create table ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  unit unit_enum not null,
  cost_per_unit numeric(12, 4) not null default 0,
  category ingredient_category not null default 'Outros',
  supplier text,
  min_stock numeric(12, 4),
  current_stock numeric(12, 4) default 0,
  correction_factor numeric(6, 4) not null default 1,
  created_at timestamptz not null default now()
);

create index ingredients_user_id_idx on ingredients (user_id);

alter table ingredients enable row level security;

-- Padrão de RLS reaplicado em toda tabela com dono: get_owner_id resolve
-- dono-ou-equipe, has_permission resolve a permissão (automaticamente true
-- pro dono). Repetir esta forma exata trocando a tabela e as permission keys.
create policy ingredients_select on ingredients for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('ingredients.view'));

create policy ingredients_insert on ingredients for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and has_permission('ingredients.manage'));

create policy ingredients_update on ingredients for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('ingredients.manage'))
  with check (get_owner_id(auth.uid()) = user_id and has_permission('ingredients.manage'));

create policy ingredients_delete on ingredients for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('ingredients.manage'));
