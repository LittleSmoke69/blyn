-- Eventos do Meta Pixel na landing: nome do evento de lead configurável
-- (padrão "Lead", ou outro evento padrão/personalizado), eventos
-- personalizados de engajamento (clique no WhatsApp, CTA, início do
-- formulário, rolagem) e espelho deles na Conversions API.
--
-- site_events guarda cada evento disparado (base do quadro "Eventos do
-- site" no BI). Gravado só pela Edge Function track-visit (service role).

alter table meta_settings
  add column lead_event_name text not null default 'Lead' check (lead_event_name ~ '^[A-Za-z][A-Za-z0-9_]{1,39}$'),
  add column custom_events_enabled boolean not null default true,
  add column capi_custom_events boolean not null default true;

create table site_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  session_id uuid not null,
  visitor_id uuid not null,
  name text not null,
  data jsonb,
  channel text,
  capi_status text,
  created_at timestamptz not null default now()
);

create unique index site_events_event_id_idx on site_events (event_id);
create index site_events_created_idx on site_events (created_at desc);

alter table site_events enable row level security;
create policy site_events_admin_select on site_events for select to authenticated
  using (is_admin(auth.uid()));

-- Configuração pública que a landing (anônima) precisa pra disparar os
-- eventos. Só campos não sensíveis — o token continua sem acesso nenhum.
create or replace function public_tracking_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pixel_id', pixel_id,
    'lead_event_name', lead_event_name,
    'custom_events', custom_events_enabled
  )
  from meta_settings;
$$;

grant execute on function public_tracking_config() to anon, authenticated;

-- Contagem de eventos por dia/nome/canal pro BI.
create or replace function marketing_events_summary(since timestamptz, until timestamptz)
returns table (day date, name text, channel text, events bigint, visitors bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select (e.created_at at time zone 'America/Sao_Paulo')::date, e.name, e.channel, count(*), count(distinct e.visitor_id)
    from site_events e
    where e.created_at >= since and e.created_at < until
    group by 1, 2, 3;
end;
$$;

revoke all on function marketing_events_summary(timestamptz, timestamptz) from public, anon;
grant execute on function marketing_events_summary(timestamptz, timestamptz) to authenticated;
