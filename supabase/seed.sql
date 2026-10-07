-- Dados de exemplo pro Supabase Studio local. Aplicado automaticamente em
-- `supabase db reset`. O script de verificação (scratch/verify-backend.ts)
-- NÃO depende destes dados — ele cria seus próprios usuários via
-- auth.signUp() real, pra provar o trigger funcionando de ponta a ponta de
-- forma independente deste seed.

-- Dono de teste, inserido direto em auth.users (igual o Supabase faz no
-- signUp real) — isso dispara o trigger handle_new_user() e cria
-- profiles/subscriptions/restaurant_settings automaticamente.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'dono@blyn.test',
  crypt('Teste123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"restaurant_name":"Blyn Teste"}',
  now(), now(), '', '', '', ''
);

-- Membro de equipe de teste (também um auth.users de verdade).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'equipe@blyn.test',
  crypt('Teste123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(), '', '', '', ''
);

insert into team_members (owner_id, user_id, name, email, permissions)
values (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Funcionário Teste',
  'equipe@blyn.test',
  array['pdv.view', 'pdv.create', 'tables.view']::permission_key[]
);

-- Ingredientes de exemplo (cobrindo unidades/categorias diferentes).
insert into ingredients (id, user_id, name, unit, cost_per_unit, category, current_stock, min_stock)
values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Filé Mignon', 'kg', 45.00, 'Carnes', 20, 5),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Arroz Arbóreo', 'kg', 12.50, 'Grãos e Cereais', 15, 3),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Queijo Parmesão', 'kg', 60.00, 'Laticínios', 5, 1),
  ('33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Refrigerante Lata', 'un', 4.50, 'Bebidas', 100, 20);

-- Receitas de exemplo, com ingredientes — já exercita o trigger de
-- recalc_recipe_price no próprio db reset.
insert into recipes (id, user_id, name, category, description, target_margin, is_active)
values
  ('44444444-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Risoto de Filé Mignon', 'Pratos Principais', 'Risoto cremoso com filé ao ponto', 65, true),
  ('44444444-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Refrigerante', 'Bebidas', 'Lata gelada', 50, true);

insert into recipe_ingredients (recipe_id, ingredient_id, quantity)
values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 0.2),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 0.15),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 0.05),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', 1);

-- Mesas de exemplo.
insert into tables (user_id, name, capacity, shape, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Mesa 01', 4, 'square', 'available'),
  ('11111111-1111-1111-1111-111111111111', 'Mesa 02', 2, 'round', 'available');

-- Um lançamento financeiro de exemplo.
insert into financial_records (user_id, type, category, category_type, description, amount, payment_method, date)
values (
  '11111111-1111-1111-1111-111111111111', 'expense', 'Aluguel', 'fixed',
  'Aluguel do mês', 2500.00, 'Transferência', current_date
);

-- Admin da PLATAFORMA (não confundir com o dono do restaurante acima). Não
-- existe fluxo de auto-promoção — essa é a única forma de virar admin fora
-- de um insert manual direto no banco em produção.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '55555555-5555-5555-5555-555555555555',
  'authenticated', 'authenticated',
  'admin@blyn.test',
  crypt('Teste123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(), '', '', '', ''
);

insert into admins (user_id) values ('55555555-5555-5555-5555-555555555555');
