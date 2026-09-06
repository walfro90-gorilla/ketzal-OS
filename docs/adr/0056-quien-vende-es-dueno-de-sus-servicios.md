# ADR-0056 — Quién vende en Ketzal se sabe por la relación, no por la etiqueta: es dueño de sus servicios

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** ninguna
- **Sustituye a:** ninguno
- **Toca:** `ketzal.suppliers.supplier_type` / `supplier_sub_type` ·
  `services.supplier_id` vs `transport_provider_id` / `hotel_provider_id` ·
  `get_public_supplier()` · el formulario de proveedores
- **Relacionadas:** [ADR-0004](0004-tenancy-rls-por-agencia.md) (las agencias son
  filas de `suppliers`), [ADR-0005](0005-dinero-derivado.md) (el mismo principio:
  derivar en vez de guardar una bandera), [ADR-0012](0012-identidad-unica-profiles-type.md)

## Contexto

Al registrar la quinta de Samalayuca como proveedor de hospedaje surgió la
pregunta de fondo: **¿cómo se distingue un proveedor que solo nos surte de una
agencia que puede vender en Ketzal?** Y de paso una propuesta de agregar tipos
nuevos ("Finca", "Quinta") o un botón para crear tipos desde el desplegable.

Medido antes de decidir:

- `supplier_type` **no tiene restricción en la base**: es texto libre.
- El tipo **no decide dónde se enchufa** un proveedor en un servicio. Eso lo dan
  dos columnas fijas: `transport_provider_id` y `hotel_provider_id`.
- `get_public_supplier()` ya usa el criterio correcto sin nombrarlo: solo
  devuelve perfil si el proveedor es **dueño** de al menos un servicio publicado
  (`services.supplier_id = sup.id`).

## Decisión

**El que vende es el dueño de sus servicios. La etiqueta no lo decide; la
relación sí.**

1. **Vende** quien aparece como `services.supplier_id`. De ahí cuelga todo lo
   demás: comisión de plataforma, cuenta de Mercado Pago, datos de SPEI, perfil
   público y agentes que venden a su nombre.
2. **Surte** quien aparece como `transport_provider_id` u `hotel_provider_id`.
   Nunca es dueño de un servicio, y por eso nunca tiene perfil público.
3. **`supplier_type` es una etiqueta de lectura**, no la fuente de verdad. Sirve
   para el badge de la lista, para filtrar, y para gatear la interfaz de agencia.
   No se consulta para decidir si alguien puede vender.
4. **`supplier_sub_type` es texto libre a propósito** (Quinta, Finca, Cabañas,
   Camioneta). Nadie decide nada con ese valor: solo distingue de un vistazo.
5. **Los tipos son un conjunto cerrado y corto**: agencia, transporte,
   hospedaje, otro. "Hospedaje" y no "Hotel" porque el hueco del servicio es el
   mismo para un hotel, una quinta o un campamento.

Hay entonces **tres niveles**, y conviene no confundirlos:

| | Vende | Entra al sistema |
|---|---|---|
| Agencia | sí, es dueña de sus servicios | sí, con sus agentes |
| Proveedor con acceso | no | sí, solo lectura de lo suyo |
| Proveedor sin acceso | no | no, es solo un registro |

## Consecuencias

- Agregar una clase de proveedor no requiere migración ni tipo nuevo: se elige
  el rol que cumple y se escribe el detalle en el subtipo.
- El formulario puede adaptarse por tipo con confianza, porque el tipo no
  arrastra permisos: por eso el perfil público solo se muestra a agencias.
- **Hueco conocido y no cerrado:** nada en la base impide que un proveedor que
  no es agencia aparezca como `services.supplier_id` y quede vendiendo. Hoy no
  muerde porque las dos agencias son del fundador. **El día que entre una
  agencia ajena, ese guard va en la base de datos, no en la pantalla** — junto
  con la decisión de qué pasa con un proveedor que quiere vender su propio
  catálogo, que es un caso de negocio, no técnico.

## Alternativas descartadas

- **Una bandera `puede_vender`.** Duplica una verdad que ya existe en la
  relación y puede desincronizarse: una fila marcada "vende" sin servicios, o
  una que vende con la casilla apagada. Mismo argumento de ADR-0005.
- **Un tipo nuevo por cada clase de proveedor** ("Finca", "Quinta"). No crea un
  hueco nuevo en el servicio, así que no cambia nada del funcionamiento y sí
  multiplica los valores del filtro.
- **Un "+" para crear tipos desde el desplegable.** Sin restricción en la base,
  en meses habría "quinta", "Quinta", "quintas" y "finca" como valores
  distintos, con el filtro de la lista fragmentado y nada que los consuma. Es la
  forma clásica en que se pudre una taxonomía.

## Verificación

**Esto es un criterio de lectura, no un invariante impuesto**, y el ADR lo dice
para no mentir: hoy la base **no** obliga a que solo las agencias sean dueñas de
servicios.

- Medido el 2026-09-05: los **14 servicios** existentes tienen dueño de tipo
  `agency`, sin excepción, y `supplier_type` no tiene ninguna restricción
  `CHECK`.
- La regla sí está implementada donde importa hoy: `get_public_supplier()`
  exige `exists (select 1 from services where supplier_id = sup.id and
  published)`, así que un proveedor de transporte u hospedaje nunca obtiene
  perfil público aunque tenga los campos llenos.
- **Cuando se cierre el hueco** (al entrar la primera agencia ajena), esta
  sección debe nombrar el harness que afirme que un `supplier_type` distinto de
  `agency` no puede quedar como `services.supplier_id`.
