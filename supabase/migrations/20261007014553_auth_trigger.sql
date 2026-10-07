-- Trigger que roda no signup (insert em auth.users) e cria profile,
-- subscription (trial de 7 dias) e restaurant_settings (com slug único) —
-- replica o fluxo real do FoodFlow, onde o cliente só faz signUp() com
-- {data: {restaurant_name}} e espera essas 3 linhas existirem depois.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_name text;
begin
  v_restaurant_name := coalesce(new.raw_user_meta_data ->> 'restaurant_name', 'Meu Restaurante');

  insert into public.profiles (user_id, restaurant_name, email)
  values (new.id, v_restaurant_name, new.email);

  insert into public.subscriptions (user_id, status, plan, billing_cycle, trial_end_date, started_at)
  values (new.id, 'trial', 'pro', 'monthly', now() + interval '7 days', now());

  insert into public.restaurant_settings (user_id, restaurant_name, email, slug)
  values (new.id, v_restaurant_name, new.email, generate_unique_slug(v_restaurant_name));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
