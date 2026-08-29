-- m003 · Encuestas: la lectura también es solo del admin de agencia
--
-- Por qué existe (hallazgo del hard-test HTTP de m002):
-- `/investigacion` nace `adminOnly` — está en `ADMIN_HREFS` y el proxy manda a
-- `/` a quien no sea admin. Pero las policies de m002 daban SELECT a cualquier
-- miembro de la agencia (`supplier_id = my_supplier_id()`), así que un agente
-- sin rol admin no podía entrar por la UI pero SÍ leía las encuestas y —lo
-- grave— el `contact` de los leads con su propio JWT contra PostgREST.
--
-- Es la familia de bug que ya pegó antes en este repo: la protección vivía en
-- el nav, no en la base. Si la sección es de admin, la RLS tiene que decirlo;
-- si no, `adminOnly` es cosmético.
--
-- Detectado por `supabase/tests/encuestas_rls.mjs` (JWT real por HTTP). El
-- harness SQL equivalente no lo vio porque suplantaba admins.

-- polls: leer una encuesta = administrarla. Antes: cualquier miembro.
drop policy if exists polls_scoped_sel on ketzal.polls;
create policy polls_scoped_sel on ketzal.polls for select to authenticated
  using (
    ketzal.is_superadmin()
    or (supplier_id is not null and coalesce(ketzal.is_agency_admin(supplier_id), false))
  );

-- poll_votes: el contacto del lead es PII de un tercero que confió en la
-- promesa "te avisamos si se arma". Solo el admin de la agencia dueña.
drop policy if exists poll_votes_owner_sel on ketzal.poll_votes;
create policy poll_votes_owner_sel on ketzal.poll_votes for select to authenticated
  using (
    ketzal.is_superadmin()
    or exists (
      select 1 from ketzal.polls p
       where p.id = poll_id
         and p.supplier_id is not null
         and coalesce(ketzal.is_agency_admin(p.supplier_id), false)
    )
  );
