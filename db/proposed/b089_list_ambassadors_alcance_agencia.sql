-- b089 — `list_ambassadors` deja de ser exclusiva del superadmin.
--
-- Bug: la función abría con `if not ketzal.is_superadmin() then return '[]' end`,
-- así que un **admin de agencia** recibía una lista VACÍA, sin error. Efectos
-- medidos en los tres llamadores:
--   · /comisiones  → "Accesos" no listaba a nadie: el admin no podía reemitir la
--                    contraseña de SUS PROPIOS embajadores (m005 dice justo lo
--                    contrario: quien recluta también entrega el acceso).
--   · /gastos/nuevo → el selector de embajador salía vacío ⇒ no había forma de
--                    registrar a mano el pago de una comisión.
--   · /dashboard    → sin efecto: esa llamada ya está dentro de un bloque
--                    `if (esSuperadmin)`.
--
-- Alcance nuevo (mismo criterio de tenencia que `corte_embajadores`, ADR-0004):
--   · superadmin        → todos los embajadores.
--   · admin de agencia  → los SUYOS (`profiles.supplier_id` = su agencia)
--                         MÁS los que ya le trajeron una venta a su agencia
--                         (`bookings.ambassador_id` con `selling_supplier_id`
--                         suyo). El segundo conjunto NO es hipotético: con el
--                         modelo sin límite (ADR-0021) un embajador de otra
--                         agencia —o directo de Ketzal— puede vender su viaje,
--                         y entonces su agencia le debe dinero y necesita
--                         poder nombrarlo al registrar el gasto.
--   · cualquier otro    → '[]' (contrato silencioso original, intacto: los tres
--                         llamadores lo tratan como lista vacía, no como error).
--
-- Se agrega `supplier_id` al objeto devuelto para que la UI distinga "mío" de
-- "me vendió": el guard de `regenerarAccesoEmbajador` exige que el embajador sea
-- de la agencia del admin, así que ofrecerle reemitir el acceso de uno ajeno
-- sería un botón que siempre falla.

create or replace function ketzal.list_ambassadors()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb; v_sup uuid;
begin
  -- Cuenta pendiente de aprobación: lista vacía, no error (ver contrato arriba).
  if not ketzal.is_active() then return '[]'::jsonb; end if;

  if ketzal.is_superadmin() then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'referral_code', referral_code,
      'supplier_id', supplier_id) order by name), '[]'::jsonb)
      into v
      from ketzal.profiles
     where type = 'embajador';
    return v;
  end if;

  v_sup := ketzal.my_supplier_id();
  if v_sup is null or not coalesce(ketzal.is_agency_admin(v_sup), false) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'referral_code', p.referral_code,
    'supplier_id', p.supplier_id) order by p.name), '[]'::jsonb)
    into v
    from ketzal.profiles p
   where p.type = 'embajador'
     and (
       p.supplier_id = v_sup
       or exists (
         -- Mismo filtro de estado que `corte_embajadores`: una cotización
         -- abandonada con `?ref` no convierte a nadie en beneficiario.
         select 1 from ketzal.bookings b
          where b.ambassador_id = p.id
            and b.selling_supplier_id = v_sup
            and b.status in ('reserved','confirmed','paid')
       )
     );
  return v;
end $function$;

revoke all on function ketzal.list_ambassadors() from public, anon;
grant execute on function ketzal.list_ambassadors() to authenticated, service_role;
