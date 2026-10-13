-- Situação de acesso da conta do usuário logado, pro app decidir se libera as
-- telas ou mostra o aviso de assinatura inativa. Membro de equipe herda a
-- assinatura do dono (a RLS de subscriptions só deixa o próprio dono ler, por
-- isso security definer). Admin da plataforma sempre tem acesso.
--
-- Regras de "allowed":
--   trial     -> até trial_end_date (sem data = liberado)
--   active    -> até expires_at (sem data = liberado)
--   past_due  -> liberado (carência; o app mostra aviso)
--   canceled  -> liberado até expires_at (período já pago), depois bloqueia
--   expired   -> bloqueado
--   sem linha -> bloqueado

create or replace function account_access()
returns table (
  status subscription_status,
  trial_end_date timestamptz,
  expires_at timestamptz,
  allowed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select coalesce(
      (select tm.owner_id from team_members tm where tm.user_id = auth.uid()),
      auth.uid()
    ) as owner_id
  )
  select
    s.status,
    s.trial_end_date,
    s.expires_at,
    is_admin(auth.uid()) or coalesce(case s.status
      when 'trial'    then s.trial_end_date is null or s.trial_end_date > now()
      when 'active'   then s.expires_at is null or s.expires_at > now()
      when 'past_due' then true
      when 'canceled' then s.expires_at is not null and s.expires_at > now()
      else false
    end, false) as allowed
  from me
  left join subscriptions s on s.user_id = me.owner_id
  where auth.uid() is not null;
$$;

revoke all on function account_access() from public, anon;
grant execute on function account_access() to authenticated;
