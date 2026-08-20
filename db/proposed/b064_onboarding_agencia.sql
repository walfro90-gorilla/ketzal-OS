-- b064 — checklist de arranque para el admin de una agencia recién creada.
-- Migración aplicada: `b064_onboarding_agencia` (2026-08-19).
--
-- EL PROBLEMA: el superadmin da de alta la agencia + su admin en un paso
-- (`crearAgenciaEInvitarAdmin`), y ese admin entra a un OS vacío. El tour
-- (`src/components/shell/tour/`) le explica QUÉ es cada sección, pero no QUÉ LE
-- FALTA a él: aterriza en un Panel de ceros con EmptyStates correctos pero
-- pasivos ("Nada por cobrar", "Sin viajes próximos"). Nadie le dice que para
-- vender necesita cargar su catálogo primero.
--
-- DERIVADO, NO PERSISTIDO: mismo criterio que el saldo (regla de oro #2). No hay
-- tabla de progreso ni flags de "paso completado" — cada paso se calcula en vivo
-- contra los datos reales. Si el admin borra su único servicio, el paso vuelve a
-- aparecer, que es lo correcto. Un flag guardado mentiría.
--
-- ALCANCE: sólo el admin de una agencia. El superadmin no tiene agencia propia y
-- un agente raso no configura la agencia ⇒ devuelve null y la tarjeta ni se
-- pinta. Verificado por las 7 posiciones: sólo los 2 admins reciben datos.
--
-- SUGERIDO, NO BLOQUEANTE (decisión del fundador): es una tarjeta más del Panel,
-- arriba de "Requiere atención". Bloquear el OS hasta completarla sería hostil,
-- sobre todo porque dos pasos (CLABE, Mercado Pago) dependen de trámites
-- externos que no se resuelven en el momento.
--
-- `pendientes` viene calculado aquí para que la UI no tenga que contar: la
-- tarjeta se muestra si `pendientes > 0` y desaparece sola al completarse todo.
--
-- ══ VERIFICADO EN VIVO ══
-- Por posición (SQL): superadmin/agente libre/embajador/proveedor/viajero → null;
-- Border Travels 4/8 pendientes; Wanderlust 3/8 (equipo, clabe, venta).
-- Visualmente (dev server + login real como admin de agencia): la tarjeta pinta
-- progreso "6 de 8", los pendientes arriba con su botón y los hechos abajo
-- tachados con palomita. Al promover una cuenta a la agencia, el paso "Invita a
-- tus agentes" pasó a hecho solo — la derivación en vivo funcionando.

create or replace function ketzal.onboarding_agencia()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sup uuid := ketzal.my_supplier_id();
  v_admin boolean;
  s record;
  v_pasos jsonb;
  v_pend int;
begin
  if v_uid is null then return null; end if;
  if v_sup is null then return null; end if;   -- superadmin / agente libre
  v_admin := exists (select 1 from ketzal.profiles p
                      where p.id = v_uid and p.role in ('admin','superadmin') and p.active);
  if not v_admin then return null; end if;      -- el agente raso no configura la agencia

  select
    sup.name,
    -- Perfil: logo y un medio de contacto. Es lo que ve el viajero en la vitrina.
    (sup.img_logo is not null and coalesce(sup.phone_number, sup.contact_email) is not null) as perfil,
    (nullif(trim(coalesce(sup.info->>'clabe','')), '') is not null) as clabe,
    (select count(*) from ketzal.services sv where sv.supplier_id = v_sup) as n_serv,
    (select count(*) from ketzal.services sv
      where sv.supplier_id = v_sup and sv.published) as n_pub,
    (select count(*) from ketzal.service_departures sd
       join ketzal.services sv on sv.id = sd.service_id
      where sv.supplier_id = v_sup) as n_salidas,
    (select count(*) from ketzal.profiles p
      where p.supplier_id = v_sup and coalesce(p.type,'agente') = 'agente') as n_equipo,
    (select count(*) from ketzal.mp_accounts m where m.supplier_id = v_sup) as n_mp,
    (select count(*) from ketzal.bookings b where b.selling_supplier_id = v_sup) as n_ventas
  into s
  from ketzal.suppliers sup where sup.id = v_sup;

  if s is null then return null; end if;

  v_pasos := jsonb_build_array(
    jsonb_build_object('id','perfil', 'hecho', s.perfil,
      'titulo','Completa el perfil de tu agencia',
      'detalle','Logo y un teléfono o correo de contacto: es lo que ve el viajero en tu ficha pública.',
      'href','/proveedores', 'cta','Editar perfil'),
    jsonb_build_object('id','servicio', 'hecho', s.n_serv > 0,
      'titulo','Carga tu primer viaje',
      'detalle','Sin catálogo no hay nada que vender. Puedes capturarlo a mano o importarlo desde una imagen.',
      'href','/servicios/nuevo', 'cta','Crear viaje'),
    jsonb_build_object('id','salidas', 'hecho', s.n_salidas > 0,
      'titulo','Agrega fechas de salida',
      'detalle','Las salidas son las que controlan el cupo y arman el manifiesto del camión.',
      'href','/servicios', 'cta','Ver catálogo'),
    jsonb_build_object('id','publicar', 'hecho', s.n_pub > 0,
      'titulo','Publica un viaje en el catálogo',
      'detalle','Publicar lo hace visible en Ketzal para cualquier visitante, y revendible por otras agencias.',
      'href','/servicios', 'cta','Publicar'),
    jsonb_build_object('id','equipo', 'hecho', s.n_equipo > 1,
      'titulo','Invita a tus agentes',
      'detalle','Cada agente vende con su propia cuenta; sus ventas y comisiones quedan a su nombre.',
      'href','/equipo', 'cta','Invitar'),
    jsonb_build_object('id','clabe', 'hecho', s.clabe,
      'titulo','Pon tu CLABE para cobrar por transferencia',
      'detalle','El viajero transfiere directo a tu cuenta y tú apruebas el comprobante desde Cobranza.',
      'href','/proveedores', 'cta','Configurar'),
    jsonb_build_object('id','mercadopago', 'hecho', s.n_mp > 0,
      'titulo','Conecta tu Mercado Pago (opcional)',
      'detalle','Con tu cuenta conectada el dinero del cobro en línea te llega directo, sin pasar por Ketzal.',
      'href','/proveedores', 'cta','Conectar'),
    jsonb_build_object('id','venta', 'hecho', s.n_ventas > 0,
      'titulo','Registra tu primera venta',
      'detalle','Cierra una venta, registra el abono y emite el recibo: es el flujo completo del día a día.',
      'href','/ventas/nueva', 'cta','Nueva venta')
  );

  select count(*) into v_pend
    from jsonb_array_elements(v_pasos) p where (p->>'hecho')::boolean is not true;

  return jsonb_build_object(
    'agencia', s.name,
    'total', jsonb_array_length(v_pasos),
    'pendientes', v_pend,
    'pasos', v_pasos);
end $$;

revoke all on function ketzal.onboarding_agencia() from public, anon;
grant execute on function ketzal.onboarding_agencia() to authenticated, service_role;

-- APP (mismo carril): `src/app/(ops)/dashboard/checklist-arranque.tsx` pinta la
-- tarjeta y `dashboard/page.tsx` la trae en el `Promise.all` que ya existía y la
-- renderiza arriba de "Requiere atención", sólo si `pendientes > 0`.
