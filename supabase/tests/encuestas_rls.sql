-- HARD TESTING — encuestas de investigación de mercado (m002).
--
-- Qué se protege: `poll_votes` guarda el contacto (WhatsApp/correo) de los leads
-- que la agencia compró con Meta Ads. Si otra agencia lo alcanza, se filtra la
-- lista de prospectos entera. Y `submit_poll_vote` es superficie ANÓNIMA: lo
-- puede llamar cualquiera con la anon key, que va embebida en el bundle.
--
-- Cómo correrlo: pegar en el SQL editor de Supabase (o vía apply/execute_sql).
-- Deja 0 filas de basura: la encuesta de prueba se borra al final (cascade).
--
-- Ojo con la trampa del harness: desde el SQL editor eres superusuario y la RLS
-- NI SE EVALÚA. Por eso cada caso hace `set local role` + set_config de los
-- claims: sin eso, todo sale verde sin haber probado nada.

begin;

create temp table qa(caso text, veredicto text);
grant all on qa to authenticated, anon;

do $$
declare
  v_poll uuid := '0000dead-0000-4000-8000-0000000000aa';
  v_wl   uuid := 'e9289a23-c174-45f7-8601-3c86be99fc40';  -- Wanderlust
  v_admin_wl uuid;
  v_admin_otra uuid;
  v_agente_wl uuid;
  n int;
  r jsonb;
