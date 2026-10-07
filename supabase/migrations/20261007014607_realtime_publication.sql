-- Habilita Realtime em public_orders, pra tela de Pedidos Online notificar
-- a chegada de novos pedidos 'pending' via subscription em vez do polling de
-- 15s que o FoodFlow original fazia.

alter publication supabase_realtime add table public_orders;
