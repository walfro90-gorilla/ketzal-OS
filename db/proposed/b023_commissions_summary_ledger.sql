-- b023 — commissions_summary reescrito para leer el LEDGER (commission_lines).
--
-- CONTEXTO. La versión vieja DERIVABA la comisión al vuelo (total*rate/100 sobre
-- bookings selling-null o owner<>selling), lo que tenía 3 problemas:
--   1. El marketplace B2C (selling=owner) NO aparecía ⇒ el corte de Ketzal era
--      invisible.
--   2. No estaba congelada: cambiar una tasa reescribía el pasado.
--   3. Sumaba flujos opuestos (lo que un libre PAGA a Ketzal salía como "ganado").
-- Además NO estaba acotada al que llama (exponía comisiones de todos).
--
-- AHORA: lee `commission_lines` (el asiento congelado) y ACOTA por beneficiario:
--   · superadmin  → líneas 'plataforma' (el corte de Ketzal: libres + marketplace).
--   · agencia     → líneas 'agencia' donde ella es la que cobra (reventa).
--   · agente libre → nada (su comisión es de la plataforma, no de él).
-- Las de 'embajador' NO salen aquí (son un COSTO ⇒ viven en Gastos / CxP).
--
-- Firma intacta (sin args, jsonb) ⇒ database.types.ts sigue válido. Se agregan
-- claves nuevas al jsonb (basis, unit_amount) que la lista usa para el % o el fijo.

create or replace function ketzal.commissions_summary()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
begin
  with mine as (
    select
      cl.booking_id, cl.payee_type, cl.basis, cl.rate, cl.unit_amount, cl.amount_mxn,
      b.total, b.status, b.marketplace_customer_id, b.owner_supplier_id, b.created_at,
      (select full_name from ketzal.customers c where c.id = b.customer_id) as cliente,
      (select name from ketzal.services s where s.id = b.service_id) as servicio
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.kind = 'devengo'
      and b.status in ('reserved', 'confirmed', 'paid')
      and (
        (v_super and cl.payee_type = 'plataforma')
        or (v_sup is not null and cl.payee_type = 'agencia' and cl.payee_supplier_id = v_sup)
      )
  )
  select jsonb_build_object(
    'total_comision', coalesce(sum(amount_mxn), 0),
    'num', count(*),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'id', booking_id,
      'cliente', cliente,
      'servicio', servicio,
      'owner', case
        when payee_type = 'plataforma'
          then coalesce((select name from ketzal.suppliers o where o.id = owner_supplier_id), 'Ketzal (plataforma)')
        else coalesce((select name from ketzal.suppliers o where o.id = owner_supplier_id), '—')
      end,
      'total', total,
      'basis', basis,
      'rate', rate,
      'unit_amount', unit_amount,
      'comision', amount_mxn,
      'status', status,
      'tipo', case
        when payee_type = 'plataforma' and marketplace_customer_id is not null then 'marketplace'
        when payee_type = 'plataforma' then 'libre'
        else 'reventa'
      end
    ) order by created_at desc), '[]'::jsonb)
  ) into v from mine;
  return v;
end $function$;
