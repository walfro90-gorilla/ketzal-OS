-- b079 — El embajador devenga cuando la venta es real, no cuando es una cotización.
-- Espejo de la migración aplicada `b079_embajador_devenga_al_confirmar`.
--
-- ── El problema, medido en vivo (2026-09-01) ────────────────────────────────
--
-- `create_marketplace_order` inserta el booking con `status='draft'` y
-- `sold_by = null`. `attribute_booking_by_ref` se llama INMEDIATAMENTE después
-- (src/app/comprar/actions.ts) y ahí mismo INSERTA la `commission_line` del
-- embajador. De eso salen tres daños:
--
--   1. DEUDA FANTASMA. `tg_ledger_mirror_commission` postea el asiento en el
--      ledger en cuanto nace la línea. Una cotización que nadie paga deja
--      '+embajador / −agencia' vivos para siempre: los drafts no se cancelan,
--      así que b073 nunca los reversa. El saldo de /cuentas diverge del portal.
--   2. PEDIDO IMBORRABLE. `commission_lines.booking_id` es FK **sin cascade** y
--      el trigger `no_mutar` prohíbe DELETE sobre `commission_lines`. Entonces
--      `delete_my_draft_order` truena con 23503 para CUALQUIER draft que llegó
--      con `?ref`: el comprador no puede borrar su propio pedido. Nunca.
--   3. AUTO-REFERIDO ABIERTO. El guard de m010 es `b.sold_by = v_amb`, pero en
--      el portal `sold_by` es SIEMPRE null — al comprador lo identifica
--      `marketplace_customer_id`. Un embajador se compra su propio viaje con su
--      código y se paga comisión a sí mismo.
--
-- Los otros tres beneficiarios (plataforma, agencia, agente) ya devengan bien:
-- lo hace `tg_commission_snapshot` cuando el booking DEJA de ser draft. El
-- embajador era el único que se salía del molde.
--
-- ── La decisión (ADR-0029) ─────────────────────────────────────────────────
--
-- El embajador devenga por el MISMO camino que los otros tres. La atribución
-- (quién trajo la venta) se separa del devengo (cuánto se le debe):
--   · `attribute_booking_by_ref` / `set_booking_ambassador` VALIDAN y escriben
--     `bookings.ambassador_id`. Ya no insertan dinero.
--   · `tg_commission_snapshot` gana un cuarto bloque que crea la línea cuando
--     el booking llega a reserved/confirmed/paid.
--
-- OJO CON EL TRIGGER: pasa a `AFTER INSERT OR UPDATE OF status, ambassador_id`.
-- La palabra `ambassador_id` NO es opcional — la venta del back-office nace ya
-- en 'reserved', así que el trigger corre en el INSERT cuando `ambassador_id`
-- todavía es null, y sin ese `UPDATE OF` el `set_booking_ambassador` posterior
-- no lo volvería a disparar: esa venta jamás devengaría.
--
-- Los `referral_misses` de "no hay dinero" (sin_tarifa_de_la_agencia,
-- tarifa_da_cero, comisiones_exceden_la_venta) se mudan al trigger, que es
-- donde ahora se decide el dinero. Los de "no hay a quién pagarle"
-- (codigo_inexistente, perfil_inactivo, auto_referido) se quedan en la
-- atribución. Se re-aplican ADITIVAMENTE desde el DDL vivo (m010 + m008).

-- ── 1. Atribuir ya no devenga; y el auto-referido cubre al comprador ────────
create or replace function ketzal.attribute_booking_by_ref(p_booking uuid, p_ref text)
  returns uuid
  language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid; b ketzal.bookings;
begin
  if v_uid is null then return null; end if;
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then return null; end if;

  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    return null;
  end if;

  -- m010: un agente con código también refiere.
  select id into v_amb from ketzal.profiles
   where referral_code = v_code and type in ('embajador', 'agente');
  if v_amb is null then
    insert into ketzal.referral_misses (booking_id, ref_code, supplier_id, reason)
    values (p_booking, v_code, b.selling_supplier_id, 'codigo_inexistente');
    return null;
  end if;

  -- m010: dado de baja ⇒ deja de cobrar, pero con SU razón.
  if not exists (select 1 from ketzal.profiles p where p.id = v_amb and p.active) then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'perfil_inactivo');
    return null;
  end if;

  -- AUTO-REFERIDO. m010 solo miraba `sold_by` (quien CIERRA la venta en el
  -- back-office). En el marketplace `sold_by` es siempre null y al comprador lo
  -- identifica `marketplace_customer_id`: sin esta segunda condición, un
  -- embajador compraba su propio viaje con su código y se pagaba comisión.
  if (b.sold_by is not null and b.sold_by = v_amb)
     or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_amb) then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'auto_referido');
    return null;
  end if;

  -- Solo se ATRIBUYE. El dinero lo decide `tg_commission_snapshot` cuando la
  -- venta deja de ser cotización. No se pisa una atribución ya hecha.
  update ketzal.bookings set ambassador_id = v_amb
   where id = p_booking and ambassador_id is null;

  -- Devuelve el EMBAJADOR atribuido (antes devolvía el id de la commission_line,
  -- que ya no nace aquí). Ningún llamador usaba el valor.
  return v_amb;
