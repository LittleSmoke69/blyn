-- CRM interno da equipe Blyn (admins da plataforma). Recebe as respostas do
-- formulário da landing (via Edge Function submit-lead, service role) e
-- acompanha cada lead pelo funil comercial até virar conta de restaurante.
--
-- Acesso: SOMENTE is_admin(). Nem donos de restaurante nem anon enxergam
-- nada aqui — o formulário público não insere direto (sem policy pra anon),
-- só pela function, que valida e faz deduplicação por e-mail.

create type crm_stage as enum ('novo', 'contato', 'demo_agendada', 'proposta', 'ganho', 'perdido');
create type crm_activity_type as enum ('nota', 'ligacao', 'whatsapp', 'email', 'reuniao', 'etapa', 'formulario', 'sistema');

create table crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  whatsapp text,
  business_name text,
  instagram text,
  challenge text,
  message text,
  source text not null default 'manual',          -- landing_hero | landing_footer | manual | indicacao ...
  stage crm_stage not null default 'novo',
  position double precision not null default 0,     -- ordem dentro da coluna do kanban
  estimated_value numeric(12, 2),                   -- valor mensal potencial
  assigned_to uuid references auth.users (id) on delete set null,
  account_user_id uuid references auth.users (id) on delete set null, -- conta de restaurante criada a partir do lead
  next_follow_up date,
  lost_reason text,
  utm jsonb,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crm_leads_stage_idx on crm_leads (stage, position);
create index crm_leads_email_idx on crm_leads (lower(email));
create index crm_leads_assigned_idx on crm_leads (assigned_to);
create index crm_leads_created_idx on crm_leads (created_at desc);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null, -- null = sistema / formulário
  type crm_activity_type not null default 'nota',
  content text not null,
  created_at timestamptz not null default now()
);

create index crm_activities_lead_idx on crm_activities (lead_id, created_at desc);

create table crm_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm_leads (id) on delete cascade, -- null = tarefa avulsa da equipe
  title text not null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  assigned_to uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index crm_tasks_open_idx on crm_tasks (done, due_date);
create index crm_tasks_lead_idx on crm_tasks (lead_id);

-- updated_at + registro automático de mudança de etapa no histórico, pra o
-- funil ter auditoria sem depender do front lembrar de gravar.
create or replace function trg_crm_leads_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into crm_activities (lead_id, author_id, type, content)
    values (new.id, auth.uid(), 'etapa', old.stage::text || ' → ' || new.stage::text);
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

create trigger crm_leads_touch
  before update on crm_leads
  for each row execute function trg_crm_leads_touch();

create or replace function trg_crm_activity_bump_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update crm_leads set last_activity_at = new.created_at where id = new.lead_id;
  return new;
end;
$$;

create trigger crm_activities_bump_lead
  after insert on crm_activities
  for each row
  when (new.type <> 'etapa') -- a de etapa já atualiza no próprio trigger do lead
  execute function trg_crm_activity_bump_lead();

create or replace function trg_crm_task_done_at()
returns trigger
language plpgsql
as $$
begin
  if new.done and not coalesce(old.done, false) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger crm_tasks_done_at
  before insert or update on crm_tasks
  for each row execute function trg_crm_task_done_at();

alter table crm_leads enable row level security;
alter table crm_activities enable row level security;
alter table crm_tasks enable row level security;

create policy crm_leads_admin_all on crm_leads for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Histórico é append-only até pra admin: dá pra corrigir apagando a própria
-- nota, mas não editar o que outra pessoa registrou.
create policy crm_activities_admin_select on crm_activities for select to authenticated
  using (is_admin(auth.uid()));
create policy crm_activities_admin_insert on crm_activities for insert to authenticated
  with check (is_admin(auth.uid()) and author_id = auth.uid());
create policy crm_activities_admin_delete on crm_activities for delete to authenticated
  using (is_admin(auth.uid()) and author_id = auth.uid());

create policy crm_tasks_admin_all on crm_tasks for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Lista a equipe interna (admins) com e-mail, pra atribuir leads/tarefas.
-- admins não tem policy de SELECT e auth.users não é exposto, então isso
-- passa por uma função security definer que só responde pra outro admin.
create or replace function list_platform_admins()
returns table (user_id uuid, email text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, u.email::text, coalesce(p.restaurant_name, split_part(u.email, '@', 1))
  from admins a
  join auth.users u on u.id = a.user_id
  left join profiles p on p.user_id = a.user_id
  where is_admin(auth.uid())
  order by u.email;
$$;

grant execute on function list_platform_admins() to authenticated;

-- Painel de contas: e-mail e último login de cada empresa (auth.users não é
-- legível pelo cliente). Mesmo gate de admin.
create or replace function admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  restaurant_name text,
  phone text,
  slug text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  status subscription_status,
  billing_cycle billing_cycle,
  trial_end_date timestamptz,
  expires_at timestamptz,
  is_team_member boolean,
  is_platform_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    u.email::text,
    p.restaurant_name,
    p.phone,
    rs.slug,
    p.created_at,
    u.last_sign_in_at,
    s.status,
    s.billing_cycle,
    s.trial_end_date,
    s.expires_at,
    exists (select 1 from team_members tm where tm.user_id = p.user_id),
    exists (select 1 from admins a where a.user_id = p.user_id)
  from profiles p
  join auth.users u on u.id = p.user_id
  left join subscriptions s on s.user_id = p.user_id
  left join restaurant_settings rs on rs.user_id = p.user_id
  where is_admin(auth.uid())
  order by p.created_at desc;
$$;

grant execute on function admin_list_accounts() to authenticated;
