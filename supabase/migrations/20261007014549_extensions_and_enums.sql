-- Extensões e tipos enum compartilhados por todo o schema do Blyn.

create extension if not exists pgcrypto;

create type subscription_status as enum ('trial', 'active', 'past_due', 'canceled', 'expired');
create type billing_cycle as enum ('monthly', 'semiannual', 'annual');

create type unit_enum as enum ('kg', 'g', 'L', 'ml', 'un', 'dz', 'cx');

create type ingredient_category as enum (
  'Carnes', 'Aves', 'Peixes e Frutos do Mar', 'Embutidos e Defumados',
  'Laticínios', 'Ovos', 'Vegetais', 'Frutas', 'Legumes', 'Verduras e Folhas',
  'Grãos e Cereais', 'Farinhas e Massas', 'Pães e Padaria', 'Óleos e Gorduras',
  'Temperos e Especiarias', 'Molhos e Condimentos', 'Enlatados e Conservas',
  'Açúcares e Adoçantes', 'Chocolates e Confeitaria', 'Bebidas',
  'Bebidas Alcoólicas', 'Descartáveis e Embalagens', 'Produtos de Limpeza', 'Outros'
);

create type recipe_category as enum (
  'Entradas', 'Pratos Principais', 'Acompanhamentos', 'Sobremesas', 'Bebidas'
);

create type table_shape as enum ('square', 'round');
create type table_status as enum ('available', 'occupied', 'reserved', 'cleaning');

-- Enum único de forma de pagamento, reutilizado em orders/financial_records/accounts.
-- Casing normalizado (o FoodFlow original misturava "Pix"/"PIX" em telas diferentes).
create type payment_method as enum (
  'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Pix', 'Transferência', 'Boleto'
);

create type order_status as enum ('open', 'closed');

create type public_order_type as enum ('delivery', 'table', 'pickup');
create type public_order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');

create type financial_type as enum ('income', 'expense');
create type financial_category_type as enum ('fixed', 'variable', 'app_fee', 'revenue');

create type account_type as enum ('payable', 'receivable');
create type account_status as enum ('pending', 'paid', 'overdue');

create type stock_movement_type as enum ('entrada', 'saida', 'ajuste');
create type stock_reference_type as enum ('venda', 'venda_online');

-- Catálogo de permissões de equipe (26 chaves), usado como array em team_members.
create type permission_key as enum (
  'dashboard.view',
  'pdv.view', 'pdv.create',
  'tables.view', 'tables.manage',
  'sales.view',
  'ingredients.view', 'ingredients.manage',
  'stock.view', 'stock.manage',
  'menu.view', 'menu.edit',
  'recipes.view', 'recipes.manage',
  'financial.view', 'financial.manage',
  'profit.view',
  'dre.view',
  'reports.view',
  'digital_menu.view', 'digital_menu.manage',
  'online_orders.view', 'online_orders.manage',
  'settings.view', 'settings.manage',
  'team.manage'
);
