-- Cuentas QA para los hard-tests de encuestas (m002/m003).
--
-- Las cuentas `walfre.am+...` originales se borraron en la limpieza para
-- operación real (2026-08-23), así que `encuestas_rls.mjs` y
-- `policy_services_posiciones.mjs` no corrían. Estas las reemplazan para el
-- carril de encuestas.
--
-- CÓMO RECREARLAS (dos pasos, el orden importa):
--
-- 1) Crear los usuarios de Auth por la Admin API — NUNCA por INSERT directo a
--    `auth.users`: una fila creada a mano deja NULL en `confirmation_token` y
--    compañía, y GoTrue los escanea como texto no-nulable ⇒ la Admin API
--    entera responde 500 "Database error finding users". Ya pasó una vez con
--    `qa.ui@ketzal.local` (reparado el 2026-08-29 con coalesce a '').
--
--    node --env-file=.env.local -e '
--      const U=process.env.NEXT_PUBLIC_SUPABASE_URL, SK=process.env.SUPABASE_SERVICE_ROLE_KEY
--      for (const email of ["qa.m002.borderadmin@ketzal.local",
--                           "qa.m002.wlagente@ketzal.local",
--                           "qa.m002.viajero@ketzal.local"]) {
--        const r = await fetch(`${U}/auth/v1/admin/users`, { method:"POST",
--          headers:{apikey:SK,Authorization:`Bearer ${SK}`,"Content-Type":"application/json"},
--          body: JSON.stringify({email, password: process.env.KETZAL_QA_PASS, email_confirm:true}) })
--        console.log(email, (await r.json()).id)
--      }'
--
-- 2) Darles su posición con el SQL de abajo (sustituyendo los UUID que imprimió
--    el paso 1). No hay trigger de signup que cree el profile: se inserta a mano.
--
-- Para borrarlas: primero `delete from ketzal.profiles where email like
-- 'qa.m002.%'`, luego DELETE por la Admin API (`/auth/v1/admin/users/<id>`).

insert into ketzal.profiles (id, email, name, role, supplier_id, type, active) values
  -- Admin de OTRA agencia: el vector de fuga entre tenants.
  ('<uuid-borderadmin>', 'qa.m002.borderadmin@ketzal.local', 'QA Border Admin',
   'admin', 'dd46052b-4278-4661-968e-a7cec7b70f25', 'agente', true),
  -- Agente de la MISMA agencia sin rol admin: cazó la fuga que corrigió m003.
  ('<uuid-wlagente>', 'qa.m002.wlagente@ketzal.local', 'QA WL Agente',
   'user', 'e9289a23-c174-45f7-8601-3c86be99fc40', 'agente', true),
  -- Viajero del marketplace, sin agencia.
  ('<uuid-viajero>', 'qa.m002.viajero@ketzal.local', 'QA Viajero',
   'user', null, 'viajero', true)
on conflict (id) do update set
  role = excluded.role, supplier_id = excluded.supplier_id,
  type = excluded.type, active = excluded.active;
