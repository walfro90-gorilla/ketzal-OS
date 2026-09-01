-- b085 — Bono de $300 al que invita, cuando su invitado logra su PRIMERA venta.
-- Espejo de `b085_bono_por_reclutar_embajador` y `b085b_payables_incluye_el_bono`.
--
-- ── Por qué NO es una fila de dinero ───────────────────────────────────────
--
-- ADR-0005: el dinero se DERIVA. Lo que faltaba no era una tabla, era el
-- VÍNCULO: `profiles` no tenía cómo decir quién reclutó a quién.
--
-- Las tres alternativas se descartaron por razones verificadas contra la BD viva:
--   · fila en `commission_lines` con payee_type='bono' — `tg_ledger_mirror_commission`
--     tiene exactamente 4 ramas en su CASE (el propio código avisa que un tipo
--     nuevo deja v_payee null y revienta el insert), y su contraparte es SIEMPRE
--     `selling_supplier_id`: la agencia dueña del viaje acabaría pagando el
--     reclutamiento de Ketzal, contra la decisión del fundador. Además
--     `booking_id` es NOT NULL y el guard de "las comisiones no exceden la
--     venta" le comería presupuesto a la comisión real del embajador.
--   · tabla nueva — ADR + RLS + RPC + reverso propio para un dato calculable.
--   · fila en `expenses` — ahí es el lado PAGADO; registrarlo es afirmar que ya
--     pagaste, y el saldo saldría −300 falso.
--
-- ── Reglas ────────────────────────────────────────────────────────────────
--
-- $300 MXN UNA vez por recluta, cuando ese recluta tiene su primera venta con
-- comisión neta > 0 sobre un booking confirmed/paid. NO es multinivel: quien
-- invita no gana nada más de las ventas de su invitado — y eso no es copy, es
-- lo que separa un bono de referido de un esquema piramidal.
--
-- Anti-colusión, todo en el WHERE (ajustable sin migrar datos):
--   · el comprador no puede ser el recluta ni el reclutador;
--   · la venta tiene que valer al menos el umbral ($1,000), para que una compra
--     simbólica no dispare el bono.
--
-- Reversibilidad gratis: si la venta gatillo se cancela, b073 mete el reverso,
-- el neto del recluta cae a 0 y EL BONO DESAPARECE SOLO.
--
-- Riesgo vivo: si el bono ya se pagó y luego se cancela la venta, el saldo queda
-- negativo — lo mismo que ya pasa con cualquier comisión reversada después de
-- pagarse. Consistente, no nuevo.
--
-- El resumen del admin (b085b) usa la MISMA función que el portal: si divergen,
-- uno miente y la discusión la pierde quien no tiene el panel. Además lista a
-- quien solo ha ganado bonos (reclutó y su recluta vendió, pero él no vendió):
-- si no, ese saldo sería invisible hasta que alguien lo reclamara.

alter table ketzal.profiles
  add column if not exists recruited_by uuid references ketzal.profiles(id);
comment on column ketzal.profiles.recruited_by is
  'Quién invitó a esta persona a ser embajador. Hecho relacional, no dinero: el bono de b085 se DERIVA de aquí.';
create index if not exists profiles_recruited_by_idx on ketzal.profiles(recruited_by);

create or replace function ketzal.bono_reclutador_monto() returns numeric
  language sql immutable as $function$ select 300::numeric $function$;
create or replace function ketzal.bono_reclutador_venta_minima() returns numeric
  language sql immutable as $function$ select 1000::numeric $function$;

create or replace function ketzal.bonos_reclutador(p_uid uuid) returns numeric
  language sql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce(count(*), 0) * ketzal.bono_reclutador_monto()
  from ketzal.profiles recluta
  where recluta.recruited_by = p_uid
    and exists (
      select 1
      from ketzal.commission_lines cl
      join ketzal.bookings b on b.id = cl.booking_id
      where cl.payee_type = 'embajador'
        and cl.payee_profile_id = recluta.id
        and b.status in ('confirmed', 'paid')
        and b.total >= ketzal.bono_reclutador_venta_minima()
        and coalesce(b.marketplace_customer_id, '00000000-0000-0000-0000-000000000000')
            not in (recluta.id, p_uid)
      group by cl.booking_id
      having sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end) > 0
    );
$function$;

revoke all on function ketzal.bonos_reclutador(uuid) from public, anon;
grant execute on function ketzal.bonos_reclutador(uuid) to authenticated, service_role;

-- `my_ambassador_earnings` y `ambassador_payables_summary` se re-aplican
-- sumando el bono y devolviendo su desglose (`comisiones`, `bonos`,
-- `num_reclutas`). Ver la migración aplicada para el cuerpo completo.
