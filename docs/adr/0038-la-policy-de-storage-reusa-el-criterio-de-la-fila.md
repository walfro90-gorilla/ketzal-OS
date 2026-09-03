# ADR-0038 — Una policy de Storage reusa el criterio que gobierna la fila, no inventa uno paralelo

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Migración:** `b090_storage_suppliers_y_brand_scopeados`
- **Sustituye a:** ninguno (afina la implementación de [ADR-0036](0036-el-bucket-publico-no-guarda-documentos.md); su decisión sigue en pie)
- **Toca:** `storage.objects` (`ketzal_assets_auth_insert` / `_update`),
  `ketzal.puedo_escribir_imagen_supplier`

## Contexto

[ADR-0036](0036-el-bucket-publico-no-guarda-documentos.md) (b088) cerró el hueco
grande —los comprobantes SPEI públicos— y de paso reemplazó la policy de
escritura del bucket público, que scopeaba solo por `bucket_id`, por un `case`
sobre la primera carpeta. Dos de las cuatro ramas quedaron a medias:

```sql
when 'suppliers' then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
when 'brand'     then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
```

Ninguna compara la **carpeta** con **quien escribe**: piden nada más "tener
agencia". `services/` y `profiles/` sí lo hacían, y ese contraste es la pista de
por qué pasó — el criterio se escribió a mano, rama por rama, en vez de salir de
un solo lugar.

El barrido de re-verificación del 2026-09-02 lo midió contra la BD real, en una
transacción revertida, con un agente de Wanderlust:

```
sobrescribir el logo VIVO de la plataforma (brand/logo-1784587723992.png) → PASO (1 fila)
sobrescribir imagen viva de OTRA agencia (suppliers/dd46052b…/foto-…jpg)  → PASO (1 fila)
```

No hace falta adivinar el nombre del objeto: `get_brand_logo()` y
`list_public_suppliers()` son ejecutables por `anon` y devuelven las URLs
exactas. Y las subidas del navegador van con `upsert: true`, así que
sobreescribir es la operación normal. Con eso, cualquier miembro de cualquier
agencia podía cambiarle el logo a Ketzal y las fotos a la competencia. No fuga
datos; rompe el aislamiento por `supplier_id` de la regla de oro 1
([ADR-0004](0004-tenancy-rls-por-agencia.md)).

La fila del proveedor ya tenía su regla, escrita y probada, en `suppliers_update`:

```sql
is_superadmin() or is_agency_admin(id)
  or (owner_supplier_id is not null and is_agency_admin(owner_supplier_id))
```

Había dos criterios distintos para la misma cosa —quién manda sobre ese
proveedor— y el de Storage era el flojo.

## Decisión

1. **La policy de Storage no define su propio criterio de tenencia.** Llama al
   mismo guard que gobierna la fila. Para `suppliers/` eso es
   `ketzal.puedo_escribir_imagen_supplier(carpeta)`, que replica
   `suppliers_update`: superadmin, admin de esa agencia, o admin de la agencia
   dueña del proveedor (`owner_supplier_id`).
2. **El guard recibe `text`, no `uuid`.** Una carpeta que no es un uuid es una
   entrada válida del atacante; un cast crudo en la policy no niega la escritura
   sino que revienta la evaluación entera. Se compara `s.id::text = p_supplier`.
3. **`brand/` es de plataforma: solo superadmin.** El puntero
   (`app_settings.logo_url`) ya era `is_superadmin`; los bytes ahora también.
   Antes se podía sustituir el archivo sin tocar el puntero.
4. **INSERT y UPDATE se re-aplican juntos, con el mismo `case`.** Si divergen,
   una de las dos deja de proteger y la otra tapa el síntoma: `upsert` es UPDATE.
5. **Un caso del harness que no encuentra su fixture es rojo, no salta.** Los
   casos de la sección 6 buscan al admin y al no-admin en toda la BD, no dentro
   de la agencia que tocó en el `select` anterior, y si no los hay escriben
   `ROTO`.

## Verificación

- `supabase/tests/superficie_storage.sql`, sección 6 — **22 casos, 0 fallaron**:
  - `'agente no-admin sube a brand/'` → espera `OK` (negada por RLS)
  - `'agente no-admin sube a suppliers/ ajeno'` → espera `OK`
  - `'agente no-admin sobreescribe brand/ y suppliers/'` → espera `0 filas`
  - `'admin sube a suppliers/ de SU agencia'` y `'…de SU proveedor'` → esperan
    `OK: escribió` (apretar la policy no puede romper al dueño)
  - `'admin sube a suppliers/ de OTRA agencia'` → espera `OK` (negada)
  - `'carpeta suppliers/ con nombre basura'` → espera `negada sin reventar`
- **Prueba de mutación** (2026-09-02, transacción revertida contra la BD real):
  restaurada la policy de b088, los dos primeros casos devuelven
  `HUECO: escribió`. El test falla cuando el bug vuelve.
- `supabase/tests/superficie_anonima.mjs` — 33 pruebas, 0 expuestas.

## Consecuencias

- Un agente **no admin** ya no sube imágenes de proveedor. No es una regresión de
  producto: `suppliers_update` ya le negaba guardar la fila, así que el flujo
  fallaba igual, un paso después. Ahora falla al subir, con el mensaje de la
  subida.
- El logo de la plataforma solo lo cambia el superadmin, que es quien ve
  `/ajustes`.
- Queda un criterio duplicado a propósito: `puedo_escribir_imagen_supplier`
  repite el `where` de `suppliers_update` en vez de leerlo. Postgres no deja
  invocar una policy desde otra; si `suppliers_update` cambia, este guard se
  cambia con él — por eso el ADR nombra los dos.
- `services/` sigue con su `exists` en línea (dueño del servicio) porque ahí el
  criterio no coincide con ninguna policy existente.
