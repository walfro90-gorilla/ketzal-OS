-- 011 — F3: pasajeros + manifiesto + vista de salida (para tours con salidas).
--
-- Junta ventas ↔ salida por (service_id, travel_date = departs_on), igual que
-- el trigger de cupo tg_booking_capacity. No hay FK booking→departure: la salida
-- se identifica por service + fecha.
--
-- • booking_passengers: nombres de los pasajeros de cada venta. EDITABLE (no es
--   dinero) ⇒ sin ledger/no_mutar; RLS vía EXISTS a bookings (misma visibilidad).
-- • list_departures / get_departure_detail: DEFINER con guard por agencia DUEÑA
--   del servicio (services.supplier_id) o superadmin. El manifiesto es
--   cross-tenant a propósito (TODOS los pax del camión, incl. reventas), pero el
--   DINERO se muestra SOLO de las ventas propias del que llama.
-- • Manifiesto = asientos tomados: status in (reserved,confirmed,paid). Los
--   'draft' son cotizaciones (no toman cupo, igual que tg_booking_capacity).
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

-- ─── tabla ────────────────────────────────────────────────────────────────
create table if not exists ketzal.booking_passengers (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references ketzal.bookings(id) on delete cascade,
  full_name      text not null,
  passenger_type text,                 -- adulto/niño/… (informativo, opcional)
  doc_id         text,                 -- INE/pasaporte (opcional)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists booking_passengers_booking_idx
  on ketzal.booking_passengers (booking_id);

alter table ketzal.booking_passengers enable row level security;

-- Visibilidad = la de la venta (bookings_sel). Escritura = manejar la venta +
-- estar activo (o superadmin). Los pasajeros son datos editables, no dinero.
drop policy if exists bp_sel on ketzal.booking_passengers;
create policy bp_sel on ketzal.booking_passengers for select using (
  exists (select 1 from ketzal.bookings b where b.id = booking_id and (
    ketzal.is_superadmin()
    or b.sold_by = auth.uid()
    or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
  ))
);

drop policy if exists bp_ins on ketzal.booking_passengers;
create policy bp_ins on ketzal.booking_passengers for insert with check (
  ketzal.is_superadmin() or (ketzal.is_active() and exists (
    select 1 from ketzal.bookings b where b.id = booking_id and (
      b.sold_by = auth.uid()
      or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
    )))
);

drop policy if exists bp_upd on ketzal.booking_passengers;
create policy bp_upd on ketzal.booking_passengers for update using (
  ketzal.is_superadmin() or (ketzal.is_active() and exists (
    select 1 from ketzal.bookings b where b.id = booking_id and (
      b.sold_by = auth.uid()
      or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
    )))
) with check (
  ketzal.is_superadmin() or (ketzal.is_active() and exists (
    select 1 from ketzal.bookings b where b.id = booking_id and (
      b.sold_by = auth.uid()
      or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
    )))
);

drop policy if exists bp_del on ketzal.booking_passengers;
create policy bp_del on ketzal.booking_passengers for delete using (
  ketzal.is_superadmin() or (ketzal.is_active() and exists (
    select 1 from ketzal.bookings b where b.id = booking_id and (
      b.sold_by = auth.uid()
      or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
    )))
);

grant select, insert, update, delete on ketzal.booking_passengers to authenticated;

-- ─── list_departures ──────────────────────────────────────────────────────
-- Salidas que opera la agencia del que llama (dueña del servicio) o todas si
-- superadmin. Ocupación + progreso de captura de pasajeros. DEFINER + scope.
create or replace function ketzal.list_departures(p_from date default current_date)
  returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            d.id,
    'service_id',    d.service_id,
    'service',       s.name,
    'departs_on',    d.departs_on,
    'max_capacity',  d.max_capacity,
    'seats_taken',   d.seats_taken,
    'note',          d.note,
    'num_ventas', (select count(*) from ketzal.bookings b
                     where b.service_id = d.service_id and b.travel_date = d.departs_on
                       and b.status in ('reserved','confirmed','paid')),
    'pax_capturados', (select count(*) from ketzal.booking_passengers bp
                         join ketzal.bookings b on b.id = bp.booking_id
                        where b.service_id = d.service_id and b.travel_date = d.departs_on
                          and b.status in ('reserved','confirmed','paid'))
  ) order by d.departs_on asc), '[]'::jsonb) into v
  from ketzal.service_departures d
  join ketzal.services s on s.id = d.service_id
  where d.departs_on >= p_from and (v_super or s.supplier_id = v_sup);

  return v;
