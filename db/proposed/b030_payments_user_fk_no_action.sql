-- b030 — payments.user_id → auth.users: CASCADE → NO ACTION.
-- Espejo de la migración aplicada `b030_payments_user_fk_no_action`.
--
-- `payments` es un ledger INMUTABLE (trigger `no_mutar` BEFORE DELETE OR TRUNCATE,
-- a nivel STATEMENT para poder bloquear TRUNCATE). El FK era ON DELETE CASCADE: al
-- borrar un auth user, el CASCADE emite `DELETE FROM payments` y el trigger lo
-- bloquea SIEMPRE (aun con 0 filas) ⇒ NO se podía borrar ningún usuario
-- (rompía eliminarViajero y los rollbacks de alta de embajador/proveedor/admin).
--
-- CASCADE sobre un ledger append-only es contradictorio: jamás se debe auto-borrar
-- un pago. NO ACTION: borrar un usuario CON pagos queda bloqueado (protege el
-- vínculo pago↔pagador); SIN pagos, se permite.
alter table ketzal.payments drop constraint payments_user_id_fkey;
alter table ketzal.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete no action;
