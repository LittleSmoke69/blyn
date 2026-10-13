-- Promover / rebaixar admin da plataforma pelo painel (Contas).
--
-- Tudo numa RPC security definer, numa transação só: checa que quem chama é
-- admin, aplica as travas, grava a mudança e o histórico. A tabela admins
-- continua sem policy nenhuma — não há outro caminho de escrita pelo app.
--
-- Travas:
--   - ninguém remove o próprio cargo de admin;
--   - nunca fica sem nenhum admin (LOCK serializa remoções simultâneas);
--   - membro de equipe de restaurante não vira admin (acessos misturados).

create table admin_role_changes (
  id bigint generated always as identity primary key,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text not null,
  action text not null check (action in ('grant', 'revoke')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_email text,
  created_at timestamptz not null default now()
);

alter table admin_role_changes enable row level security;

create policy admin_role_changes_admin_select on admin_role_changes for select to authenticated
  using (is_admin(auth.uid()));

create or replace function admin_set_platform_admin(p_user_id uuid, p_make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_email text;
  v_is_admin boolean;
begin
  if v_caller is null or not is_admin(v_caller) then
    raise exception 'só administradores da plataforma podem mudar cargos';
  end if;

  select email into v_target_email from auth.users where id = p_user_id;
  if v_target_email is null then
    raise exception 'usuário não encontrado';
  end if;

  -- Serializa mudanças de cargo: duas remoções ao mesmo tempo não conseguem
  -- zerar a lista de admins.
  lock table admins in share row exclusive mode;

  v_is_admin := exists (select 1 from admins where user_id = p_user_id);

  if p_make_admin then
    if v_is_admin then
      raise exception 'esse usuário já é admin';
    end if;
    if exists (select 1 from team_members where user_id = p_user_id) then
      raise exception 'membro de equipe de restaurante não pode virar admin';
    end if;
    insert into admins (user_id) values (p_user_id);
  else
    if not v_is_admin then
      raise exception 'esse usuário não é admin';
    end if;
    if p_user_id = v_caller then
      raise exception 'você não pode remover o seu próprio cargo de admin';
    end if;
    if (select count(*) from admins) <= 1 then
      raise exception 'a plataforma precisa de pelo menos um admin';
    end if;
    delete from admins where user_id = p_user_id;
  end if;

  insert into admin_role_changes (target_user_id, target_email, action, changed_by, changed_by_email)
  values (
    p_user_id,
    v_target_email,
    case when p_make_admin then 'grant' else 'revoke' end,
    v_caller,
    (select email from auth.users where id = v_caller)
  );
end;
$$;

revoke all on function admin_set_platform_admin(uuid, boolean) from public, anon;
grant execute on function admin_set_platform_admin(uuid, boolean) to authenticated;
