-- QA — semilla de inquilinos de prueba (idempotente).
--
-- Dos agencias, no una: el riesgo #1 del proyecto es fuga entre inquilinos y
-- para probarla hace falta un lado B. Todo el hard testing cuelga de estas dos,
-- así que las agencias reales (Wanderlust, Border) nacen con números limpios.
--
-- Nada de esto se borra nunca (regla del fundador 2026-07-19: huella histórica
-- inborrable). La separación por supplier_id ES el marcador; el borrado no es
-- una opción — y desde `002_ledger_inmutable.sql` tampoco es posible.
--
-- Correr con: psql "$DATABASE_URL" -f supabase/tests/qa_setup.sql
-- o vía el SQL editor / apply_migration. Re-correrlo es seguro.

-- UUIDs fijos a propósito: el harness los referencia por literal y así una
-- segunda corrida reutiliza los mismos inquilinos en vez de multiplicarlos.
--   Alfa  agencia 0…a001   agente 0…a002
--   Beta  agencia 0…b001   agente 0…b002

insert into ketzal.suppliers (id, name, supplier_type, contact_email)
values ('00000000-0000-4000-8000-00000000a001', 'QA Agencia Alfa', 'agency', 'qa-alfa@ketzal.test'),
       ('00000000-0000-4000-8000-00000000b001', 'QA Agencia Beta', 'agency', 'qa-beta@ketzal.test')
on conflict (id) do nothing;

-- Usuarios de auth reales: sin ellos no se puede probar RLS de verdad, porque
-- `auth.uid()` y las policies leen del JWT. Nunca inician sesión por contraseña
-- (el hash es un literal inválido a propósito); el harness los suplanta con
-- `set local request.jwt.claims`.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-alfa@ketzal.test', 'no-login',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-beta@ketzal.test', 'no-login',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- `active = true` a mano: los usuarios nuevos nacen pendientes de aprobación y
-- todos los RPCs de dinero cortan con `is_active()`. Sin esto el harness sólo
-- probaría esa guarda, una vez, y nada más.
insert into ketzal.profiles (id, email, role, supplier_id, active)
values
  ('00000000-0000-4000-8000-00000000a002', 'qa-alfa@ketzal.test', 'user',
   '00000000-0000-4000-8000-00000000a001', true),
  ('00000000-0000-4000-8000-00000000b002', 'qa-beta@ketzal.test', 'user',
   '00000000-0000-4000-8000-00000000b001', true)
on conflict (id) do update
  set supplier_id = excluded.supplier_id, active = true;

-- Un servicio por agencia. El de Alfa lleva salidas con cupo (para forzar
-- sobreventa); el de Beta no declara salidas a propósito, porque el trigger
-- `tg_booking_capacity` sólo aplica cupo cuando existen salidas — y esa rama
-- "sin límite" también hay que ejercitarla.
insert into ketzal.services (id, supplier_id, name, price, max_capacity, published)
values
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000a001',
   'QA Tour Alfa (con cupo)', 1000, 10, false),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b001',
   'QA Tour Beta (sin salidas)', 1000, null, false)
on conflict (id) do nothing;

-- Cupo deliberadamente chico (5): es el número que hace que la carrera de
-- sobreventa sea observable sin generar cientos de filas.
insert into ketzal.service_departures (id, service_id, departs_on, max_capacity, seats_taken)
values ('00000000-0000-4000-8000-00000000a004',
        '00000000-0000-4000-8000-00000000a003', current_date + 30, 5, 0)
on conflict (id) do nothing;

select 'setup QA listo' as estado,
       (select count(*) from ketzal.suppliers where name like 'QA %') as agencias,
       (select count(*) from ketzal.profiles where email like 'qa-%@ketzal.test') as agentes,
       (select count(*) from ketzal.services where name like 'QA %') as servicios,
       (select count(*) from ketzal.service_departures
         where service_id = '00000000-0000-4000-8000-00000000a003') as salidas;
