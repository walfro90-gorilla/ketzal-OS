-- b098 — Ubicación agrupable y contacto realista. (ADR-0057)
--
-- Migración aplicada: `b098_ubicacion_estructurada_y_contacto` (2026-09-05).
--
-- Dos problemas reales, encontrados al registrar la quinta de Samalayuca:
--
-- 1. **`services.state_to` guardaba PAÍSES.** No había columna de país, así que
--    el mismo campo tenía "Jalisco" y "Sinaloa" junto a "Colombia", "Brasil",
--    "Perú" y "Costa Rica". Agrupar por estado mezclaba las dos cosas, que es
--    justo lo que el fundador quería hacer.
-- 2. **`suppliers.contact_email` era NOT NULL**, y hay proveedores informales
--    que solo tienen WhatsApp. No se podía registrar una quinta sin inventarle
--    un correo — y un correo inventado es peor que un campo vacío.
--
-- El proveedor tampoco tenía ciudad/estado/país: solo `address` de texto libre.

-- ── Correo opcional, pero contacto obligatorio ──────────────────────────────
-- UNIQUE sigue valiendo: Postgres permite varios NULL en un índice único, así
-- que dos proveedores sin correo no chocan entre sí.
alter table ketzal.suppliers alter column contact_email drop not null;

-- Un proveedor sin NINGÚN medio de contacto no sirve para nada: es el registro
-- que alguien abre en la lista y no puede usar. Se exige al menos uno.
alter table ketzal.suppliers drop constraint if exists suppliers_contacto_chk;
alter table ketzal.suppliers add constraint suppliers_contacto_chk check (
  coalesce(nullif(trim(contact_email), ''), nullif(trim(phone_number), '')) is not null
);

-- ── Ubicación del proveedor ────────────────────────────────────────────────
-- `address` se queda para la calle; ciudad/estado/país se separan para agrupar.
alter table ketzal.suppliers add column if not exists city text;
alter table ketzal.suppliers add column if not exists state text;
alter table ketzal.suppliers add column if not exists country text;

-- ── País del servicio, separado del estado ─────────────────────────────────
alter table ketzal.services add column if not exists country_from text;
alter table ketzal.services add column if not exists country_to text;

-- Backfill: lo que estaba en `state_to` y era un país se mueve a `country_to`.
-- Se listan explícitamente en vez de "lo que no sea estado mexicano": una lista
-- corta y revisada es más segura que una regla que puede tragarse una entidad
-- mal escrita.
update ketzal.services
   set country_to = state_to, state_to = null
 where state_to in ('Colombia','Brasil','Perú','Peru','Costa Rica','Argentina',
                    'Chile','Cuba','Panamá','Guatemala','España','Italia','Francia',
                    'Estados Unidos','Canadá');

-- Lo que quedó con estado mexicano es de México; se explicita para poder
-- agrupar por país sin tratar el NULL como caso especial.
update ketzal.services set country_to = 'México'
 where country_to is null and state_to is not null;

update ketzal.services set country_from = 'México'
 where country_from is null and (state_from is not null or city_from is not null);
