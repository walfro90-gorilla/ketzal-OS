-- HARD TESTING — superficie del Storage y de los folios (b088, ADR-0036).
--
-- Qué se protege: el barrido del 2026-09-02 encontró el bucket `ketzal-assets`
-- público y plano, con policies que scopeaban SOLO por `bucket_id`. Resultado
-- medido, no teórico: los comprobantes de transferencia SPEI de clientes reales
-- (nombre del titular, banco, monto) se listaban con la publishable key y se
-- descargaban sin sesión — 200, 137237 bytes. Y cualquier autenticado, incluido
-- un viajero de registro abierto, podía SOBREESCRIBIR cualquier objeto: el
-- comprobante de una venta ajena, el logo, las fotos del catálogo.
--
-- El mismo barrido encontró `next_doc_folio`/`next_receipt_folio` DEFINER sin un
-- solo guard y con `p_supplier` libre — y los supplier_id son públicos vía
-- `services`. Cualquiera podía quemar en bucle la serie de folios de una agencia
-- (ADR-0007).
--
-- b090 — el barrido de re-verificación encontró que b088 dejó DOS ramas del
-- CASE sin scopear: `suppliers/` y `brand/` sólo pedían "tener agencia". Medido
-- en la BD real: un agente de Wanderlust sobrescribía el logo vivo de la
-- plataforma y la foto viva de Border — 1 fila cada uno. La sección 6 lo fija.
--
-- Trampa del harness: desde el SQL editor eres superusuario y la RLS NI SE
-- EVALÚA. Cada caso hace `set local role` + claims; sin eso todo sale verde sin
-- haber probado nada.

create temp table qa(caso text, veredicto text);
grant all on qa to authenticated, anon;

do $$
declare
  v_intruso uuid := '00000000-0000-4000-8000-0000b0880001';  -- cuenta cualquiera
  v_supplier uuid;
  v_service uuid;
  v_agente uuid;
  v_no_admin uuid;
  v_admin uuid;
  v_admin_sup uuid;
  v_otra uuid;
  v_prov uuid;
  n int;
  v_ok boolean;
