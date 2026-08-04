-- b043 — Abordaje: escáner receptor por agencia (QR del voucher b042).
-- Espejo de la migración aplicada `b043_abordaje`.
--
-- El staff escanea el QR al abordar y "caza" a cada viajero con su asiento:
--  · booking_passengers gana `boarded_at` (fecha/hora de abordaje) y
--    `boarded_by` (quién lo registró, auditoría). Editable como el resto de
--    la tabla F3 (no es dinero).
--  · Guard `es_staff_de_booking` (STAFF-only — el comprador NO se auto-aborda):
--    superadmin ∨ staff activo de la agencia vendedora/dueña ∨ quien vendió.
--    Con coalesce(false) — lección b041 (NULL en comparación vs supplier null).
--  · `boarding_info(voucher_id)`: venta + pasajeros con asiento y estado de
--    abordaje, ordenados por asiento. Fail-closed (voucher inexistente o venta
--    cancelada ⇒ null).
--  · `board_passenger(passenger_id, board)`: marca con hora (idempotente —
--    re-abordar CONSERVA la hora original) o desmarca (corrección).
-- App: /abordaje (ops) = escáner con cámara (BarcodeDetector nativo) + entrada
-- manual; /abordaje/[voucherId] = panel de check-in; el certificado ?c del QR
-- se verifica server-side (src/lib/voucher-cert.ts). Hard-test 7/7 en rollback
-- (staff aborda/desmarca, idempotencia de hora, comprador y agencia ajena
-- denegados, fail-closed).

alter table ketzal.booking_passengers add column if not exists boarded_at timestamptz;
alter table ketzal.booking_passengers add column if not exists boarded_by uuid references ketzal.profiles(id);

-- (cuerpos completos de es_staff_de_booking / boarding_info / board_passenger
--  en la migración aplicada; grants: authenticated + service_role, anon fuera)
