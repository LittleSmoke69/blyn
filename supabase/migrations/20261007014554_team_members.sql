-- team_members: sub-contas de login real (cada membro é um auth.users próprio).
-- Criação/edição/remoção só via Edge Function manage-team-member (precisa de
-- auth.admin.*, privilégio de service role) — por isso não há policy de
-- INSERT/UPDATE/DELETE aqui, só SELECT.

create table team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  permissions permission_key[] not null default '{}',
  created_at timestamptz not null default now()
);

create index team_members_owner_id_idx on team_members (owner_id);

alter table team_members enable row level security;

-- O dono vê sua equipe inteira; o próprio membro vê sua linha (pra saber suas
-- permissões no front).
create policy team_members_select on team_members for select to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());
