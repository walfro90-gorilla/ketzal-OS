-- 016 — F6 follow-up: divisa original (USD + TC) para documentos públicos.
--
-- Los importes se ALMACENAN en MXN (autoritativos): al vender/cotizar en USD el
-- form convierte con el TC y manda MXN al RPC de venta. El USD original solo se
-- deriva para mostrar. Los RPCs públicos (get_receipt_public, get_quote_by_token,
-- get_statement_by_token) NO exponen `exchange_rate` y re-aplicarlos es riesgoso
-- (F1 ya les agregó llaves; no re-leo su DDL vivo). En su lugar: una función
-- NUEVA e independiente que resuelve la divisa por el MISMO token de cada
-- documento y devuelve datos SOLO si la operación fue en USD.
--
-- LANGUAGE sql (no plpgsql) a propósito: con check_function_bodies (default on)
-- Postgres valida TODAS las referencias de columna al crear la función, así que
-- el propio apply_migration es la verificación (sin necesitar una venta USD real,
-- que aún no existe en prod).
--
-- Anon-safe: expone estrictamente MENOS que los RPCs hermanos (solo divisa+TC,
-- por los mismos tokens públicos que ya revelan montos, cliente y servicio).
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create or replace function ketzal.get_public_doc_currency(p_kind text, p_id uuid)
  returns jsonb
  language sql stable security definer
  set search_path to 'ketzal', 'public'
as $$
  select case
           when b.currency = 'USD' and b.exchange_rate is not null and b.exchange_rate > 0
           then jsonb_build_object('currency', b.currency, 'exchange_rate', b.exchange_rate)
           else null
         end
  from ketzal.bookings b
  where b.id = (
    select case
      when p_kind = 'quote'     then (select bq.id from ketzal.bookings bq where bq.quote_token = p_id)
      when p_kind = 'statement' then (select bs.id from ketzal.bookings bs
                                        where bs.statement_token = p_id and bs.status <> 'draft')
      when p_kind = 'receipt'   then (select r.booking_id from ketzal.receipts r where r.id = p_id)
      else null::uuid
    end
  );
$$;

revoke all on function ketzal.get_public_doc_currency(text, uuid) from public;
grant execute on function ketzal.get_public_doc_currency(text, uuid) to anon, authenticated, service_role;
