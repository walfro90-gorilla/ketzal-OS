-- m001_public_departure_note — espejo de la migración aplicada 2026-08-23.
-- La ficha pública (/servicio/[id]) pinta la nota de cada salida futura
-- (horario, punto de reunión, preventa). Sólo agrega 'note' a los dos arrays
-- de get_public_service; el resto es el DDL vivo (pg_get_functiondef) re-aplicado.
-- Idempotente (create or replace).
create or replace function ketzal.get_public_service(p_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'ketzal', 'public'
as $function$
  select to_jsonb(t) from (
    select s.id, s.name, s.description, s.price, s.service_type, s.service_category,
           s.location, s.city_from, s.state_from, s.city_to, s.state_to,
           s.size_tour, s.max_capacity, s.current_bookings,
           s.images, s.yt_link, s.includes, s.excludes, s.faqs, s.itinerary,
           s.packs, s.add_ons, s.dates,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides,
                        'note', d.note
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date
               and d.seats_taken < d.max_capacity
           ), '[]'::jsonb) as departures,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides,
                        'note', d.note
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date - interval '180 days'
           ), '[]'::jsonb) as all_departures,
           jsonb_build_object(
             'id', sup.id,
             'name', sup.name, 'logo', sup.img_logo,
             'email', sup.contact_email, 'phone', sup.phone_number
           ) as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    where s.id = p_id and s.published
  ) t;
$function$;
