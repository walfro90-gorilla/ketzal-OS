-- b110 — No se publica un servicio incompleto (extiende la compuerta de b076/b077).
--
-- Pedido del fundador: que un servicio no pueda hacerse público sin la
-- información mínima, para que no lleguen fichas a medias al catálogo. Ya
-- existía media pieza: `tg_require_commission_to_publish` (b076/b077) impedía
-- publicar sin comisión de plataforma resuelta. Esto NO agrega un segundo
-- trigger: extiende ese, porque dos compuertas sobre la misma transición se
-- desincronizan y el operador ve un error a la vez en vez de la lista.
--
-- Vive en la BD y no en el formulario porque publicar es un UPDATE de una
-- columna: el MCP lo hace con `ketzal_publicar_servicio` sin pasar por la
-- pantalla, y un candado en React no lo detiene.
--
-- QUÉ SE EXIGE, y por qué solo esto: lo que hace que la ficha pública no
-- mienta. Nombre y agencia (la ficha los pinta como título y vendedor), al
-- menos un precio (el catálogo publica "desde $X" del pack más barato),
-- destino (la vitrina y las páginas por destino filtran por ahí) y foto de
-- portada (la tarjeta del catálogo y la card de compartir se ven rotas sin
-- ella). NO se exige descripción —hoy la tienen los 7 publicados y su ausencia
-- no rompe nada— ni salidas: vender sin salida es un modo soportado a
-- propósito ("sin salidas, el servicio se vende sin tope"), y matarlo aquí
-- quitaría una vía de venta real. El plan de abonos sin fecha lo ataja b109,
-- que es donde está el dinero.
--
-- SOLO EN LA TRANSICIÓN a publicado, igual que b076: si ya está público, un
-- UPDATE posterior no se bloquea. Se conserva esa semántica a propósito —
-- exigir el invariante en toda fila publicada dejaría sin poder editar al
-- servicio que justamente hay que completar. Y despublicar siempre se puede.
--
-- ERRCODE: se pasa de `check_violation` a P0001 (raise pelón). `safeError`
-- (src/lib/errors.ts) solo deja pasar el mensaje cuando el código es P0001;
-- con 23514 el operador recibía "No se pudo completar la acción. Intenta de
-- nuevo." y se quedaba sin saber qué le faltaba. Medido leyendo safeError: la
-- compuerta de comisión de b076 llevaba así desde entonces.
--
-- Nota de implementación: los `faltan := faltan || '…'::text` llevan casteo a
-- propósito. Sin él, `text[] || 'literal'` es ambiguo y Postgres resuelve por
-- `anyarray || anyarray`, intentando leer el texto como arreglo:
-- "malformed array literal". Lo cazó el harness, no el apply.
--
-- OJO: este archivo NO calca lo que b110 aplicó. b110 se aplicó SIN los
-- `::text` y dejó la compuerta rota en runtime; el casteo entró minutos
-- después en `b110b_no_publicar_incompleto_array_literal`, que tiene su propio
-- espejo al lado. Aquí quedó el cuerpo final para que se lea código que sirve.
--
-- Medido antes de aplicar (2026-09-09): de 7 servicios publicados, 6 pasan
-- esta compuerta. El único que falla es "TEST pago en línea $50" (sin destino,
-- sin foto), fixture de las pruebas de cobro. Como el trigger no retro-aplica,
-- esa fila sigue publicada hasta que alguien la despublique.

create or replace function ketzal.tg_require_complete_to_publish()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  r record;
  faltan text[] := '{}';
  v_precio boolean;
begin
  if coalesce(NEW.published, false) = false then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.published, false) = true then return NEW; end if;

  ------------------------------------------------------------- completitud ---
  if coalesce(btrim(NEW.name), '') = '' then
    faltan := faltan || 'el nombre'::text;
  end if;
  if NEW.supplier_id is null then
    faltan := faltan || 'la agencia dueña'::text;
  end if;

  -- Precio: vale el pack más barato (lo que publica el catálogo como "desde")
  -- o la columna `price` de los servicios que nunca migraron a packs.
  select coalesce(NEW.price, 0) > 0
         or exists (
           select 1 from jsonb_array_elements(coalesce(NEW.packs, '[]'::jsonb)) p
            where coalesce((p->>'price')::numeric, 0) > 0
         )
    into v_precio;
  if not coalesce(v_precio, false) then
    faltan := faltan || 'un precio (al menos un pack con precio)'::text;
  end if;

  if coalesce(btrim(NEW.state_to), '') = ''
     and coalesce(btrim(NEW.city_to), '') = '' then
    faltan := faltan || 'el destino'::text;
  end if;

  if coalesce(btrim(NEW.images->>'imgBanner'), '') = '' then
    faltan := faltan || 'la foto de portada'::text;
  end if;

  if array_length(faltan, 1) is not null then
    raise exception 'No se puede publicar "%": falta %. Complétalo y vuelve a intentar.',
      coalesce(nullif(btrim(NEW.name), ''), 'este servicio'),
      array_to_string(faltan, ', ');
  end if;

  -------------------------------------------------------------- comisión ----
  -- Conservado de b076/b077, con el mensaje ahora visible (P0001).
  select * into r from ketzal.resolve_commission_rule(NEW.id, 'plataforma', null);
  if r.basis is null
     or coalesce(r.rate, 0) <= 0 and coalesce(r.unit_amount, 0) <= 0 then
    raise exception 'No se puede publicar "%": la comisión de plataforma resuelve en cero. Define un %% general o una regla por servicio en /comisiones.', NEW.name;
  end if;

  return NEW;
end $function$;

drop trigger if exists trg_require_commission_to_publish on ketzal.services;
drop trigger if exists trg_require_complete_to_publish on ketzal.services;
create trigger trg_require_complete_to_publish
  before insert or update of published on ketzal.services
  for each row execute function ketzal.tg_require_complete_to_publish();

-- El nombre viejo mentía en cuanto la compuerta dejó de ser solo de comisión.
drop function if exists ketzal.tg_require_commission_to_publish();