end $function$;

-- ── 2. La asignación manual tampoco devenga ────────────────────────────────
create or replace function ketzal.set_booking_ambassador(p_booking uuid, p_ambassador uuid)
  returns uuid
  language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); b ketzal.bookings;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then raise exception 'Venta no encontrada'; end if;
  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    raise exception 'Sin permiso sobre esta venta';
  end if;
  if not exists (select 1 from ketzal.profiles s where s.id = p_ambassador and s.type = 'embajador') then
    raise exception 'Embajador no válido';
  end if;
  -- Mismo criterio que el marketplace: quien compra no se refiere a sí mismo.
  if (b.sold_by is not null and b.sold_by = p_ambassador)
     or (b.marketplace_customer_id is not null and b.marketplace_customer_id = p_ambassador) then
    raise exception 'Esa persona es quien compra o quien vendió: no puede referirse a sí misma';
  end if;

  update ketzal.bookings set ambassador_id = p_ambassador
   where id = p_booking and ambassador_id is null;
  return p_ambassador;
end $function$;

-- ── 3. El devengo del embajador, junto a los otros tres ────────────────────
-- Re-aplicado ADITIVAMENTE desde el DDL vivo: los bloques de plataforma,
-- agencia y agente quedan idénticos; se agrega el cuarto.
create or replace function ketzal.tg_commission_snapshot()
  returns trigger
  language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record; v_amt numeric(12,2); v_sum numeric(12,2); v_code text;
begin
  if NEW.status not in ('reserved','confirmed','paid') then return NEW; end if;

  if NEW.channel = 'portal'
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='plataforma' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'plataforma', null);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'plataforma', null, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  if NEW.selling_supplier_id is not null
     and NEW.owner_supplier_id is not null
     and NEW.owner_supplier_id <> NEW.selling_supplier_id
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='agencia' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'agencia', NEW.owner_supplier_id);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'agencia', NEW.selling_supplier_id, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  if NEW.sold_by is not null
     and NEW.selling_supplier_id is not null
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='agente' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'agente', NEW.sold_by);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'agente', NEW.sold_by, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  -- b079: EMBAJADOR. Nace aquí y no en la atribución, para que una cotización
  -- abandonada no deje asiento en el ledger ni vuelva imborrable el pedido.
  if NEW.ambassador_id is not null
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='embajador' and l.kind='devengo') then
    -- `referral_misses.ref_code` es NOT NULL y aquí ya no traemos el código
    -- tecleado: se recupera el del perfil, que es el mismo con el que se
    -- atribuyó (`set_referral_code` lo mantiene único).
    select coalesce(referral_code, '(sin código)') into v_code
      from ketzal.profiles where id = NEW.ambassador_id;

    select * into r from ketzal.resolve_commission_rule(
      NEW.service_id, 'embajador', NEW.ambassador_id, NEW.selling_supplier_id);

    if r.basis is null then
      -- La agencia dueña del viaje no fijó tarifa de embajador (m008/ADR-0021).
      insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
      select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'sin_tarifa_de_la_agencia'
       where not exists (select 1 from ketzal.referral_misses m
                          where m.booking_id = NEW.id and m.reason = 'sin_tarifa_de_la_agencia');
    else
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt <= 0 then
        insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
        select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'tarifa_da_cero'
         where not exists (select 1 from ketzal.referral_misses m
                            where m.booking_id = NEW.id and m.reason = 'tarifa_da_cero');
      else
        -- Ninguna comisión puede hacer que la venta deba más de lo que vale.
        select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
          into v_sum from ketzal.commission_lines where booking_id = NEW.id;
        if v_sum + v_amt > NEW.total then
          insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
          select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'comisiones_exceden_la_venta'
           where not exists (select 1 from ketzal.referral_misses m
                              where m.booking_id = NEW.id and m.reason = 'comisiones_exceden_la_venta');
        else
          insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate,
                                              unit_amount, num_pax, amount_mxn)
          values (NEW.id, 'embajador', NEW.ambassador_id, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
        end if;
      end if;
    end if;
  end if;

  return NEW;
end $function$;

-- ── 4. El trigger también escucha `ambassador_id` ──────────────────────────
-- Sin esto, la venta del back-office (que nace en 'reserved') corre el trigger
-- en el INSERT con ambassador_id null y jamás vuelve a correr: no devengaría.
drop trigger if exists trg_commission_snapshot on ketzal.bookings;
create trigger trg_commission_snapshot
  after insert or update of status, ambassador_id on ketzal.bookings
  for each row execute function ketzal.tg_commission_snapshot();

revoke all on function ketzal.attribute_booking_by_ref(uuid, text) from public, anon;
grant execute on function ketzal.attribute_booking_by_ref(uuid, text) to authenticated, service_role;
revoke all on function ketzal.set_booking_ambassador(uuid, uuid) from public, anon;
grant execute on function ketzal.set_booking_ambassador(uuid, uuid) to authenticated, service_role;
