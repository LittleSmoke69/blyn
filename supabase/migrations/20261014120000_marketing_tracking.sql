-- Marketing: rastreamento de origem dos visitantes/leads da landing (UTM,
-- click ids, cookies da Meta, user-agent, IP, referrer) e espelho dos dados
-- de campanhas/criativos da Meta (Marketing API) pro painel de BI em
-- /admin/marketing.
--
-- Tudo aqui é SÓ admin da plataforma. As escritas vêm das Edge Functions
-- (service role): track-visit e submit-lead (públicas) e admin-meta (sync).
-- O token da Meta fica em meta_settings, que NÃO tem policy nenhuma — como o
-- ai_settings, só o service role lê; o painel vê só "tem token" e a dica.

-- ---------------------------------------------------------------------------
-- Sessões da landing: uma linha por sessão (aba), gravada no primeiro
-- carregamento. Base pra taxa de conversão (leads ÷ visitas) por canal.
-- ---------------------------------------------------------------------------
create table site_sessions (
  id uuid primary key,                 -- gerado no navegador (sessionStorage)
  visitor_id uuid not null,            -- gerado no navegador (localStorage, persistente)
  started_at timestamptz not null default now(),
  channel text not null,               -- meta_ads | google_ads | tiktok_ads | outros_pagos | organico_busca | organico_social | email | referencia | campanha | direto
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  click_ids jsonb,                     -- { fbclid, gclid, gbraid, wbraid, ttclid, msclkid, li_fat_id }
  referrer text,
  landing_page text,
  fbp text,
  fbc text,
  ip inet,
  user_agent text,
  device text,                         -- mobile | tablet | desktop | bot
  language text,
  screen text,
  timezone text,
  first_touch jsonb                    -- primeira origem conhecida desse visitante
);

create index site_sessions_started_idx on site_sessions (started_at desc);
create index site_sessions_visitor_idx on site_sessions (visitor_id);

alter table site_sessions enable row level security;
create policy site_sessions_admin_select on site_sessions for select to authenticated
  using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Atribuição no lead. utm (jsonb) continua existindo (último toque); as
-- colunas abaixo são as que o BI filtra/agrupa. tracking guarda o payload
-- completo (primeiro e último toque, cookies, tela, idioma...).
-- ---------------------------------------------------------------------------
alter table crm_leads
  add column channel text,
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column utm_content text,
  add column utm_term text,
  add column meta_campaign_id text,
  add column meta_adset_id text,
  add column meta_ad_id text,
  add column fbp text,
  add column fbc text,
  add column visitor_id uuid,
  add column session_id uuid,
  add column ip inet,
  add column user_agent text,
  add column device text,
  add column referrer text,
  add column landing_page text,
  add column first_touch jsonb,
  add column tracking jsonb,
  add column capi_status text,         -- enviado | erro: ... | desligado
  add column capi_sent_at timestamptz;

create index crm_leads_channel_idx on crm_leads (channel);
create index crm_leads_meta_campaign_idx on crm_leads (meta_campaign_id);

-- Leads antigos: canal a partir do utm que já existia.
update crm_leads set
  utm_source = utm->>'utm_source',
  utm_medium = utm->>'utm_medium',
  utm_campaign = utm->>'utm_campaign',
  utm_content = utm->>'utm_content',
  utm_term = utm->>'utm_term',
  channel = case
    when source not like 'landing%' then 'manual'
    when utm is null or utm = '{}'::jsonb then 'direto'
    when lower(coalesce(utm->>'utm_source', '')) in ('facebook', 'fb', 'instagram', 'ig', 'meta') then 'meta_ads'
    else 'campanha'
  end
where channel is null;