begin
  select s.supplier_id, s.id into v_supplier, v_service
    from ketzal.services s where s.supplier_id is not null limit 1;
  select p.id into v_agente from ketzal.profiles p
   where p.supplier_id = v_supplier and coalesce(p.type,'agente') = 'agente' limit 1;

  -- Para la sección 6 el admin puede ser de CUALQUIER agencia: lo que se prueba
  -- es la relación carpeta↔escritor, no una agencia concreta. Buscarlos sueltos
  -- evita que el harness se salte los casos por qué agencia tocó en v_supplier.
  select p.id, p.supplier_id into v_admin, v_admin_sup
    from ketzal.profiles p
   where p.supplier_id is not null and p.role = 'admin' and p.active limit 1;

  -- Fixtures propias (el corredor revierte la transacción — ADR-0035): así el
  -- caso de "agencia ajena" y el de "proveedor mío" no dependen de que la BD
  -- real tenga dos agencias ni proveedores dados de alta.
  insert into ketzal.suppliers (id, name, contact_email, supplier_type)
       values (gen_random_uuid(), 'QA b090 agencia ajena', 'qa-b090-ajena@ketzal.test', 'agency')
    returning id into v_otra;
  insert into ketzal.suppliers (id, name, contact_email, supplier_type, owner_supplier_id)
       values (gen_random_uuid(), 'QA b090 proveedor propio', 'qa-b090-prov@ketzal.test', 'hotel',
               coalesce(v_admin_sup, v_supplier))
    returning id into v_prov;

  if v_supplier is null then
    insert into qa values ('setup', 'SALTADO: no hay servicios con agencia');
    return;
  end if;

  -- ── 1. Nada de comprobantes en el bucket público ────────────────────────
  select count(*) into n from storage.objects
   where bucket_id = 'ketzal-assets' and (storage.foldername(name))[1] = 'spei';
  insert into qa values ('bucket público sin comprobantes',
    case when n = 0 then 'OK: 0 objetos' else 'HUECO: '||n||' comprobantes públicos' end);

  -- ── 2. El bucket privado es privado y no tiene lectura ──────────────────
  select public into v_ok from storage.buckets where id = 'ketzal-privado';
  insert into qa values ('ketzal-privado.public = false',
    case when v_ok is false then 'OK' else 'HUECO: '||coalesce(v_ok::text,'no existe') end);

  select count(*) into n from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polcmd in ('r','*')
     and pg_get_expr(p.polqual, p.polrelid) like '%ketzal-privado%';
  insert into qa values ('ketzal-privado sin policy de SELECT',
    case when n = 0 then 'OK: se lee sólo firmado' else 'HUECO: '||n||' policy(s)' end);

  -- ── 3. Un intruso autenticado no escribe donde no le toca ───────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_intruso, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('ketzal-assets', 'spei/'||gen_random_uuid()||'/robado.jpg', v_intruso);
    insert into qa values ('intruso sube a spei/ del bucket público', 'HUECO: escribió');
  exception when others then
    insert into qa values ('intruso sube a spei/ del bucket público', 'OK: '||left(sqlerrm,60));
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('ketzal-assets', 'services/'||v_service||'/foto-intrusa.jpg', v_intruso);
    insert into qa values ('intruso sube foto a un servicio ajeno', 'HUECO: escribió');
  exception when others then
    insert into qa values ('intruso sube foto a un servicio ajeno', 'OK: '||left(sqlerrm,60));
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('ketzal-assets', 'profiles/'||gen_random_uuid()||'/foto.jpg', v_intruso);
    insert into qa values ('intruso sube foto al perfil de otro', 'HUECO: escribió');
  exception when others then
    insert into qa values ('intruso sube foto al perfil de otro', 'OK: '||left(sqlerrm,60));
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('ketzal-privado', 'spei/'||gen_random_uuid()||'/comprobante.jpg', v_intruso);
    insert into qa values ('intruso sube comprobante a pedido ajeno', 'HUECO: escribió');
  exception when others then
    insert into qa values ('intruso sube comprobante a pedido ajeno', 'OK: '||left(sqlerrm,60));
  end;

  -- Sobreescribir es el vector caro: borra la evidencia de un pago.
  update storage.objects set name = name
   where bucket_id = 'ketzal-assets' and (storage.foldername(name))[1] = 'services';
  get diagnostics n = row_count;
  insert into qa values ('intruso sobreescribe el catálogo',
    case when n = 0 then 'OK: 0 filas' else 'HUECO: tocó '||n end);

  -- ── 4. Folios: el contador es de la agencia ─────────────────────────────
  insert into qa values ('intruso puede_folear(agencia ajena)',
    case when ketzal.puede_folear(v_supplier) then 'HUECO: true' else 'OK: false' end);

  begin
    perform ketzal.next_doc_folio(v_supplier, 'QA');
    insert into qa values ('intruso quema un folio ajeno', 'HUECO: lo consumió');
  exception when others then
    insert into qa values ('intruso quema un folio ajeno', 'OK: '||left(sqlerrm,60));
  end;

  begin
    perform ketzal.next_receipt_folio(v_supplier);
    insert into qa values ('intruso quema un folio de recibo ajeno', 'HUECO: lo consumió');
  exception when others then
    insert into qa values ('intruso quema un folio de recibo ajeno', 'OK: '||left(sqlerrm,60));
  end;

  insert into qa values ('intruso puedo_subir_comprobante(pedido ajeno)',
    case when ketzal.puedo_subir_comprobante(gen_random_uuid()) then 'HUECO: true'
         else 'OK: false' end);

  reset role;

  -- ── 5. Lo que SÍ tiene que seguir funcionando ───────────────────────────
  -- Apretar policies rompe callado: el agente de la agencia dueña conserva su
  -- catálogo y su folio, o el fix es un bug con otro nombre.
  if v_agente is null then
    insert into qa values ('agente dueño sigue operando', 'SALTADO: la agencia no tiene agente');
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_agente, 'role', 'authenticated')::text, true);
    set local role authenticated;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'services/'||v_service||'/foto-qa-b088.jpg', v_agente);
      insert into qa values ('agente dueño sube foto a SU servicio', 'OK: escribió');
    exception when others then
      insert into qa values ('agente dueño sube foto a SU servicio', 'ROTO: '||left(sqlerrm,200));
    end;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'profiles/'||v_agente||'/foto-qa-b088.jpg', v_agente);
      insert into qa values ('agente sube SU propia foto', 'OK: escribió');
    exception when others then
      insert into qa values ('agente sube SU propia foto', 'ROTO: '||left(sqlerrm,60));
    end;

    begin
      perform ketzal.next_doc_folio(v_supplier, 'QA_B087');
      insert into qa values ('agente dueño saca folio de SU agencia', 'OK: lo sacó');
    exception when others then
      insert into qa values ('agente dueño saca folio de SU agencia', 'ROTO: '||left(sqlerrm,60));
    end;

    reset role;
  end if;

  -- ── 6. b090: la carpeta manda, no el solo hecho de tener agencia ────────
  -- El hueco de b088: `suppliers/` y `brand/` pasaban con `my_supplier_id() is
  -- not null`. La regla ahora es la misma que gobierna la FILA del supplier
  -- (`suppliers_update` → is_agency_admin), y `brand/` es sólo del superadmin.
  select p.id into v_no_admin from ketzal.profiles p
   where p.supplier_id is not null and p.role is distinct from 'admin' and p.active limit 1;
  if v_no_admin is null then
    -- Un caso que no corre es rojo, no un pase silencioso (ADR-0034).
    insert into qa values ('b090 agente no-admin', 'ROTO: no hay agente no-admin con agencia para probar');
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_no_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'brand/logo-suplantado.png', v_no_admin);
      insert into qa values ('agente no-admin sube a brand/', 'HUECO: escribió');
    exception when others then
      insert into qa values ('agente no-admin sube a brand/', 'OK: '||left(sqlerrm,60));
    end;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'suppliers/'||v_otra||'/logo-suplantado.png', v_no_admin);
      insert into qa values ('agente no-admin sube a suppliers/ ajeno', 'HUECO: escribió');
    exception when others then
      insert into qa values ('agente no-admin sube a suppliers/ ajeno', 'OK: '||left(sqlerrm,60));
    end;

    -- Sobreescribir el objeto VIVO es el vector real: la URL del logo la publica
    -- `get_brand_logo()` a cualquier anónimo, así que el nombre no se adivina.
    update storage.objects set metadata = coalesce(metadata,'{}'::jsonb)
     where bucket_id = 'ketzal-assets' and (storage.foldername(name))[1] in ('brand','suppliers');
    get diagnostics n = row_count;
    insert into qa values ('agente no-admin sobreescribe brand/ y suppliers/',
      case when n = 0 then 'OK: 0 filas' else 'HUECO: tocó '||n end);

    reset role;
  end if;

  if v_admin is null then
    insert into qa values ('b090 admin de agencia', 'ROTO: no hay admin de agencia para probar');
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'suppliers/'||v_admin_sup||'/logo-qa-b090.png', v_admin);
      insert into qa values ('admin sube a suppliers/ de SU agencia', 'OK: escribió');
    exception when others then
      insert into qa values ('admin sube a suppliers/ de SU agencia', 'ROTO: '||left(sqlerrm,200));
    end;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'suppliers/'||v_prov||'/logo-qa-b090.png', v_admin);
      insert into qa values ('admin sube a suppliers/ de SU proveedor', 'OK: escribió');
    exception when others then
      insert into qa values ('admin sube a suppliers/ de SU proveedor', 'ROTO: '||left(sqlerrm,200));
    end;

    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'suppliers/'||v_otra||'/logo-qa-b090.png', v_admin);
      insert into qa values ('admin sube a suppliers/ de OTRA agencia', 'HUECO: escribió');
    exception when others then
      insert into qa values ('admin sube a suppliers/ de OTRA agencia', 'OK: '||left(sqlerrm,60));
    end;

    -- Una carpeta que no es uuid no debe REVENTAR la policy (un cast crudo la
    -- tumbaría entera y con ella toda escritura al bucket).
    begin
      insert into storage.objects (bucket_id, name, owner)
      values ('ketzal-assets', 'suppliers/no-es-uuid/logo.png', v_admin);
      insert into qa values ('carpeta suppliers/ con nombre basura', 'HUECO: escribió');
    exception when others then
      insert into qa values ('carpeta suppliers/ con nombre basura',
        case when sqlerrm like '%row-level security%' then 'OK: negada sin reventar'
             else 'ROTO: '||left(sqlerrm,80) end);
    end;

    reset role;
  end if;

  perform set_config('request.jwt.claims', null, true);
end $$;

select caso, veredicto from qa order by caso;

-- El corredor sólo ve el mensaje de la excepción, así que los casos malos van
-- en el mensaje: un '3 fallaron' pelón obliga a re-correr a mano para saber cuál.
do $$
declare n int; detalle text;
begin
  select count(*), coalesce(string_agg(caso||' → '||veredicto, ' | '), '')
    into n, detalle
    from qa where veredicto like 'HUECO%' or veredicto like 'ROTO%';
  raise exception '% fallaron (de % casos)%', n, (select count(*) from qa),
    case when n = 0 then '' else ': '||detalle end;
end $$;
