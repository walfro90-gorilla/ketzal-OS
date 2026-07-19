-- 004 — Un abono, un recibo (índice único).
--
-- HALLAZGO (hard testing 2026-07-19): `emit_receipt` se defendía del recibo
-- duplicado con `if exists (select 1 from receipts where payment_id = ...)
-- then raise`. Eso es check-then-insert: entre la lectura y la escritura cabe
-- otra sesión, y `receipts` no tenía ningún índice único sobre `payment_id`.
-- Dos recibos para el mismo abono = dos folios quemados por el mismo dinero.
--
-- La carrera (8 emit_receipt simultáneos por HTTP) NO logró reproducir el
-- duplicado: la primera sesión alcanzaba a comitear antes de que las otras
-- leyeran. Pero eso es ausencia de evidencia, no evidencia de ausencia — la
-- ventana existe en el código. En vez de pelear con el timing hasta forzarla,
-- se cierra por estructura, que es como ya estaba protegido el folio
-- (receipts_supplier_id_folio_key).
--
-- El `if exists` del RPC se conserva: da el mensaje bonito ('Este abono ya
-- tiene recibo') en el 99.99% de los casos. El índice es la red debajo.

create unique index if not exists receipts_payment_id_uidx
  on ketzal.receipts (payment_id);
