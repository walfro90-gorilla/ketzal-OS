-- =============================================================================
-- Ketzal OS · v1 — migración PROPUESTA (schema: ketzal)   [RECONCILIADA]
-- =============================================================================
-- ⚠️  NO APLICADA. Documento para revisión antes de correr en Supabase.
--
-- Reconciliación tras inspeccionar la BD real (2026-07-08):
--   • El schema YA usa `suppliers` como tenant vendedor, vía profiles.supplier_id
--     y las funciones ketzal.my_supplier_id() e ketzal.is_superadmin() (existen).
--     ⇒ NO se crea tabla `agencies`. Las agencias son suppliers de tipo 'agency'.
--       Wanderlust / Border / Snapshot = filas en `suppliers`.
--   • Enums existentes reutilizados: user_role(user,admin,superadmin),
--     payment_status(PENDING,PARTIAL,COMPLETED,REFUNDED).
--   • payments solo tenía política SELECT centrada en el viajero: se agregan
--     políticas por agencia para que el agente registre abonos.
--
-- Convenciones: dinero numeric(12,2); todo scoped por supplier + RLS;
--               ledger append-only; saldo derivado; folios atómicos por agencia.
-- Contexto: docs/DATA_MODEL.md · docs/ARCHITECTURE.md
-- =============================================================================

set search_path = ketzal, public;

