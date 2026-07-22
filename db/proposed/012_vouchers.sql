-- 012 — F4: voucher de servicio foliado.
--
-- El voucher ACREDITA EL SERVICIO (se presenta al operador/hotel), NO el dinero:
-- get_voucher_public no expone montos. Folio por agencia vía next_doc_folio
-- (serie 'voucher'), atómico sin huecos (reusa la infra de F1).
--
-- • vouchers: id = token público, un voucher por venta (booking_id unique),
--   folio único por agencia. Append-only desde la app (REVOKE update/delete).
-- • emit_voucher(booking): INVOKER, idempotente (si ya existe lo regresa), solo
--   ventas reserved/confirmed/paid (no draft/cancelled).
-- • get_voucher_public(id): DEFINER anon, fail-closed (null si cancelada o no
--   existe). Sin dinero: agencia, folio, cliente, servicio, fecha, pax, pasajeros.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create table if not exists ketzal.vouchers (
  id          uuid primary key default gen_random_uuid(),   -- token público
  booking_id  uuid not null unique references ketzal.bookings(id) on delete cascade,
  supplier_id uuid references ketzal.suppliers(id),          -- agencia emisora (scope del folio)
  folio       bigint not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (supplier_id, folio)
);

alter table ketzal.vouchers enable row level security;

-- Visibilidad = la de la venta (bookings_sel).
drop policy if exists vouchers_sel on ketzal.vouchers;
create policy vouchers_sel on ketzal.vouchers for select using (
  exists (select 1 from ketzal.bookings b where b.id = booking_id and (
    ketzal.is_superadmin()
    or b.sold_by = auth.uid()
    or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
  ))
);

-- Alta vía emit_voucher (INVOKER): quien maneja la venta y está activo.
drop policy if exists vouchers_ins on ketzal.vouchers;
create policy vouchers_ins on ketzal.vouchers for insert with check (
  ketzal.is_superadmin() or (ketzal.is_active() and exists (
    select 1 from ketzal.bookings b where b.id = booking_id and (
      b.sold_by = auth.uid()
      or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
    )))
);

-- Append-only desde la app: el folio no se muta ni se borra.
revoke update, delete, truncate on ketzal.vouchers from authenticated;
grant select, insert on ketzal.vouchers to authenticated;

-- ── emit_voucher ──────────────────────────────────────────────────────────
create or replace function ketzal.emit_voucher(p_booking_id uuid) returns uuid
  language plpgsql security invoker
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_id uuid;
  v_supplier uuid;
  v_status ketzal.booking_status;
  v_folio bigint;
begin
  -- idempotente: si ya existe, regresa el mismo voucher
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  if found then return v_id; end if;

  -- la venta (RLS: solo quien la maneja la ve)
  select selling_supplier_id, status into v_supplier, v_status
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
  if v_status not in ('reserved','confirmed','paid') then
    raise exception 'El voucher se emite en ventas confirmadas (no borrador ni cancelada).';
  end if;

  -- folio por agencia (o auth.uid del agente libre), serie 'voucher'
  v_folio := ketzal.next_doc_folio(coalesce(v_supplier, auth.uid()), 'voucher');

  insert into ketzal.vouchers(booking_id, supplier_id, folio)
    values (p_booking_id, v_supplier, v_folio)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  -- carrera: otro emitió entre el select y el insert ⇒ regresa el existente
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  return v_id;
end $$;
revoke all on function ketzal.emit_voucher(uuid) from public, anon;
grant execute on function ketzal.emit_voucher(uuid) to authenticated;

-- ── get_voucher_public ────────────────────────────────────────────────────
create or replace function ketzal.get_voucher_public(p_id uuid) returns jsonb
  language sql stable security definer
  set search_path to 'ketzal', 'public'
as $$
  select jsonb_build_object(
    'agencia',      coalesce(s.name, 'Ketzal'),
    'logo',         s.img_logo,
    'email',        s.contact_email,
    'telefono',     s.phone_number,
    'folio',        v.folio,
    'fecha_emision',v.created_at,
    'cliente',      c.full_name,
    'servicio',     coalesce(srv.name, 'Viaje'),
    'fecha_viaje',  b.travel_date,
    'pax',          b.num_pax,
    'estado',       b.status,
    'pasajeros',    coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', bp.full_name, 'passenger_type', bp.passenger_type
      ) order by bp.created_at)
      from ketzal.booking_passengers bp where bp.booking_id = b.id
    ), '[]'::jsonb)
  )
  from ketzal.vouchers v
  join ketzal.bookings b on b.id = v.booking_id
  left join ketzal.customers c   on c.id   = b.customer_id
  left join ketzal.services  srv on srv.id = b.service_id
  left join ketzal.suppliers s   on s.id   = v.supplier_id
  where v.id = p_id
    and b.status <> 'cancelled';   -- fail-closed: no acreditar venta cancelada
$$;
revoke all on function ketzal.get_voucher_public(uuid) from public;
grant execute on function ketzal.get_voucher_public(uuid) to anon, authenticated;
