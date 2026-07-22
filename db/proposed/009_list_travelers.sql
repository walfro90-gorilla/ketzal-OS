-- 009 — list_travelers(): el god admin ve a los viajeros (compradores B2C).
--
-- `ketzal.marketplace_customers` tiene RLS solo-dueño (id = auth.uid()), así que
-- ni el superadmin puede verla con un SELECT normal. Este RPC es SECURITY DEFINER
-- y está estrictamente gateado a superadmin (a diferencia de list_team, que
-- también deja ver a admins de agencia: los viajeros NO son datos de agencia).
--
-- Solo lectura agregada (no toca dinero ni RLS de otras tablas). Espejo del DDL
-- vivo; la fuente es la BD (aplicado vía apply_migration).

create or replace function ketzal.list_travelers() returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare v jsonb;
begin
  -- Solo el god admin. Cualquier otro (agente, admin de agencia, anon) ⇒ vacío.
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'full_name',   m.full_name,
    'email',       m.email,
    'phone',       m.phone,
    'created_at',  m.created_at,
    -- compras ligadas a este viajero (marketplace_customer_id en bookings)
    'num_compras', (select count(*) from ketzal.bookings b
                     where b.marketplace_customer_id = m.id)
  ) order by m.created_at desc), '[]'::jsonb) into v
  from ketzal.marketplace_customers m;

  return v;
end $$;

revoke all on function ketzal.list_travelers() from public;
grant execute on function ketzal.list_travelers() to authenticated;
