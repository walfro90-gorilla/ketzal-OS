-- b110b — Hotfix de b110: `text[] || 'literal'` es ambiguo y tumbaba la compuerta.
--
-- b110 se aplicó limpio (`apply_migration` no se quejó) y la compuerta quedó
-- ROTA en runtime: al intentar publicar un servicio incompleto, en vez del
-- mensaje de "falta el destino" salía
--
--     malformed array literal: "el nombre"
--
-- Causa: `faltan := faltan || 'el nombre'` no es "agrega este texto al
-- arreglo". Postgres tiene dos candidatos para `||` con `text[]` a la
-- izquierda —`anyarray || anyelement` y `anyarray || anyarray`— y un literal
-- sin tipo no desempata, así que resuelve por el segundo e intenta LEER
-- "el nombre" como si fuera un arreglo. El casteo `::text` desempata y
-- selecciona `anyarray || anyelement`.
--
-- Por qué el apply no lo vio: es error de EJECUCIÓN, no de compilación. El
-- cuerpo de una función plpgsql no se valida al crearla; `create or replace
-- function` acepta cualquier cosa sintácticamente bien formada. Lo cazó
-- `supabase/tests/publicar_completo.sql` al ejercer la compuerta de verdad
-- contra la BD.
--
-- Esta migración es un `create or replace` completo de la función, idéntico al
-- de b110 salvo los cinco `::text`. Se aplicó el mismo día, minutos después
-- (b110 20260910010351 → b110b 20260910011029).
--
-- OJO al leer el espejo de b110: `db/proposed/b110_no_publicar_incompleto.sql`
-- ya trae el cuerpo CORREGIDO, o sea que no calca lo que b110 aplicó de verdad
-- sino el estado final. Se dejó así a propósito para que quien lea la decisión
-- lea código que funciona; este archivo existe para que el repo declare los dos
-- nombres que `schema_migrations` tiene, y para dejar escrita la trampa.
-- Replicar b110 y luego b110b da el mismo resultado que replicar solo b110.

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

  if coalesce(btrim(NEW.name), '') = '' then
    faltan := faltan || 'el nombre'::text;
  end if;
  if NEW.supplier_id is null then
    faltan := faltan || 'la agencia dueña'::text;
  end if;

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

  select * into r from ketzal.resolve_commission_rule(NEW.id, 'plataforma', null);
  if r.basis is null
     or coalesce(r.rate, 0) <= 0 and coalesce(r.unit_amount, 0) <= 0 then
    raise exception 'No se puede publicar "%": la comisión de plataforma resuelve en cero. Define un %% general o una regla por servicio en /comisiones.', NEW.name;
  end if;

  return NEW;
end $function$;
