-- HARD TESTING — ubicación agrupable y contacto realista (ADR-0057, b098).
--
--   pnpm hard-test ubicacion_contacto
--
-- Qué defiende, y por qué importa: el fundador quiere agrupar proveedores y
-- destinos por ciudad o estado. Eso se rompe de dos maneras silenciosas:
--
--   · que el campo de ESTADO vuelva a guardar países (era el bug: "Colombia" y
--     "Brasil" convivían con "Jalisco" en `services.state_to`, porque no había
--     columna de país). Un reporte por estado mezclaba las dos cosas y nadie lo
--     notaba mirando la pantalla;
--   · que se registre un proveedor SIN ningún medio de contacto. El correo se
--     volvió opcional porque hay proveedores que solo tienen WhatsApp, y el
--     riesgo de esa flexibilidad es la ficha que nadie puede usar.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. Crea
-- sus propias filas; no lee ni toca datos reales.

do $$
declare
  ag  uuid := '0000c098-0000-4000-8000-00000000a001';
  n int; got text;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate)
    values (ag,'QA b098 Agencia','qa.b098@ketzal.local','agency',0);

  -- 1 · Un proveedor SIN correo pero CON teléfono sí se guarda (el caso real:
  --     la quinta que solo tiene WhatsApp).
  begin
    insert into ketzal.suppliers(id,name,supplier_type,phone_number,city,state,country)
      values ('0000c098-0000-4000-8000-00000000a002','QA Quinta solo WhatsApp','hotel',
              '6561234567','Samalayuca','Chihuahua','México');
    ok:=ok+1;
  exception when others then
    fails:=fails+1; det:=det||' [1 no se pudo guardar un proveedor con solo teléfono: '||sqlerrm||']';
  end;

  -- 2 · Un proveedor sin correo NI teléfono NO se guarda: es una ficha que
  --     nadie puede usar.
  begin
    insert into ketzal.suppliers(id,name,supplier_type)
      values ('0000c098-0000-4000-8000-00000000a003','QA Sin contacto','otro');
    fails:=fails+1; det:=det||' [2 se guardó un proveedor SIN ningún contacto]';
  exception when check_violation then ok:=ok+1;
  end;

  -- 3 · Cadenas vacías no cuentan como contacto (el hueco clásico: el
  --     formulario manda '' en vez de NULL y el guard se lo traga).
  begin
    insert into ketzal.suppliers(id,name,supplier_type,contact_email,phone_number)
      values ('0000c098-0000-4000-8000-00000000a004','QA Contacto vacio','otro','   ','');
    fails:=fails+1; det:=det||' [3 una cadena vacía pasó como contacto]';
  exception when check_violation then ok:=ok+1;
  end;

  -- 4 · Dos proveedores SIN correo conviven: el UNIQUE de `contact_email` no
  --     debe estorbar, porque Postgres permite varios NULL.
  begin
    insert into ketzal.suppliers(id,name,supplier_type,phone_number) values
      ('0000c098-0000-4000-8000-00000000a005','QA Sin correo A','otro','6560000001'),
      ('0000c098-0000-4000-8000-00000000a006','QA Sin correo B','otro','6560000002');
    ok:=ok+1;
  exception when others then
    fails:=fails+1; det:=det||' [4 dos proveedores sin correo chocaron entre sí: '||sqlerrm||']';
  end;

  -- 5 · El servicio tiene DÓNDE poner el país, que es lo que faltaba.
  insert into ketzal.services(id,supplier_id,name,price,city_to,state_to,country_to)
    values ('0000c098-0000-4000-8000-00000000b001',ag,'QA Tour',1000,
            'Medellín',null,'Colombia');
  select country_to into got from ketzal.services
   where id='0000c098-0000-4000-8000-00000000b001';
  if got = 'Colombia' then ok:=ok+1;
  else fails:=fails+1; det:=det||' [5 el país no se guardó en country_to]'; end if;

  -- 6 · Y el estado queda LIBRE para lo que es: un destino extranjero no
  --     necesita estado mexicano.
  select count(*) into n from ketzal.services
   where id='0000c098-0000-4000-8000-00000000b001' and state_to is null;
  if n = 1 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [6 un destino extranjero quedó con estado]'; end if;

  -- 7 · REGRESIÓN del bug original: ningún servicio real debe tener un país
  --     metido en la columna de estado. Es la afirmación que se rompería si
  --     alguien vuelve a capturar "Colombia" como estado.
  select count(*) into n from ketzal.services
   where state_to in ('Colombia','Brasil','Perú','Peru','Costa Rica','Argentina',
                      'Chile','Cuba','Panamá','Guatemala','España','Italia',
                      'Francia','Estados Unidos','Canadá');
  if n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [7 hay %s servicios con un PAÍS en state_to]',n); end if;

  -- 8 · El proveedor guarda ciudad/estado/país por separado, que es lo que
  --     permite agrupar.
  select city||'|'||state||'|'||country into got from ketzal.suppliers
   where id='0000c098-0000-4000-8000-00000000a002';
  if got = 'Samalayuca|Chihuahua|México' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [8 la ubicación del proveedor no se guardó separada: %s]',got); end if;

  raise exception 'UBICACIÓN Y CONTACTO -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
