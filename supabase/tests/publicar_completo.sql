-- HARD TESTING — no se publica un servicio incompleto (b110, ADR-0064).
--
--   pnpm hard-test publicar_completo
--
-- Qué defiende: la compuerta vive en la BD, no en el formulario, porque
-- publicar es un UPDATE de una columna y el MCP lo hace sin pasar por React.
-- Exige nombre, agencia, precio, destino y foto; nombra lo que falta en un
-- mensaje LEGIBLE (P0001 — con `check_violation` la app lo enmascaraba, que es
-- como vivió la compuerta de comisión de b076 hasta hoy). Y conserva el guard
-- de comisión. Despublicar siempre se puede; una fila ya publicada no se
-- re-valida (si no, no habría cómo editar la que hay que completar).
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  ag    uuid := '0000b110-0000-4000-8000-00000000a001';
  s_ok  uuid := '0000b110-0000-4000-8000-00000000c001';  -- completo
  s_mal uuid := '0000b110-0000-4000-8000-00000000c002';  -- sin destino ni foto
  s_pub uuid := '0000b110-0000-4000-8000-00000000c003';  -- ya publicado, incompleto
  foto  jsonb := '{"imgBanner":"https://x/y.jpg"}'::jsonb;
  packs jsonb := '[{"key":"doble","label":"Doble","price":2500}]'::jsonb;
  msg text; b boolean;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate) values
    (ag,'QA b110 Agencia','qa.b110.a@ketzal.local','agency',10);

  -- `services.price` es NOT NULL: la siembra lo da explícito. "Sin precio" en
  -- este dominio es 0, no null (medido: el insert sin price rebota).
  insert into ketzal.services(id,supplier_id,name,price,packs,state_to,city_to,images,published) values
    (s_ok,  ag,'QA b110 Completo',   0, packs,'Chihuahua','Juárez', foto, false),
    (s_mal, ag,'QA b110 Incompleto', 0, packs, null,      null,     null, false);

  -- Fila que YA está publicada e incompleta: se siembra saltándose el trigger,
  -- como las que quedaron vivas antes de b110.
  alter table ketzal.services disable trigger trg_require_complete_to_publish;
  insert into ketzal.services(id,supplier_id,name,price,packs,state_to,images,published) values
    (s_pub, ag,'QA b110 Ya publicado', 0, packs, null, null, true);
  alter table ketzal.services enable trigger trg_require_complete_to_publish;

  -- 1 · Un servicio completo SÍ se publica.
  begin
    update ketzal.services set published = true where id = s_ok;
    ok:=ok+1;
  exception when others then
    get stacked diagnostics msg = message_text;
    fails:=fails+1; det:=det||format(' [1 no dejó publicar uno completo: %s]', msg);
  end;

  -- 2 · Uno incompleto NO se publica…
  begin
    update ketzal.services set published = true where id = s_mal;
    fails:=fails+1; det:=det||' [2 publicó un servicio incompleto]';
  exception when others then
    get stacked diagnostics msg = message_text;
    -- 3 · …y el mensaje NOMBRA lo que falta, en vez de un "no se pudo".
    if msg like '%el destino%' and msg like '%la foto de portada%' then ok:=ok+2;
    else fails:=fails+1; det:=det||format(' [3 mensaje sin la lista: %s]', msg); end if;
  end;

  -- 4 · Sigue en privado tras el intento fallido.
  select published into b from ketzal.services where id = s_mal;
  if not coalesce(b,false) then ok:=ok+1;
  else fails:=fails+1; det:=det||' [4 quedó publicado igual]'; end if;

  -- 5 · El mensaje es LEGIBLE para la app: P0001, el único código que
  --     `safeError` deja pasar. Con check_violation el operador no ve nada.
  begin
    update ketzal.services set published = true where id = s_mal;
    fails:=fails+1; det:=det||' [5 no lanzó]';
  exception when sqlstate 'P0001' then ok:=ok+1;
           when others then fails:=fails+1; det:=det||' [5 errcode no es P0001]';
  end;

  -- 6 · Sin precio tampoco se publica (aunque tenga lo demás).
  update ketzal.services set packs = '[]'::jsonb, price = 0 where id = s_ok;
  update ketzal.services set published = false where id = s_ok;
  begin
    update ketzal.services set published = true where id = s_ok;
    fails:=fails+1; det:=det||' [6 publicó sin precio]';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg like '%precio%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [6 mensaje sin precio: %s]', msg); end if;
  end;

  -- 7 · Una fila YA publicada no se re-valida: editarla sigue siendo posible.
  --     Si no, la que hay que completar quedaría bloqueada para siempre.
  begin
    update ketzal.services set description = 'editada' where id = s_pub;
    ok:=ok+1;
  exception when others then
    get stacked diagnostics msg = message_text;
    fails:=fails+1; det:=det||format(' [7 bloqueó editar una ya publicada: %s]', msg);
  end;

  -- 8 · Despublicar SIEMPRE se puede, incompleta o no.
  begin
    update ketzal.services set published = false where id = s_pub;
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||' [8 no dejó despublicar]';
  end;

  raise exception 'PUBLICAR COMPLETO -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