begin
  select id into v_admin_wl from ketzal.profiles
   where supplier_id = v_wl and role in ('admin','superadmin') limit 1;
  select id into v_agente_wl from ketzal.profiles
   where supplier_id = v_wl and role = 'user' limit 1;
  select id into v_admin_otra from ketzal.profiles
   where supplier_id is not null and supplier_id <> v_wl and role = 'admin' limit 1;

  if v_admin_wl is null or v_admin_otra is null then
    insert into qa values ('setup', 'SALTADO: faltan cuentas de dos agencias distintas');
    return;
  end if;

  insert into ketzal.polls (id, supplier_id, question, options, month_from, month_to, status, created_by)
  values (v_poll, v_wl, 'QA RLS m002',
          '[{"id":1,"label":"A"},{"id":2,"label":"B"}]'::jsonb,
          '2030-01-01', '2030-06-01', 'open', v_admin_wl);

  -- Un voto anónimo con PII, por el camino real (el RPC).
  set local role anon;
  r := ketzal.submit_poll_vote(v_poll, 1, '2030-03-15', 'hash_qa_rls_m002_0000000000000',
                               'sugerencia de prueba', 'lead@qa.test',
                               '{"ip":"10.0.0.1","utm_source":"meta"}'::jsonb);
  reset role;
  insert into qa values ('anon vota por RPC',
    case when r->>'ok' = 'true' then 'OK: voto creado' else 'FALLA: '||coalesce(r::text,'null') end);

  -- Dedupe: el mismo votante no puede votar dos veces ni pisar su voto.
  set local role anon;
  r := ketzal.submit_poll_vote(v_poll, 2, '2030-05-15', 'hash_qa_rls_m002_0000000000000');
  reset role;
  select count(*) into n from ketzal.poll_votes where poll_id = v_poll;
  insert into qa values ('dedupe por voter_hash',
    case when r->>'ya_votaste' = 'true' and n = 1 then 'OK: 1 voto, no pisado'
         else 'FALLA: filas='||n||' resp='||coalesce(r::text,'null') end);
  select count(*) into n from ketzal.poll_votes where poll_id = v_poll and option_id = 1;
  insert into qa values ('el voto original sobrevive',
    case when n = 1 then 'OK: sigue en la opción 1' else 'FALLA: se pisó' end);

  -- get_public_poll no debe exponer PII.
  set local role anon;
  r := ketzal.get_public_poll(v_poll);
  reset role;
  insert into qa values ('get_public_poll sin PII',
    case when r::text not like '%lead@qa.test%' and r::text not like '%sugerencia de prueba%'
              and r::text not like '%10.0.0.1%'
         then 'OK: solo agregados' else 'HUECO: filtra PII' end);

  -- Encuesta en borrador: no enumerable desde afuera.
  update ketzal.polls set status = 'draft' where id = v_poll;
  set local role anon;
  r := ketzal.get_public_poll(v_poll);
  reset role;
  insert into qa values ('draft invisible al anon',
    case when r is null then 'OK: null' else 'HUECO: la sirvió' end);
  update ketzal.polls set status = 'open' where id = v_poll;

  -- Encuesta cerrada: ya no acepta votos.
  update ketzal.polls set status = 'closed' where id = v_poll;
  set local role anon;
  r := ketzal.submit_poll_vote(v_poll, 1, '2030-03-15', 'hash_qa_rls_m002_otro_votante_1');
  reset role;
  select count(*) into n from ketzal.poll_votes where poll_id = v_poll;
  insert into qa values ('cerrada rechaza votos',
    case when r is null and n = 1 then 'OK: null y 0 filas nuevas'
         else 'HUECO: filas='||n end);
  update ketzal.polls set status = 'open' where id = v_poll;

  -- Otra agencia NO ve la encuesta ni la PII de sus leads.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_otra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from ketzal.polls where id = v_poll;
  insert into qa values ('otra agencia ve la encuesta',
    case when n = 0 then 'OK: 0 filas' else 'HUECO: '||n end);
  select count(*) into n from ketzal.poll_votes where poll_id = v_poll;
  insert into qa values ('otra agencia ve los leads',
    case when n = 0 then 'OK: 0 filas' else 'HUECO: '||n end);
  begin
    insert into ketzal.polls (supplier_id, question, options, month_from, month_to, created_by)
    values (v_wl, 'suplantación', '[]'::jsonb, '2030-01-01', '2030-02-01', v_admin_otra);
    insert into qa values ('otra agencia crea encuesta ajena', 'HUECO: escribió');
  exception when others then
    insert into qa values ('otra agencia crea encuesta ajena', 'OK: '||sqlerrm);
  end;
  reset role;

  -- La agencia dueña SÍ ve lo suyo, PII incluida (si no, la sección no sirve).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_wl, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from ketzal.poll_votes where poll_id = v_poll and contact is not null;
  insert into qa values ('la agencia dueña ve su lead',
    case when n = 1 then 'OK: 1 fila' else 'FALLA: '||n end);
  -- Pero ni ella puede tocar los votos: append-only, RPC-only-write.
  begin
    update ketzal.poll_votes set contact = 'pisado@qa.test' where poll_id = v_poll;
    insert into qa values ('la dueña edita votos', 'HUECO: escribió');
  exception when others then
    insert into qa values ('la dueña edita votos', 'OK: '||sqlerrm);
  end;
  begin
    delete from ketzal.poll_votes where poll_id = v_poll;
    insert into qa values ('la dueña borra votos', 'HUECO: borró');
  exception when others then
    insert into qa values ('la dueña borra votos', 'OK: '||sqlerrm);
  end;
  reset role;

  -- Un agente de la MISMA agencia pero sin rol admin: ni administra ni LEE.
  -- (m003: antes leía los leads por PostgREST aunque el nav sea adminOnly —
  -- lo cazó el harness HTTP, no éste, porque aquí solo suplantábamos admins.)
  if v_agente_wl is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_agente_wl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from ketzal.polls where id = v_poll;
    insert into qa values ('agente no-admin ve la encuesta',
      case when n = 0 then 'OK: 0 filas' else 'HUECO: '||n end);
    select count(*) into n from ketzal.poll_votes where poll_id = v_poll;
    insert into qa values ('agente no-admin ve los leads',
      case when n = 0 then 'OK: 0 filas' else 'HUECO: '||n end);
    begin
      insert into ketzal.polls (supplier_id, question, options, month_from, month_to, created_by)
      values (v_wl, 'agente creando', '[]'::jsonb, '2030-01-01', '2030-02-01', v_agente_wl);
      insert into qa values ('agente no-admin crea encuesta', 'HUECO: escribió');
    exception when others then
      insert into qa values ('agente no-admin crea encuesta', 'OK: '||sqlerrm);
    end;
    reset role;
  end if;

  perform set_config('request.jwt.claims', null, true);
  delete from ketzal.polls where id = v_poll;  -- cascade borra los votos
end $$;

select caso, veredicto from qa;

-- Limpieza verificada: no debe quedar rastro del harness.
select count(*) as filas_basura from ketzal.poll_votes
 where voter_hash like 'hash_qa_rls_m002%';

commit;
