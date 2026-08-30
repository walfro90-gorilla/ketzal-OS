-- m006 · El índice único de commission_rules ignoraba scope_profile_id
--
-- `uq_commission_rules` se creó en b019, cuando el scope solo podía ser una
-- agencia (`scope_supplier_id`). b054 agregó `scope_profile_id` para las tarifas
-- por agente y por embajador, pero el índice nunca se actualizó:
--
--   (payee_type, coalesce(scope_supplier_id,'0000…'), coalesce(service_id,'0000…'))
--
-- Para un embajador `scope_supplier_id` es NULL por check, así que TODOS los
-- embajadores con tarifa general colapsaban en la misma clave
-- ('embajador','0000…','0000…') y solo podía existir UNO en toda la plataforma:
-- el segundo moría con "duplicate key value violates unique constraint".
-- Lo mismo aplicaba a las tarifas por agente (b054).
--
-- Se detectó probando m005 en vivo: el admin de Border no pudo fijarle tarifa a
-- su embajador porque ya existía la de un embajador de Wanderlust. Bloqueaba de
-- raíz el objetivo de reclutar embajadores a volumen.
--
-- El índice nuevo agrega `scope_profile_id` a la clave y conserva el resto igual
-- (incluida la parcialidad `where active`, que deja histórico inactivo).

drop index if exists ketzal.uq_commission_rules;

create unique index uq_commission_rules on ketzal.commission_rules
  using btree (
    payee_type,
    coalesce(scope_supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(scope_profile_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(service_id,        '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where active;