-- ---------- Enums nuevos ----------------------------------------------------
do $$ begin
  create type ketzal.booking_status as enum
    ('draft','reserved','confirmed','paid','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ketzal.payment_type as enum ('payment','refund');
exception when duplicate_object then null; end $$;

-- (Opcional) rol de agente vendedor. Si no se agrega, los vendedores usan 'admin'.
-- ALTER TYPE ... ADD VALUE debe ir fuera de un bloque transaccional.
-- alter type ketzal.user_role add value if not exists 'agent';

-- ---------- customers (NO son auth.users) ----------------------------------
-- El agente los captura (lead de WhatsApp / mostrador). Sin login.
create table if not exists ketzal.customers (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ketzal.suppliers(id),  -- la agencia dueña del cliente
  full_name   text not null,
  phone       text,
  email       text,
  doc_id      text,
  notes       text,
  created_by  uuid references ketzal.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists customers_supplier_idx on ketzal.customers(supplier_id);

-- ---------- bookings (LA VENTA) --------------------------------------------
create table if not exists ketzal.bookings (
  id                 uuid primary key default gen_random_uuid(),
  folio              text,
  selling_supplier_id uuid not null references ketzal.suppliers(id),  -- quién vendió (RLS)
  owner_supplier_id   uuid not null references ketzal.suppliers(id),  -- de quién es el servicio
  customer_id        uuid not null references ketzal.customers(id),
  service_id         uuid references ketzal.services(id),             -- nullable: venta a medida
  sold_by            uuid references ketzal.profiles(id),
  travel_date        date,
  num_pax            int  not null default 1,
  subtotal           numeric(12,2) not null default 0,
  discount           numeric(12,2) not null default 0,
  total              numeric(12,2) not null default 0,                -- subtotal - discount
  currency           text not null default 'MXN',
  status             ketzal.booking_status not null default 'draft',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists bookings_selling_idx  on ketzal.bookings(selling_supplier_id);
create index if not exists bookings_customer_idx on ketzal.bookings(customer_id);
create index if not exists bookings_status_idx   on ketzal.bookings(status);

-- ---------- booking_items (líneas: precio con opciones) --------------------
create table if not exists ketzal.booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references ketzal.bookings(id) on delete cascade,
  item_type      text not null default 'passenger',            -- passenger|room|addon|custom
  passenger_type text,                                          -- adult|child|inapam
  description    text,
  qty            int  not null default 1,
  unit_price     numeric(12,2) not null default 0,             -- editable a mano (válvula)
  line_total     numeric(12,2) not null default 0,             -- qty * unit_price
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists booking_items_booking_idx on ketzal.booking_items(booking_id);

-- ---------- payments: re-anclar a booking + tipo + scope por agencia -------
-- Reutiliza el enum existente payment_status (PENDING/PARTIAL/COMPLETED/REFUNDED)
-- para el estado del abono. Cada fila = un abono real (o un reembolso).
alter table ketzal.payments add column if not exists booking_id  uuid references ketzal.bookings(id);
alter table ketzal.payments add column if not exists supplier_id uuid references ketzal.suppliers(id);
alter table ketzal.payments add column if not exists type ketzal.payment_type not null default 'payment';
create index if not exists payments_booking_idx on ketzal.payments(booking_id);
-- Nota: payments.user_id es NOT NULL y apunta a auth.users. En el flujo B2B se
--       llena con el agente que registra el abono (el cliente no tiene login).

-- ---------- receipts + folio atómico por agencia ---------------------------
create table if not exists ketzal.receipt_counters (
  supplier_id uuid primary key references ketzal.suppliers(id),
  last_folio  bigint not null default 0
);

create table if not exists ketzal.receipts (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ketzal.suppliers(id),
  booking_id  uuid not null references ketzal.bookings(id),
  payment_id  uuid references ketzal.payments(id),
  folio       bigint not null,
  amount      numeric(12,2) not null,
  issued_by   uuid references ketzal.profiles(id),
  issued_at   timestamptz not null default now(),
  pdf_url     text,
  unique (supplier_id, folio)
);

-- Folio secuencial sin huecos por agencia (lock de fila; NO count(*)+1).
create or replace function ketzal.next_receipt_folio(p_supplier uuid)
returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into ketzal.receipt_counters(supplier_id, last_folio)
  values (p_supplier, 0)
  on conflict (supplier_id) do nothing;

  update ketzal.receipt_counters
     set last_folio = last_folio + 1
   where supplier_id = p_supplier
  returning last_folio into v;

  return v;
end $$;

-- ---------- saldo derivado (nunca columna suelta) --------------------------
create or replace view ketzal.bookings_with_balance as
select b.*,
       coalesce(sum(case when p.type='payment' then p.amount_mxn else 0 end), 0)
     - coalesce(sum(case when p.type='refund'  then p.amount_mxn else 0 end), 0) as paid,
       b.total
     - ( coalesce(sum(case when p.type='payment' then p.amount_mxn else 0 end), 0)
       - coalesce(sum(case when p.type='refund'  then p.amount_mxn else 0 end), 0) ) as balance
from ketzal.bookings b
left join ketzal.payments p
       on p.booking_id = b.id
      and p.status = 'COMPLETED'::ketzal.payment_status   -- solo abonos efectivamente recibidos
group by b.id;

-- ---------- updated_at automático ------------------------------------------
create or replace function ketzal.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ begin
  create trigger trg_customers_touch before update on ketzal.customers for each row execute function ketzal.touch_updated_at();
  create trigger trg_bookings_touch  before update on ketzal.bookings  for each row execute function ketzal.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ---------- RLS (reutiliza my_supplier_id() e is_superadmin() existentes) ---
alter table ketzal.customers     enable row level security;
alter table ketzal.bookings      enable row level security;
alter table ketzal.booking_items enable row level security;
alter table ketzal.receipts      enable row level security;

create policy customers_tenant on ketzal.customers
  for all to authenticated
  using      ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
  with check ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

create policy bookings_tenant on ketzal.bookings
  for all to authenticated
  using      ( selling_supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
  with check ( selling_supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

create policy booking_items_tenant on ketzal.booking_items
  for all to authenticated
  using ( exists (
    select 1 from ketzal.bookings b
    where b.id = booking_id
      and ( b.selling_supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
  ));

create policy receipts_tenant on ketzal.receipts
  for all to authenticated
  using      ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
  with check ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

-- ---------- payments: agregar acceso del agente por agencia ----------------
-- (La política payments_select existente sigue: el viajero ve sus pagos.)
create policy payments_agency_select on ketzal.payments
  for select to authenticated
  using ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

create policy payments_agency_insert on ketzal.payments
  for insert to authenticated
  with check ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

create policy payments_agency_update on ketzal.payments
  for update to authenticated
  using      ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
  with check ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() );

-- =============================================================================
-- Fin de la propuesta v1 reconciliada. Correr get_advisors(security) tras aplicar.
-- Semilla sugerida (post-migración): convertir Wanderlust/Border/Snapshot en
-- filas de `suppliers` con supplier_type='agency' y ligar profiles.supplier_id.
-- =============================================================================
