-- financial_records: lançamentos de caixa (ledger). category_type substitui o
-- keyword-matching frágil que o DRE do sistema de referência fazia em cima da
-- string livre de category (ex: achar "aluguel" na string pra classificar
-- como custo fixo) — aqui é explícito e indexável.

create table financial_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type financial_type not null,
  category text not null,
  category_type financial_category_type not null,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method payment_method,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index financial_records_user_id_idx on financial_records (user_id);
create index financial_records_date_idx on financial_records (date);

alter table financial_records enable row level security;

-- SELECT também liberado pra quem só tem dre.view/profit.view (essas telas
-- precisam ler o ledger bruto pra calcular os agregados, sem precisar da
-- permissão completa de financial.view).
create policy financial_records_select on financial_records for select to authenticated
  using (
    get_owner_id(auth.uid()) = user_id
    and (has_permission('financial.view') or has_permission('dre.view') or has_permission('profit.view'))
  );

create policy financial_records_insert on financial_records for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));

create policy financial_records_update on financial_records for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'))
  with check (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));

create policy financial_records_delete on financial_records for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));

-- accounts: Contas a Pagar/Receber — conceito separado de financial_records
-- no sistema de referência (as duas telas nunca se reconciliavam). Aqui, marcar
-- uma conta como 'paid' gera automaticamente um lançamento em
-- financial_records via trigger, então os dois ficam sempre consistentes.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type account_type not null,
  category text not null,
  category_type financial_category_type not null default 'variable'
    check (type = 'payable' or category_type = 'revenue'),
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  payment_method payment_method,
  notes text,
  status account_status not null default 'pending',
  paid_at timestamptz,
  paid_amount numeric(12, 2),
  created_at timestamptz not null default now()
);

create index accounts_user_id_idx on accounts (user_id);
create index accounts_due_date_idx on accounts (due_date);

create or replace function trg_account_paid_to_financial_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into financial_records (user_id, type, category, category_type, description, amount, payment_method, date)
    values (
      new.user_id,
      case when new.type = 'payable' then 'expense' else 'income' end,
      new.category,
      new.category_type,
      new.notes,
      coalesce(new.paid_amount, new.amount),
      new.payment_method,
      coalesce(new.paid_at::date, current_date)
    );
  end if;
  return new;
end;
$$;

create trigger accounts_paid_reconciliation
  after update of status on accounts
  for each row execute function trg_account_paid_to_financial_record();

alter table accounts enable row level security;

create policy accounts_select on accounts for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('financial.view'));

create policy accounts_insert on accounts for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));

create policy accounts_update on accounts for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'))
  with check (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));

create policy accounts_delete on accounts for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('financial.manage'));
