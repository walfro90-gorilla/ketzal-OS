-- 014 — F6: divisas USD (TC manual light).
--
-- El motor entero sigue en MXN (autoritativo): al vender en USD, el FORM
-- convierte a MXN con el TC (unit_price_mxn = usd × tc) y manda MXN al RPC de
-- venta EXISTENTE (create_booking_with_items no se toca). Solo se anota en la
-- venta la divisa original + el TC, para MOSTRAR "USD @ TC · MXN autoritativo"
-- (el USD se deriva: usd = mxn / tc). payments/reportes/cobranza/invariantes
-- quedan intactos (todo MXN).
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

alter table ketzal.bookings
  add column if not exists exchange_rate numeric(12,4);

-- currency ∈ {MXN, USD}; MXN ⇒ sin TC; USD ⇒ TC > 0 (divisa_sin_tc en la BD).
alter table ketzal.bookings drop constraint if exists bookings_currency_rate_chk;
alter table ketzal.bookings add constraint bookings_currency_rate_chk check (
  (currency = 'MXN' and exchange_rate is null) or
  (currency = 'USD' and exchange_rate is not null and exchange_rate > 0)
);

-- set_booking_currency: anota divisa + TC en la propia venta (RLS bookings_upd).
-- No se permite cambiar la divisa si ya hay abonos (el MXN quedó fijado con ese
-- TC). INVOKER: usa el RLS del que llama.
create or replace function ketzal.set_booking_currency(
  p_booking_id uuid, p_currency text, p_rate numeric
) returns void
  language plpgsql security invoker
  set search_path to 'ketzal', 'pg_temp'
as $$
declare v_paid numeric;
begin
  if p_currency not in ('MXN','USD') then
    raise exception 'Divisa no válida (solo MXN o USD).';
  end if;
  if p_currency = 'USD' and (p_rate is null or p_rate <= 0) then
    raise exception 'El tipo de cambio debe ser mayor que cero.';
  end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund'  then -amount_mxn else 0 end), 0)
    into v_paid
    from ketzal.payments where booking_id = p_booking_id and status = 'COMPLETED';
  if v_paid <> 0 then
    raise exception 'No se puede cambiar la divisa: la venta ya tiene abonos.';
  end if;

  update ketzal.bookings
     set currency = p_currency,
         exchange_rate = case when p_currency = 'USD' then round(p_rate, 4) else null end
   where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
end $$;
revoke all on function ketzal.set_booking_currency(uuid, text, numeric) from public, anon;
grant execute on function ketzal.set_booking_currency(uuid, text, numeric) to authenticated;
