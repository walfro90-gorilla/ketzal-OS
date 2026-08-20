-- b060 — `my_supplier_id()` pasa a significar "la agencia de la que soy STAFF".
-- Migración aplicada: `b060_my_supplier_id_solo_staff` (2026-08-19).
--
-- ══ EL HUECO ══
-- Encontrado probando la policy de b059 desde cada posición, con cuentas reales.
-- Una cuenta de PROVEEDOR lleva `supplier_id` de la agencia (así se le da acceso
-- a su portal), y `my_supplier_id()` lo devolvía sin mirar el `type`. Como 39
-- policies —20 de escritura y 19 de lectura, en 12 tablas— se acotan con ese
-- helper, un proveedor las satisfacía TODAS.
--
-- Comprobado en vivo, no en teoría: la cuenta de proveedor cambió por PostgREST
-- el precio de un servicio de Wanderlust de $1,800 a $1. (Restaurado de inmediato.)
--
-- Su portal es read-only sólo en la UI. Un proveedor es un TERCERO — un hotel,
-- una línea de transporte — al que se le da login. Podía editar ventas, clientes,
-- pagos, recibos, la ficha de la agencia y crear proveedores hijos.
-- Familia #1 del repo otra vez, pero por el eje `type` en vez del eje columna:
-- la policy miraba QUÉ agencia, no QUIÉN eres dentro de ella.
--
-- ══ EL ARREGLO: un helper en vez de 39 policies ══
-- `my_supplier_id()` devuelve la agencia sólo si el perfil es staff. Con eso las
-- 39 se corrigen a la vez y cualquier policy futura nace bien — arreglar 39
-- policies a mano habría dejado alguna fuera, y la siguiente habría vuelto a
-- nacer con el hueco.
--
-- `coalesce(type,'agente')` para no dejar fuera filas legadas sin `type`
-- (anteriores a b024), que sí son staff.
--
-- `my_provider_services` era el ÚNICO de los 38 consumidores que dependía del
-- comportamiento viejo (los otros 37 son operaciones de staff: ventas, cobranza,
-- comisiones, reportes, salidas). Se re-aplica leyendo `profiles.supplier_id`
-- directo — puede, es SECURITY DEFINER — así el portal del proveedor sigue
-- viendo lo suyo.
--
-- Ni el portal del proveedor ni el del embajador leen nada más por RLS: cada uno
-- usa un solo RPC DEFINER (`my_provider_services` / `my_ambassador_earnings`),
-- así que recortarles el alcance no les quita nada que usen.
--
-- ══ HARD-TEST ══
-- 1) El ataque que SÍ funcionaba, repetido tras el fix (HTTP, JWT real):
--      PATCH precio de servicio de su agencia .... [] (0 filas)
--      PATCH ficha de la agencia ................ [] (0 filas)
--      leer ventas / clientes ................... [] / []
--      su portal (`my_provider_services`) ....... sigue devolviendo su servicio
--      precio real .............................. $1,800 intacto
--
-- 2) Matriz de las 7 posiciones (SQL, suplantando JWT + `set role authenticated`,
--    sin lo cual la RLS no aplica y la prueba saldría verde sin probar nada):
--      superadmin        my_supplier_id=null  srv=13
--      admin Border      my_supplier_id=sí    srv=13  escribe_servicios=t  ✓ opera
--      admin Wanderlust  my_supplier_id=sí    srv=2   escribe_servicios=t  ✓ opera
--      agente libre      my_supplier_id=null  srv=13
--      PROVEEDOR         my_supplier_id=null  srv=2   escribe_servicios=f  ✓ cerrado
--      embajador         my_supplier_id=null  srv=2
--      viajero           my_supplier_id=null  srv=2
--
-- 3) Con DATOS (rollback): 1 venta + 1 cliente + 1 abono de Wanderlust ⇒
--      admin Wanderlust -> ventas=1 clientes=1 abonos=1   ✓ sigue viendo lo suyo
--      PROVEEDOR mismo  -> ventas=0 clientes=0 abonos=0   ✓ no ve nada
--    (sin datos, "ve 0" no probaba nada: la BD estaba vacía.)
--
-- `verificar_invariantes` 0, advisors 0 ERROR.

create or replace function ketzal.my_supplier_id()
returns uuid
language sql
stable
security definer
as $$
  select supplier_id from ketzal.profiles
   where id = auth.uid()
     and coalesce(type, 'agente') = 'agente';
$$;

create or replace function ketzal.my_provider_services()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  -- b060: lectura directa. `my_supplier_id()` ya sólo responde para staff de
  -- agencia, y un proveedor no lo es.
  v_sup uuid := (select supplier_id from ketzal.profiles where id = auth.uid());
  v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() <> 'proveedor' then raise exception 'Solo para proveedores'; end if;
  if v_sup is null then
    return jsonb_build_object('supplier', null, 'servicios', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'supplier', (select name from ketzal.suppliers s where s.id = v_sup),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'service_type', s.service_type,
        'city_to', s.city_to,
        'state_to', s.state_to,
        'published', s.published,
        'rol', case
          when s.supplier_id = v_sup then 'Dueño'
          when s.transport_provider_id = v_sup then 'Transporte'
          when s.hotel_provider_id = v_sup then 'Hospedaje'
          else '—' end)
        order by s.name)
      from ketzal.services s
      where s.supplier_id = v_sup
         or s.transport_provider_id = v_sup
         or s.hotel_provider_id = v_sup
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;
