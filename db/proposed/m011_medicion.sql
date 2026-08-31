-- m011 — Medición server-first (ADR-0025)
--
-- 1) bookings.attribution: atribución de marketing del pedido del marketplace.
--    First-touch capturado por el cliente (utm_* / fbclid / gclid / landing /
--    first_touch_at) + captura server al crear el pedido (ip / ua / fbp / fbc).
--    Solo la escribe service role (el comprador no puede escribir bookings).
--    NO es dinero: jsonb nullable de evidencia de marketing.
alter table ketzal.bookings add column if not exists attribution jsonb;

comment on column ketzal.bookings.attribution is
  'ADR-0025: atribución de marketing (first-touch del cliente + ip/ua/fbp/fbc capturados al crear el pedido). Solo service role escribe. No es dinero.';

-- 2) funnel_events: funnel propio del marketplace (sin PostHog/terceros).
--    Deny-all: RLS encendida SIN policies y SIN grants — el patrón mp_accounts.
--    Escribe únicamente service role desde POST /api/track.
--    Sin FKs a propósito: es analítica append-only; un booking/servicio borrado
--    (QA, limpieza) no debe bloquear ni borrar la métrica.
create table if not exists ketzal.funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (char_length(session_id) between 8 and 64),
  event text not null check (event in ('checkout_open', 'order_created', 'pago_metodo')),
  service_id uuid,
  booking_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table ketzal.funnel_events is
  'ADR-0025: funnel del marketplace (pasos que la BD no ve). Deny-all: solo service role via /api/track.';

alter table ketzal.funnel_events enable row level security;

-- Doble revoke (lección de seguridad del repo): el GRANT directo y el heredado
-- por ALTER DEFAULT PRIVILEGES son independientes; se revocan ambos y se
-- verifica contra information_schema, no contra el grant.
revoke all on table ketzal.funnel_events from public, anon, authenticated;

create index if not exists funnel_events_created_idx
  on ketzal.funnel_events (created_at);
