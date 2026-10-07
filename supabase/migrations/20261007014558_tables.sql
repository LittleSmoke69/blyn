create table tables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  capacity int not null check (capacity between 1 and 20),
  shape table_shape not null default 'square',
  status table_status not null default 'available',
  position_x numeric(10, 2) default 0,
  position_y numeric(10, 2) default 0,
  created_at timestamptz not null default now()
);

create index tables_user_id_idx on tables (user_id);

alter table tables enable row level security;

create policy tables_select on tables for select to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('tables.view'));

create policy tables_insert on tables for insert to authenticated
  with check (get_owner_id(auth.uid()) = user_id and has_permission('tables.manage'));

create policy tables_update on tables for update to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('tables.manage'))
  with check (get_owner_id(auth.uid()) = user_id and has_permission('tables.manage'));

create policy tables_delete on tables for delete to authenticated
  using (get_owner_id(auth.uid()) = user_id and has_permission('tables.manage'));
