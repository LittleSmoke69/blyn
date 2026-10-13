-- IA na plataforma: configuração (chave/modelo/limite), catálogo de onde a IA
-- se aplica (com liga/desliga por funcionalidade) e registro de uso.
--
-- A chave da API fica em ai_settings, que NÃO tem policy nenhuma: só as Edge
-- Functions (service role) leem. O painel admin grava/consulta pela função
-- admin-ai-settings, que devolve só se há chave e os últimos 4 caracteres.

create table ai_settings (
  id boolean primary key default true check (id),   -- linha única
  api_key text,
  model text not null default 'claude-opus-5-5',
  enabled boolean not null default false,
  monthly_limit_per_account int not null default 100 check (monthly_limit_per_account >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table ai_settings enable row level security;
insert into ai_settings default values;

-- Catálogo: "available" = já implementada (admin liga/desliga);
-- "planned" = ideia mapeada, aparece no painel como roadmap.
create table ai_features (
  key text primary key,
  name text not null,
  area text not null,
  audience text not null check (audience in ('restaurante', 'equipe_blyn')),
  description text not null,
  status text not null check (status in ('available', 'planned')),
  enabled boolean not null default false,
  sort int not null default 0
);

alter table ai_features enable row level security;

-- O app do restaurante precisa saber se o scanner está ligado pra mostrar o botão.
create policy ai_features_select on ai_features for select to authenticated
  using (true);

create policy ai_features_admin_update on ai_features for update to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

insert into ai_features (key, name, area, audience, description, status, enabled, sort) values
  ('receipt_scanner', 'Scanner de notas de custo', 'Financeiro', 'restaurante',
   'Foto ou PDF de nota fiscal, cupom ou recibo vira um lançamento de despesa: fornecedor, data, valor, forma de pagamento e itens já preenchidos para o usuário conferir.',
   'available', true, 10),
  ('invoice_to_stock', 'Entrada de estoque pela nota', 'Estoque', 'restaurante',
   'Os itens lidos da nota do fornecedor viram entradas de estoque e atualizam o custo dos ingredientes.',
   'planned', false, 20),
  ('recipe_cost_suggestions', 'Sugestões de preço e margem', 'Fichas técnicas', 'restaurante',
   'Analisa o CMV de cada ficha técnica e sugere preço de venda ou ajustes de receita para bater a margem alvo.',
   'planned', false, 30),
  ('menu_descriptions', 'Descrições do cardápio digital', 'Cardápio', 'restaurante',
   'Gera descrições atrativas dos pratos a partir dos ingredientes da ficha técnica.',
   'planned', false, 40),
  ('financial_insights', 'Resumo financeiro do mês', 'DRE / Relatórios', 'restaurante',
   'Explica em linguagem simples o resultado do mês: para onde foi o dinheiro, o que mudou e onde economizar.',
   'planned', false, 50),
  ('stock_forecast', 'Previsão de compras', 'Estoque', 'restaurante',
   'Usa o histórico de vendas para prever o consumo e sugerir a lista de compras da semana.',
   'planned', false, 60),
  ('crm_lead_summary', 'Resumo e prioridade de leads', 'CRM', 'equipe_blyn',
   'Resume as respostas do formulário e o histórico do lead e sugere a próxima ação e a prioridade.',
   'planned', false, 70),
  ('crm_followup_writer', 'Mensagens de follow-up', 'CRM', 'equipe_blyn',
   'Escreve a mensagem de WhatsApp ou e-mail de acompanhamento com base no estágio do lead.',
   'planned', false, 80),
  ('churn_alerts', 'Alerta de risco de cancelamento', 'Contas', 'equipe_blyn',
   'Identifica restaurantes com queda de uso ou teste perto do fim e sugere contato.',
   'planned', false, 90);

-- Uso: uma linha por chamada à IA (sucesso ou erro), gravada pelas Edge Functions.
create table ai_usage (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users (id) on delete set null,   -- conta (restaurante)
  user_id uuid references auth.users (id) on delete set null,    -- quem chamou
  feature text not null references ai_features (key),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index ai_usage_owner_month_idx on ai_usage (owner_id, created_at desc);

alter table ai_usage enable row level security;

create policy ai_usage_admin_select on ai_usage for select to authenticated
  using (is_admin(auth.uid()));
