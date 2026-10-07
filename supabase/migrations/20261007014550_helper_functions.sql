-- Funções auxiliares reutilizadas por toda a RLS do schema, evitando repetir
-- a lógica de "dono ou membro de equipe" e de checagem de permissão em cada tabela.

-- Resolve o dono efetivo de um usuário autenticado: o próprio uid se for dono,
-- ou team_members.owner_id se for um membro de equipe.
create or replace function get_owner_id(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select owner_id from team_members where user_id = uid limit 1),
    uid
  );
$$;

-- True automaticamente para o dono (nenhuma linha em team_members para ele).
-- Para um membro de equipe, checa se a chave está no array de permissões.
create or replace function has_permission(check_key permission_key)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select check_key = any(permissions)
      from team_members
      where user_id = auth.uid()
      limit 1
    ),
    true
  );
$$;

-- Geração de slug único para a URL pública do cardápio digital (/menu/:slug).
create or replace function slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(input, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create extension if not exists unaccent;

create or replace function generate_unique_slug(base text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  suffix int := 1;
  base_slug text;
begin
  base_slug := coalesce(nullif(slugify(base), ''), 'restaurante');
  candidate := base_slug;
  while exists (select 1 from restaurant_settings where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

-- get_owner_id/has_permission precisam ser chamáveis via RPC (usadas pela
-- Edge Function manage-team-member com o JWT de quem chamou, pra checar a
-- permissão com a identidade real do usuário). generate_unique_slug/slugify
-- só rodam internamente (trigger), não precisam de grant pra clientes.
grant execute on function get_owner_id(uuid) to authenticated;
grant execute on function has_permission(permission_key) to authenticated;
