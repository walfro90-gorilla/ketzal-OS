-- b061 — insertar pagos, recibos y vouchers exige ser staff DE ESA VENTA.
-- Migraciones aplicadas: `b061_insert_acotado_por_venta` +
--                       `b061_grant_es_staff_de_booking` (2026-08-19).
--
-- ══ EL HUECO ══
-- Encontrado en el barrido adversarial que siguió a b060. Las policies de INSERT
-- de `payments` y `receipts` aceptaban la rama `supplier_id IS NULL` —que
-- CUALQUIER autenticado satisface— y no miraban de quién era la venta.
--
-- Comprobado en vivo: las cuentas de VIAJERO y de EMBAJADOR insertaron un abono
-- COMPLETED de $5,000 sobre una venta de Wanderlust que ni siquiera podían leer.
--
-- Impacto: `bookings_with_balance` deriva el saldo sumando `payments` por
-- `booking_id`, así que la venta quedaba "pagada" sin que entrara dinero. Es el
-- mismo daño que b051 cerró para UPDATE (inflar `amount_mxn`); b051 revocó UPDATE
-- y DELETE de `payments` pero dejó INSERT abierto por policy. En `receipts`, el
-- mismo patrón permitía fabricar un recibo público con el folio que uno quisiera.
--
-- ══ POR QUÉ NO SE REVOCA INSERT (que sería lo canónico del repo) ══
-- `register_payment`, `emit_receipt` y `emit_voucher` son SECURITY INVOKER: se
-- apoyan en estas mismas policies. Revocar INSERT los rompería, y volverlos
-- DEFINER es un cambio mucho mayor sobre el corazón del dinero. Se aprieta la
-- policy, que es lo quirúrgico: ahora exige que la venta sea operable por quien
-- escribe.
--
-- `es_staff_de_booking(bookings)` ya existía (DEFINER) y dice exactamente eso:
-- superadmin, o activo y (agencia vendedora, agencia dueña, o vendedor). NO
-- incluye al comprador del marketplace — correcto: el comprador nunca inserta
-- pagos a mano; sus caminos (`submit_spei_payment`, `confirm_online_payment`,
-- `redeem_credit`) son SECURITY DEFINER y no pasan por RLS.
--
-- ══ LA LECCIÓN QUE COSTÓ UNA ITERACIÓN ══
-- Con la policy apretada, los tres ataques salían BLOQUEADO... y el admin de la
-- agencia TAMPOCO PODÍA COBRAR: "permission denied for function
-- es_staff_de_booking". El helper sólo se llamaba desde funciones DEFINER (que
-- corren como owner) y nunca había necesitado GRANT; dentro de una policy lo
-- evalúa el rol del que escribe. De ahí la segunda migración con el GRANT.
--
-- Un hard-test que sólo verifica que el atacante falle da verde sobre un sistema
-- que no funciona. Hay que probar SIEMPRE el camino feliz en la misma corrida.
--
-- ══ HARD-TEST (rollback) ══
--   viajero    inyectar abono BLOQUEADO · forjar recibo BLOQUEADO
--   embajador  inyectar abono BLOQUEADO · forjar recibo BLOQUEADO
--   proveedor  inyectar abono BLOQUEADO · forjar recibo BLOQUEADO
--   admin de la agencia: register_payment OK · emit_receipt OK (folio 1) ·
--                        emit_voucher OK · saldo derivado 600.00 exacto
--
-- ══ REGRESIÓN CON RLS ACTIVA ══
-- 300 operaciones de dinero ejecutadas como `authenticated` (no como owner, que
-- es lo que hace `simulacion_1000_ops.sql` y por eso no ejercita RLS), con las
-- policies de b059/b060/b061 en el camino:
--   300 ok · 0 errores · 123 pagos · 42 recibos · 31 vouchers · 22 devoluciones
--   13 cancelaciones · 0 violaciones de invariantes
-- `verificar_invariantes` 0, advisors 0 ERROR.

drop policy payments_scoped_ins on ketzal.payments;
create policy payments_scoped_ins on ketzal.payments
for insert to authenticated
with check (
  ketzal.is_active()
  and user_id = auth.uid()
  and exists (
    select 1 from ketzal.bookings b
     where b.id = payments.booking_id
       and ketzal.es_staff_de_booking(b)
  )
);

drop policy receipts_ins on ketzal.receipts;
create policy receipts_ins on ketzal.receipts
for insert to authenticated
with check (
  ketzal.is_active()
  and issued_by = auth.uid()
  and exists (
    select 1 from ketzal.bookings b
     where b.id = receipts.booking_id
       and ketzal.es_staff_de_booking(b)
  )
);

-- `vouchers_ins` ya exigía la venta, pero por `sold_by = auth.uid() OR
-- selling_supplier_id = my_supplier_id()`. Se unifica con el mismo helper para
-- que las tres digan lo mismo y no vuelvan a divergir.
drop policy vouchers_ins on ketzal.vouchers;
create policy vouchers_ins on ketzal.vouchers
for insert to authenticated
with check (
  exists (
    select 1 from ketzal.bookings b
     where b.id = vouchers.booking_id
       and ketzal.es_staff_de_booking(b)
  )
);

-- Sin esto, el INSERT legítimo muere: dentro de una policy el helper lo evalúa
-- `authenticated`, no el owner.
grant execute on function ketzal.es_staff_de_booking(ketzal.bookings) to authenticated, service_role;
