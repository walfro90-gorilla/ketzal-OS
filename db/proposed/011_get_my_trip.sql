-- 011 — get_my_trip(p_booking_id): detalle del viaje para el comprador B2C.
--
-- Devuelve la info del viaje de UN booking del propio viajero: datos del booking
-- (fecha, pax, estado), dinero derivado (total/pagado/saldo vía bookings_with_balance),
-- el servicio (itinerario, incluye/no incluye, imágenes, faqs, ruta) y el contacto
-- de la agencia (suppliers). El comprador no tiene RLS sobre bookings/services, por
-- eso es SECURITY DEFINER; el ownership se fuerza en el WHERE
-- (marketplace_customer_id = auth.uid()) ⇒ solo ve SU viaje. null si no es suyo.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration). [[persona]] viajero.

create or replace function ketzal.get_my_trip(p_booking_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select jsonb_build_object(
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status::text, 'travel_date', b.travel_date,
      'num_pax', b.num_pax, 'payment_type', b.payment_type),
    'money', jsonb_build_object('total', bwb.total, 'paid', bwb.paid, 'balance', bwb.balance),
    'service', jsonb_build_object(
      'name', coalesce(sv.name, 'Viaje'), 'description', sv.description,
      'location', sv.location, 'city_from', sv.city_from, 'state_from', sv.state_from,
      'city_to', sv.city_to, 'state_to', sv.state_to,
      'images', coalesce(sv.images, '[]'::jsonb),
      'includes', coalesce(sv.includes, '[]'::jsonb),
      'excludes', coalesce(sv.excludes, '[]'::jsonb),
      'itinerary', coalesce(sv.itinerary, '[]'::jsonb),
      'faqs', coalesce(sv.faqs, '[]'::jsonb)),
    'agency', case when sup.id is null then null else jsonb_build_object(
      'name', sup.name, 'phone', sup.phone_number, 'email', sup.contact_email, 'logo', sup.img_logo) end,
    'voucher_id', vch.id  -- voucher ya emitido (si existe); si no, el viajero lo genera
  ) into v
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.services sv on sv.id = b.service_id
  left join ketzal.suppliers sup on sup.id = sv.supplier_id
  left join ketzal.vouchers vch on vch.booking_id = b.id
  where b.id = p_booking_id and b.marketplace_customer_id = v_uid and b.status <> 'cancelled';
  return v;
end $$;

grant execute on function ketzal.get_my_trip(uuid) to authenticated;