end $$;
revoke all on function ketzal.list_departures(date) from public;
grant execute on function ketzal.list_departures(date) to authenticated;

-- ─── get_departure_detail ─────────────────────────────────────────────────
-- Manifiesto de una salida. GUARD: solo la agencia dueña del servicio o
-- superadmin (raise si no). Cross-tenant a propósito: lista TODOS los pax del
-- camión (incl. reventas de otras agencias), pero el DINERO (total/cobrado/
-- saldo) solo de las ventas propias del que llama.
create or replace function ketzal.get_departure_detail(p_departure_id uuid)
  returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
  v_uid uuid := auth.uid();
  d record;
begin
  select dep.id, dep.service_id, dep.departs_on, dep.max_capacity, dep.seats_taken, dep.note,
         s.name as service, s.supplier_id as owner_id,
         (select su.name from ketzal.suppliers su where su.id = s.supplier_id) as agency
    into d
    from ketzal.service_departures dep
    join ketzal.services s on s.id = dep.service_id
   where dep.id = p_departure_id;
  if not found then return null; end if;

  -- GUARD (punto crítico de fuga): solo dueño del servicio o superadmin.
  if not v_super and (d.owner_id is null or d.owner_id <> v_sup) then
    raise exception 'Sin acceso a esta salida';
  end if;

  select jsonb_build_object(
    'departure', jsonb_build_object(
      'id', d.id, 'service', d.service, 'agency', d.agency,
      'departs_on', d.departs_on, 'max_capacity', d.max_capacity,
      'seats_taken', d.seats_taken, 'note', d.note
    ),
    'totals', (
      select jsonb_build_object(
        'num_ventas', count(*),
        'num_pax', coalesce(sum(b.num_pax), 0),
        'pax_capturados', (select count(*) from ketzal.booking_passengers bp
                             join ketzal.bookings b2 on b2.id = bp.booking_id
                            where b2.service_id = d.service_id and b2.travel_date = d.departs_on
                              and b2.status in ('reserved','confirmed','paid'))
      )
      from ketzal.bookings b
      where b.service_id = d.service_id and b.travel_date = d.departs_on and b.status in ('reserved','confirmed','paid')
    ),
    'money', (
      select jsonb_build_object(
        'vendido_propio', coalesce(sum(b.total), 0),
        'cobrado_propio', coalesce(sum(c.cobrado), 0),
        'saldo_propio',   coalesce(sum(round(b.total - c.cobrado, 2)), 0)
      )
      from ketzal.bookings b
      cross join lateral (
        select coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                                 when p.type = 'refund'  then -p.amount_mxn else 0 end), 0) as cobrado
        from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'
      ) c
      where b.service_id = d.service_id and b.travel_date = d.departs_on and b.status in ('reserved','confirmed','paid')
        and (v_super or b.selling_supplier_id = v_sup or b.sold_by = v_uid)
    ),
    'bookings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'folio', b.folio,
        'customer', (select cu.full_name from ketzal.customers cu where cu.id = b.customer_id),
        'num_pax', b.num_pax, 'status', b.status,
        'is_own', mine.own,
        'selling_agency', (select su2.name from ketzal.suppliers su2 where su2.id = b.selling_supplier_id),
        'total',   case when mine.own then b.total else null end,
        'cobrado', case when mine.own then c.cobrado else null end,
        'saldo',   case when mine.own then round(b.total - c.cobrado, 2) else null end,
        'passengers', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', bp.id, 'full_name', bp.full_name,
            'passenger_type', bp.passenger_type, 'doc_id', bp.doc_id
          ) order by bp.created_at), '[]'::jsonb)
          from ketzal.booking_passengers bp where bp.booking_id = b.id
        )
      ) order by b.created_at), '[]'::jsonb)
      from ketzal.bookings b
      cross join lateral (
        select (v_super or b.selling_supplier_id = v_sup or b.sold_by = v_uid) as own
      ) mine
      cross join lateral (
        select coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                                 when p.type = 'refund'  then -p.amount_mxn else 0 end), 0) as cobrado
        from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'
      ) c
      where b.service_id = d.service_id and b.travel_date = d.departs_on and b.status in ('reserved','confirmed','paid')
    )
  ) into v;

  return v;
end $$;
revoke all on function ketzal.get_departure_detail(uuid) from public;
grant execute on function ketzal.get_departure_detail(uuid) to authenticated;