-- ---------------------------------------------------------------------------
-- Meta (Facebook/Instagram Ads)
-- ---------------------------------------------------------------------------
create table meta_settings (
  id boolean primary key default true check (id),   -- linha única
  access_token text,                   -- token de usuário do sistema (Business Manager)
  ad_account_id text,                  -- só os dígitos, sem "act_"
  pixel_id text,
  api_version text not null default 'v24.0',
  capi_enabled boolean not null default false,
  capi_test_event_code text,
  sync_days int not null default 30 check (sync_days between 1 and 365),
  auto_sync boolean not null default true,
  cron_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table meta_settings enable row level security;
insert into meta_settings default values;

create table meta_campaigns (
  id text primary key,
  name text not null,
  status text,
  effective_status text,
  objective text,
  daily_budget numeric(14, 2),         -- já na moeda da conta (a API manda em centavos)
  lifetime_budget numeric(14, 2),
  start_time timestamptz,
  stop_time timestamptz,
  created_time timestamptz,
  synced_at timestamptz not null default now()
);

create table meta_adsets (
  id text primary key,
  campaign_id text,
  name text not null,
  status text,
  effective_status text,
  optimization_goal text,
  daily_budget numeric(14, 2),
  lifetime_budget numeric(14, 2),
  start_time timestamptz,
  end_time timestamptz,
  synced_at timestamptz not null default now()
);

create table meta_ads (
  id text primary key,
  adset_id text,
  campaign_id text,
  name text not null,
  status text,
  effective_status text,
  created_time timestamptz,
  creative_id text,
  creative_name text,
  title text,
  body text,
  call_to_action text,
  link_url text,
  image_url text,
  thumbnail_url text,
  video_id text,
  object_type text,
  permalink_url text,                  -- post no Instagram/Facebook, quando houver
  synced_at timestamptz not null default now()
);

create index meta_ads_campaign_idx on meta_ads (campaign_id);

-- Métricas diárias no nível do anúncio (soma pra conjunto/campanha).
create table meta_insights_daily (
  ad_id text not null,
  date date not null,
  adset_id text,
  campaign_id text,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  leads bigint not null default 0,              -- leads contados pela Meta (pixel/CAPI/formulário instantâneo)
  conversations bigint not null default 0,      -- conversas iniciadas (WhatsApp/Direct)
  video_views bigint not null default 0,
  actions jsonb,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);

create index meta_insights_date_idx on meta_insights_daily (date);
create index meta_insights_campaign_idx on meta_insights_daily (campaign_id, date);

alter table meta_campaigns enable row level security;
alter table meta_adsets enable row level security;
alter table meta_ads enable row level security;
alter table meta_insights_daily enable row level security;

create policy meta_campaigns_admin_select on meta_campaigns for select to authenticated using (is_admin(auth.uid()));
create policy meta_adsets_admin_select on meta_adsets for select to authenticated using (is_admin(auth.uid()));
create policy meta_ads_admin_select on meta_ads for select to authenticated using (is_admin(auth.uid()));
create policy meta_insights_admin_select on meta_insights_daily for select to authenticated using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Agregado de sessões pro BI (as sessões podem ser muitas; o painel não
-- precisa de cada linha). Só responde pra admin.
-- ---------------------------------------------------------------------------
create or replace function marketing_sessions_summary(since timestamptz, until timestamptz)
returns table (
  day date,
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  meta_campaign_id text,
  device text,
  sessions bigint,
  visitors bigint
)
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
    select (s.started_at at time zone 'America/Sao_Paulo')::date, s.channel, s.utm_source, s.utm_medium,
           s.utm_campaign, s.meta_campaign_id, s.device, count(*), count(distinct s.visitor_id)
    from site_sessions s
    where s.started_at >= since and s.started_at < until and coalesce(s.device, '') <> 'bot'
    group by 1, 2, 3, 4, 5, 6, 7;
end;
$$;

revoke all on function marketing_sessions_summary(timestamptz, timestamptz) from public, anon;
grant execute on function marketing_sessions_summary(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Sincronização automática com a Meta a cada 3 horas (pg_cron + pg_net
-- chamando a Edge Function admin-meta pela rede interna do compose). A
-- function confere o cron_secret e não faz nada se auto_sync estiver
-- desligado ou sem token.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function meta_cron_sync()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s meta_settings;
begin
  select * into s from meta_settings;
  if s.access_token is null or s.ad_account_id is null or not s.auto_sync then
    return;
  end if;
  perform net.http_post(
    url := 'http://functions:9000/admin-meta',
    body := jsonb_build_object('action', 'sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.cron_secret),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function meta_cron_sync() from public, anon, authenticated;

select cron.schedule('meta-sync', '15 */3 * * *', 'select public.meta_cron_sync()');
