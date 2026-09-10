-- HARD TESTING — dos agencias pueden dar de alta al MISMO proveedor (b111).
--
--   pnpm hard-test proveedor_por_agencia
--
-- Qué defiende: `suppliers` guarda agencias y proveedores en la misma tabla, y
-- traía `UNIQUE (name)` / `UNIQUE (contact_email)` GLOBALES. Con eso, en cuanto
-- Wanderlust daba de alta "Rancho San Lorenzo", Border Travels ya no podía: el
-- insert reventaba con 23505 y el mensaje al usuario era genérico. b111 lo
-- parte en índices parciales:
--   · agencia (owner_supplier_id null) → nombre y correo únicos de plataforma;
--   · proveedor → nombre y correo únicos DENTRO de su agencia dueña;
--   · y la unicidad es insensible a mayúsculas.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  agA   uuid := '0000b111-0000-4000-8000-00000000a001';
  agB   uuid := '0000b111-0000-4000-8000-00000000a002';
  pA    uuid := '0000b111-0000-4000-8000-00000000c001';
  pB    uuid := '0000b111-0000-4000-8000-00000000c002';
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (agA,'QA b111 Agencia Una','qa.b111.a@ketzal.local','agency'),
    (agB,'QA b111 Agencia Dos','qa.b111.b@ketzal.local','agency');

  -- 1 · La agencia A da de alta su proveedor.
  begin
    insert into ketzal.suppliers(id,name,contact_email,supplier_type,owner_supplier_id) values
      (pA,'QA b111 Rancho Compartido','qa.b111.rancho@ketzal.local','hotel',agA);
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||format(' [1 la agencia A no pudo crear su proveedor: %s]', sqlerrm); end;

  -- 2 · EL BUG: la agencia B da de alta al MISMO proveedor. Antes de b111 esto
  --     reventaba con 23505 sobre suppliers_name_key.
  begin
    insert into ketzal.suppliers(id,name,contact_email,supplier_type,owner_supplier_id) values
      (pB,'QA b111 Rancho Compartido','qa.b111.rancho@ketzal.local','hotel',agB);
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||format(' [2 la agencia B NO pudo dar de alta el mismo proveedor: %s]', sqlerrm); end;

  -- 3 · Dentro de UNA agencia el nombre sigue siendo único.
  begin
    insert into ketzal.suppliers(name,supplier_type,owner_supplier_id,phone_number) values
      ('QA b111 Rancho Compartido','hotel',agA,'6141119999');
    fails:=fails+1; det:=det||' [3 se duplicó el proveedor dentro de la misma agencia]';
  exception when unique_violation then ok:=ok+1;
  when others then fails:=fails+1; det:=det||format(' [3 falló por otra razón: %s]', sqlerrm); end;

  -- 4 · …y no se escapa cambiando mayúsculas.
  begin
    insert into ketzal.suppliers(name,supplier_type,owner_supplier_id,phone_number) values
      ('qa B111 rANCHO compartido','hotel',agA,'6141119998');
    fails:=fails+1; det:=det||' [4 el mismo nombre en otras mayúsculas entró como proveedor distinto]';
  exception when unique_violation then ok:=ok+1;
  when others then fails:=fails+1; det:=det||format(' [4 falló por otra razón: %s]', sqlerrm); end;

  -- 5 · El correo también es único dentro de la agencia.
  begin
    insert into ketzal.suppliers(name,contact_email,supplier_type,owner_supplier_id) values
      ('QA b111 Otro Nombre','QA.B111.Rancho@ketzal.local','hotel',agA);
    fails:=fails+1; det:=det||' [5 se repitió el correo del proveedor dentro de la misma agencia]';
  exception when unique_violation then ok:=ok+1;
  when others then fails:=fails+1; det:=det||format(' [5 falló por otra razón: %s]', sqlerrm); end;

  -- 6 · Dos proveedores SIN correo conviven (b098 dejó el correo opcional): el
  --     índice parcial no puede tratar los null como iguales.
  begin
    insert into ketzal.suppliers(name,supplier_type,owner_supplier_id,phone_number) values
      ('QA b111 Sin Correo Uno','otro',agA,'6141110001'),
      ('QA b111 Sin Correo Dos','otro',agA,'6141110002');
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||format(' [6 dos proveedores sin correo chocaron: %s]', sqlerrm); end;

  -- 7 · Dos AGENCIAS con el mismo nombre siguen prohibidas: a nivel plataforma
  --     serían indistinguibles.
  begin
    insert into ketzal.suppliers(name,contact_email,supplier_type) values
      ('qa b111 agencia una','qa.b111.otra@ketzal.local','agency');
    fails:=fails+1; det:=det||' [7 se creó una segunda agencia con el mismo nombre]';
  exception when unique_violation then ok:=ok+1;
  when others then fails:=fails+1; det:=det||format(' [7 falló por otra razón: %s]', sqlerrm); end;

  -- 8 · …y tampoco con el mismo correo.
  begin
    insert into ketzal.suppliers(name,contact_email,supplier_type) values
      ('QA b111 Agencia Tres','QA.B111.A@ketzal.local','agency');
    fails:=fails+1; det:=det||' [8 se creó una segunda agencia con el mismo correo]';
  exception when unique_violation then ok:=ok+1;
  when others then fails:=fails+1; det:=det||format(' [8 falló por otra razón: %s]', sqlerrm); end;

  -- 9 · Una agencia y un proveedor de otra agencia SÍ pueden llamarse igual:
  --     son índices distintos y el proveedor no le quita el nombre a nadie.
  begin
    insert into ketzal.suppliers(name,supplier_type,owner_supplier_id,phone_number) values
      ('QA b111 Agencia Dos','otro',agA,'6141110003');
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||format(' [9 un proveedor no pudo llamarse como una agencia ajena: %s]', sqlerrm); end;

  -- 10 · La agencia A ve dos filas con ese nombre en la plataforma, pero UNA sola suya.
  if (select count(*) from ketzal.suppliers where lower(name) = 'qa b111 rancho compartido') = 2
     and (select count(*) from ketzal.suppliers where lower(name) = 'qa b111 rancho compartido' and owner_supplier_id = agA) = 1
  then ok:=ok+1;
  else fails:=fails+1; det:=det||' [10 el conteo por agencia no cuadra]'; end if;

  raise exception 'PROVEEDOR POR AGENCIA -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
