-- Formulários da landing editáveis pelo painel admin. Cada linha é um
-- formulário (por enquanto só 'hero'); a landing lê a config pública e monta
-- os campos, e a Edge Function submit-lead valida o envio contra a MESMA
-- config (tipos, obrigatórios, opções de select).
--
-- fields: array de
--   { key, label, placeholder, type: text|email|tel|select|textarea,
--     required, half (meia largura, lado a lado com o próximo "half"),
--     options: [string] (só select), system (bool: nome/email/whatsapp —
--     não podem ser removidos porque alimentam colunas do CRM) }

create table site_forms (
  id text primary key,
  title text not null,
  subtitle text,
  button_label text not null default 'Enviar',
  safe_note text,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table site_forms enable row level security;

-- Leitura pública: a landing (visitante anônimo) precisa da config pra
-- renderizar o formulário. Não há nada sensível aqui.
create policy site_forms_public_select on site_forms for select to anon, authenticated
  using (true);

create policy site_forms_admin_update on site_forms for update to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy site_forms_admin_insert on site_forms for insert to authenticated
  with check (is_admin(auth.uid()));

create or replace function trg_site_forms_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger site_forms_touch
  before insert or update on site_forms
  for each row execute function trg_site_forms_touch();

-- Config inicial = o formulário que já estava fixo no HTML da hero.
insert into site_forms (id, title, subtitle, button_label, safe_note, fields) values (
  'hero',
  'Receba uma demonstração da Blyn',
  'Descubra quanto o seu delivery pode lucrar com a operação organizada.',
  'Agendar demonstração',
  'Seus dados estão seguros. Sem spam.',
  '[
    {"key": "nome", "label": "Nome", "placeholder": "Nome", "type": "text", "required": true, "half": true, "system": true},
    {"key": "email", "label": "E-mail", "placeholder": "E-mail", "type": "email", "required": true, "half": true, "system": true},
    {"key": "whatsapp", "label": "WhatsApp", "placeholder": "WhatsApp", "type": "tel", "required": true, "half": false, "system": true},
    {"key": "delivery", "label": "Nome do delivery", "placeholder": "Nome do delivery", "type": "text", "required": true, "half": false},
    {"key": "instagram", "label": "Instagram do delivery", "placeholder": "Instagram do delivery", "type": "text", "required": false, "half": false},
    {"key": "desafio", "label": "Principal desafio atual", "placeholder": "Principal desafio atual", "type": "select", "required": true, "half": false,
     "options": ["Dependência do iFood", "Controle financeiro", "Estoque e desperdício", "CMV / fichas técnicas", "Organização dos pedidos", "Cardápio digital próprio"]}
  ]'::jsonb
);

-- Todas as respostas do envio, na ordem do formulário, com o rótulo usado no
-- momento do envio (se a pergunta for renomeada depois, o histórico do lead
-- continua mostrando a pergunta que a pessoa realmente respondeu).
-- Formato: [{ "key": "...", "label": "...", "value": "..." }]
alter table crm_leads add column answers jsonb;
