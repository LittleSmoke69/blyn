-- Fotos e vídeos dos pratos do cardápio digital.
--
-- Arquivos no bucket público "menu-media", na pasta do dono do restaurante
-- (<owner_id>/<recipe_id>/<arquivo>). A galeria de cada prato fica em
-- recipe_media (ordem, legenda, tipo). recipes.image_url continua sendo a capa
-- usada nas listagens: um trigger mantém = primeira FOTO da galeria.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-media', 'menu-media', true, 52428800,   -- 50 MB (= FILE_SIZE_LIMIT do Storage e MAX_CLIENT_SIZE do BunkerWeb)
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
);

-- Mesmo critério de quem edita o prato (recipes_update): dono/equipe com
-- menu.edit ou recipes.manage, e assinatura válida. A pasta raiz é o owner_id,
-- então membro de equipe grava na pasta do restaurante, não na dele.
create or replace function can_edit_menu_media(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and folder = get_owner_id(auth.uid())::text
    and (has_permission('menu.edit') or has_permission('recipes.manage'))
    and account_access_ok();
$$;

revoke all on function can_edit_menu_media(text) from public, anon;
grant execute on function can_edit_menu_media(text) to authenticated;

create policy menu_media_select on storage.objects for select to authenticated
  using (bucket_id = 'menu-media' and can_edit_menu_media((storage.foldername(name))[1]));
create policy menu_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-media' and can_edit_menu_media((storage.foldername(name))[1]));
create policy menu_media_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-media' and can_edit_menu_media((storage.foldername(name))[1]));
create policy menu_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-media' and can_edit_menu_media((storage.foldername(name))[1]));

create table recipe_media (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,   -- dono do restaurante
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null unique,
  url text not null,
  caption text check (char_length(caption) <= 200),
  position int not null default 0,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index recipe_media_recipe_idx on recipe_media (recipe_id, position);

alter table recipe_media enable row level security;

create policy recipe_media_select on recipe_media for select to authenticated
  using (
    get_owner_id(auth.uid()) = user_id
    and (has_permission('recipes.view') or has_permission('menu.view'))
  );

-- Cardápio público (anon): só a galeria de pratos ativos.
create policy recipe_media_public_select on recipe_media for select to anon
  using (exists (select 1 from recipes r where r.id = recipe_id and r.is_active));

create policy recipe_media_insert on recipe_media for insert to authenticated
  with check (
    get_owner_id(auth.uid()) = user_id
    and (has_permission('recipes.manage') or has_permission('menu.edit'))
    and exists (select 1 from recipes r where r.id = recipe_id and r.user_id = recipe_media.user_id)
    and storage_path like user_id::text || '/' || recipe_id::text || '/%'
  );

create policy recipe_media_update on recipe_media for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')))
  with check (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')));

create policy recipe_media_delete on recipe_media for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and (has_permission('recipes.manage') or has_permission('menu.edit')));

create policy subscription_gate on recipe_media as restrictive for all to authenticated
  using ((select account_access_ok())) with check ((select account_access_ok()));

-- No máximo 10 mídias por prato.
create or replace function trg_recipe_media_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from recipe_media where recipe_id = new.recipe_id) >= 10 then
    raise exception 'cada prato pode ter no máximo 10 fotos e vídeos';
  end if;
  return new;
end;
$$;

create trigger recipe_media_limit
  before insert on recipe_media
  for each row execute function trg_recipe_media_limit();

-- Capa: recipes.image_url = primeira foto da galeria. Sem fotos na galeria, um
-- link externo antigo (cadastrado à mão) é mantido; um link do próprio bucket
-- (foto que foi removida) é limpo.
create or replace function trg_recipe_media_cover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe uuid := coalesce(new.recipe_id, old.recipe_id);
  v_cover text;
begin
  select url into v_cover from recipe_media
  where recipe_id = v_recipe and kind = 'image'
  order by position, created_at
  limit 1;

  update recipes
  set image_url = case
    when v_cover is not null then v_cover
    when image_url like '%/menu-media/%' then null
    else image_url
  end
  where id = v_recipe;
  return null;
end;
$$;

create trigger recipe_media_cover
  after insert or update or delete on recipe_media
  for each row execute function trg_recipe_media_cover();
