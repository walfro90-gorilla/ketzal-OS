# ADR-0065 — El proveedor es único dentro de su agencia, no en toda la plataforma

- **Estado**: aceptado
- **Fecha**: 2026-09-09
- **Sustituye a**: —
- **Relacionado**: [ADR-0004](0004-tenancy-rls-por-agencia.md) (tenencia por
  `supplier_id`), [ADR-0056](0056-quien-vende-es-dueno-de-sus-servicios.md)
  (quién surte vs. quién vende), [ADR-0055](0055-el-costeo-es-un-plan-no-un-ledger.md)
  (tarifario por proveedor)

## Contexto

`ketzal.suppliers` guarda dos cosas en la misma tabla: las **agencias**
(`owner_supplier_id is null`) y los **proveedores** que las surten
(`owner_supplier_id` = la agencia dueña). Del esquema original venían dos
restricciones **globales**:

```
suppliers_name_key           UNIQUE (name)
suppliers_contact_email_key  UNIQUE (contact_email)
```

Para las agencias eso es correcto: dos agencias que se llaman igual son
indistinguibles para cualquiera que las mire. Para los proveedores es un bug de
tenencia: el nombre de un proveedor **no es un identificador de plataforma**.
En cuanto Wanderlust dio de alta "Rancho San Lorenzo" (2026-09-08), Border
Travels dejó de poder darlo de alta — y el fundador opera tres agencias que
comparten proveedores de la misma región, así que el choque es el caso normal,
no el borde.

Además el fallo se veía feo: el insert reventaba con `23505` y la persona leía
"Los datos no cumplen una restricción de la base de datos", sin ninguna pista de
qué campo repetía ni de que el dueño del nombre era **otra agencia** que ella no
puede ver (la RLS se lo esconde). Un choque contra una fila invisible es el peor
tipo de error.

Salió corriendo la suite completa de hard-tests: `mcp_proveedores.mjs` daba de
alta "Rancho San Lorenzo" en su agencia efímera y chocaba contra el proveedor
real de Wanderlust. El harness estaba bien; la restricción estaba mal.

## Decisión

**La unicidad de un proveedor se mide dentro de la agencia que lo surte.** La de
una agencia sigue siendo de plataforma. Se sustituyen las dos restricciones
globales por cuatro índices únicos parciales (`b111`):

| Índice | Alcance | Predicado |
|---|---|---|
| `uq_suppliers_agencia_nombre`   | `lower(name)`                       | `owner_supplier_id is null` |
| `uq_suppliers_agencia_correo`   | `lower(contact_email)`              | `owner_supplier_id is null and contact_email is not null` |
| `uq_suppliers_proveedor_nombre` | `owner_supplier_id, lower(name)`    | `owner_supplier_id is not null` |
| `uq_suppliers_proveedor_correo` | `owner_supplier_id, lower(contact_email)` | `owner_supplier_id is not null and contact_email is not null` |

Tres consecuencias deliberadas:

1. **`lower(...)`**: la unicidad pasa a ser insensible a mayúsculas. Antes
   "RANCHO SAN LORENZO" entraba como proveedor distinto de "Rancho San Lorenzo"
   en la misma agencia. Verificado contra los datos vivos antes de aplicar: cero
   colisiones, los índices se crearon sin tocar una fila.
2. **`contact_email is not null` en el predicado**: b098 dejó el correo opcional
   (basta un contacto). Sin ese filtro, dos proveedores sin correo chocarían
   entre sí.
3. **Un proveedor puede llamarse como una agencia ajena.** Son índices
   distintos y el proveedor no le quita el nombre a nadie: quien busca la
   agencia la busca en su propio espacio.

`ketzal_crear_proveedor` (MCP) ya detectaba nombres parecidos **dentro de la
agencia** y respondía con el id del que existe; esa heurística y esta
restricción ahora miden lo mismo. El camino del OS (`crearProveedor` /
`actualizarProveedor`) traduce el `23505` de estos índices a un mensaje que dice
qué campo repite y qué hacer.

## Alternativas descartadas

- **Dejar el `UNIQUE (name)` global y pedir nombres distintos** ("Rancho San
  Lorenzo (Border)"). Ensucia el catálogo de cada agencia para resolver un
  problema que no es suyo, y no escala: con 20 agencias, la vigésima nombra al
  proveedor con un sufijo absurdo.
- **Tabla aparte para proveedores.** Es el modelo "correcto" en abstracto, pero
  parte en dos la tenencia, la RLS, el tarifario, el costeo y los servicios, que
  hoy apuntan todos a `suppliers.id`. Migración enorme para un problema que
  cuatro índices resuelven. → [ADR-0003](0003-monolito-sin-sobreingenieria.md)
- **Unicidad solo por nombre, sin tocar el correo.** El correo tenía el mismo
  bug con el mismo síntoma: un proveedor con `reservas@rancho.mx` bloqueaba a
  las demás agencias. Arreglar la mitad deja el reporte vivo.

## Verificación

`supabase/tests/proveedor_por_agencia.sql` — **10/10** (`pnpm hard-test
proveedor_por_agencia`). Las aserciones que sostienen cada afirmación:

- caso **2**: la agencia B da de alta un proveedor con el mismo nombre y el
  mismo correo que el de la agencia A. Es el bug reportado.
- casos **3** y **4**: dentro de UNA agencia el nombre sigue siendo único, y no
  se escapa cambiando mayúsculas.
- caso **5**: el correo también es único dentro de la agencia, también sin
  distinguir mayúsculas.
- caso **6**: dos proveedores sin correo conviven (el predicado parcial).
- casos **7** y **8**: dos agencias con el mismo nombre, o el mismo correo,
  siguen prohibidas.
- caso **9**: un proveedor puede llamarse como una agencia ajena.
- caso **10**: el mismo nombre existe dos veces en la plataforma y una sola vez
  dentro de la agencia A.

**Mutado**: reviviendo `create unique index ... on ketzal.suppliers (name)`
dentro de una transacción revertida, el caso 2 se cae con `duplicate key value
violates unique constraint`; con b111 aplicado, pasa. El harness mide la
restricción, no la casualidad.

`mcp_proveedores.mjs`, que llevaba rojo desde que existe el proveedor real
"Rancho San Lorenzo", vuelve a verde sin tocarle una línea.
