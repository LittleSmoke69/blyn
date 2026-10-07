-- Bucket público pros logos dos restaurantes (path: {user_id}/logo.{ext}).
-- Leitura pública não passa pela RLS de storage.objects (bucket público serve
-- direto); só INSERT/UPDATE/DELETE são restritos ao dono do próprio path.

insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

create policy restaurant_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy restaurant_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy restaurant_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
