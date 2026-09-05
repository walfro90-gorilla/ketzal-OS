# ADR-0055 — El costeo de un tour es un plan, no un ledger; el costo lo ve solo el admin y vive fuera de `services`

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** `b097_costeo`
- **Sustituye a:** la nota viva del ROADMAP "Prestadores locales y add-ons con
  dueño" (2026-08-30), que proponía `supplier_id` + `cost` dentro de
  `services.add_ons` — descartado aquí, ver *Alternativas*
- **Toca:** `ketzal.supplier_rate_cards` y `ketzal.service_costings` (tablas
  nuevas) · `ketzal.valid_rate_card()` / `valid_costing()` / `valid_rate_body()`
  / `jsonb_num()` · `src/lib/domain/costeo.ts` ·
  `src/app/(ops)/servicios/[id]/costeo/**` ·
  `src/app/(ops)/proveedores/[id]/tarifario-form.tsx` · `+3` server actions
- **Relacionadas:** [ADR-0005](0005-dinero-derivado.md) (dinero derivado),
  [ADR-0006](0006-ledger-append-only-rpc-only.md) (qué es tabla de dinero),
  [ADR-0004](0004-tenancy-rls-por-agencia.md) (RLS por agencia),
  [ADR-0009](0009-mxn-autoritativo.md) (MXN), [ADR-0037](0037-el-admin-de-agencia-ve-a-sus-embajadores.md)
  (un guard que devuelve NULL en vez de false)

## Contexto

Ningún tour del OS sabía cuánto cuesta. `services` no tiene una sola columna de
costo; `add_ons` es `{key,label,price}` sin dueño ni costo; el margen vivía en
la cabeza del fundador y el pago al prestador de Creel (tirolesa, motos,
caballos) se hacía de memoria. El costo **real** sí existe: `expenses` es un
ledger append-only con `provider_supplier_id`, y la utilidad de reportes ya es
vendido − gastos. Lo que faltaba es el **plan**: qué proveedores entran a un
tour, con qué tarifa negociada, y a cuántos pasajeros se empata.

Tres hechos del modelo acotaron la solución:

1. Los costos escalan distinto con N pasajeros: por persona (lineal), por
   grupo o por día (fijos, con **escalón** cuando una sprinter de 15 se vuelve
   dos a 16 pax) y por habitación-noche (depende del pack: doble ≠ sencilla).
   Una fórmula cerrada de punto de equilibrio miente en el escalón.
2. El costo lo debe ver **solo el admin** de la agencia (decisión de Wal, 2026-09-05:
   "agentes solo ven precio al público"). RLS es por fila, `services_read` deja
   leer filas publicadas a cualquiera y `get_public_service` devuelve
   `add_ons`: **un jsonb de costo en `services` o en `add_ons` habría salido al
   público**.
3. La tarifa es **negociada por agencia** (Border no paga lo mismo que
   Wanderlust en el mismo hotel), y los proveedores ya son filas privadas por
   agencia (`suppliers.owner_supplier_id`).

## Decisión

1. **El costeo es un plan, no un ledger.** No crea cuentas por pagar ni toca
   `expenses`; el gasto real sigue entrando por Gastos. Por eso NO es tabla de
   dinero (ADR-0006 no aplica): se escribe por PostgREST desde server actions y
   la autorización es solo RLS.
2. **Dos tablas 1:1 con documento jsonb y validador en CHECK**, fuera de
   `services`: `supplier_rate_cards(supplier_id pk, rates)` (tarifario del
   proveedor) y `service_costings(service_id pk, doc)` (hoja de costeo). RLS
   `select/insert/update` solo para `is_superadmin()` o
   `coalesce(is_agency_admin(<agencia dueña>), false)`; sin policy de delete
   (el cascade del padre es el único camino). El anónimo no tiene grant.
3. **El tarifario lo captura la agencia** en `/proveedores/[id]`, no el
   prestador en autoservicio. Unidades: `pax`, `grupo`, `dia`, `habitacion`
   (costo por noche por pack, subconjunto de los 4 packs); `cap` opcional en
   grupo/día = cupo por unidad (⇒ `unidades = ceil(N / cap)`).
4. **Cada línea del costeo es un snapshot** de la tarifa al elegirla (nombre,
   costo, proveedor). Si el tarifario cambia o el proveedor se borra, el
   costeo guardado no se mueve solo.
5. **El motor es un módulo puro** (`src/lib/domain/costeo.ts`): costo por pax por
   pack, precio sugerido, margen a N y **punto de equilibrio por escaneo**
   (N = 1..cupo, primer N con utilidad ≥ 0), que sí ve el escalón. La UI calcula
   en cliente con el mismo módulo; el servidor solo guarda tras
   `limpiarCosteo`, espejo TS del CHECK.
6. **Margen = utilidad ÷ precio, bruto** (misma convención que reportes y
   `gross-up.ts`; no hay markup en el repo), etiquetado "antes de comisiones":
   comisión de agente/embajador y `commission_rate` salen de ese margen y no se
   modelan aquí. El sugerido se redondea a peso **hacia arriba**: nunca por
   debajo del margen objetivo.
7. **El costo de un add-on vive en el costeo** (`doc.addon_costs[key]`), ligado
   por `key` a `services.add_ons`; el add-on público sigue `{key,label,price}`.
   Renombrar un extra cambia su key y el costo huérfano se descarta al guardar.
8. **Costeo a nivel servicio** con pax plan; el margen por salida se **deriva**
   de `seats_taken` con el precio real de esa fecha (`precioDePack` con
   `price_pct` y `pack_price_overrides`). Costear una salida específica queda
   para cuando una salida real cueste distinto (`cost_overrides` en la
   salida, patrón de `pack_price_overrides`).

## Consecuencias

- El admin ve en `/servicios/[id]/costeo`: costo total y por pax, punto de
  equilibrio, utilidad plan, precio sugerido vs actual por pack, margen de cada
  extra y margen estimado de cada salida con sus pasajeros de hoy. "Aplicar
  precios sugeridos" escribe `services.packs` (+ `price` derivado, b046) por una
  action que toca solo esas columnas.
- Un agente (`role='user'`) no llega a la ruta (proxy gatea `/servicios/*`) y,
  si pega por PostgREST con su JWT, recibe cero filas y no puede escribir.
- Un proveedor con `owner_supplier_id` NULL (legado) solo lo costea el
  superadmin; la UI no lo esconde, la RLS lo niega.
- Hueco **preexistente** que este ADR no toca: `services_update` es
  `supplier_id = my_supplier_id()`, no admin ⇒ un agente puede pisar `packs`
  por PostgREST aunque la UI no se lo ofrezca. Queda anotado.
- La lista de unidades y de packs vive duplicada en SQL y en TS (como b057 con
  packs); no hay generación cruzada.
- `updated_at` usa `set_updated_at()` (`now()`): editar en la misma transacción
  en que se creó deja el sello igual; el harness no lo afirma por eso.

## Alternativas descartadas

- **jsonb `costing` en `services` y `supplier_id`+`cost` en `add_ons`** (la
  nota del ROADMAP): filtra el costo al público por `services_read` y
  `get_public_service`. RLS no separa columnas.
- **Tabla de líneas normalizada** (`service_cost_lines`): más RPC y más
  policies para el mismo resultado; el reporte plan-vs-real por proveedor que
  la justificaría no existe aún. Se sube a tabla cuando exista.
- **CxP automática desde el plan** al confirmar salida: mezcla plan con ledger.
  Cuando haya salidas operadas y el plan demuestre ser fiel, se evalúa como
  ADR propio.
- **Autoservicio del prestador** en `/proveedor`: arranque en frío de dos
  lados, y la tarifa es negociada por agencia, no una lista pública.
- **Directorio compartido de proveedores entre agencias**: las tarifas son
  privadas y negociadas; dos agencias del mismo dueño siguen siendo dos filas.
- **USD en tarifas**: ADR-0009, MXN autoritativo. Se anota después si hace falta.
- **Punto de equilibrio por fórmula** `fijos / (precio − variables)`: ignora el
  escalón de vehículo y el cuarto sencillo sobrante.

## Verificación

- `supabase/tests/costeo.sql` (`pnpm hard-test costeo`, **29 aserciones**,
  fixtures propias y revertidas): los CHECK rechazan unidad desconocida, costo
  negativo, pack inventado, `cap` 0, habitación sin `cost_by_pack`, key
  duplicada, costo faltante (NULL), tarifario que no es arreglo, margen 100,
  pax 0, días con decimales, `qty` 0, línea sin proveedor, add-on con costo
  negativo y cabecera sin noches; el **admin de A** lee, escribe y actualiza el
  tarifario de su proveedor y el costeo de su servicio, y **no** el tarifario
  de un proveedor sin dueño; un **agente `user` de A** ve 0 filas y no escribe;
  el **admin de B** ve 0 y no escribe; el **anónimo** no alcanza las tablas;
  el **superadmin** lee todo y escribe el del proveedor sin dueño; borrar
  servicio/proveedor se lleva su costeo/tarifario. **Mutación** hecha el
  2026-09-05: sin `rate_cards_admin_sel` y con `valid_costing` que acepta todo,
  10 aserciones caen.
- `src/lib/domain/costeo.test.ts` (29 casos, vitest): unidades y `cap`
  (15 pax = 1 sprinter, 16 = 2), hospedaje por pack y `null` en pack ausente,
  costo/pax y sugerido con cifras a mano (doble a 16 pax = $2,581.25 ⇒ $3,688 al
  30 %), N = 0 no divide, margen 0 ⇒ sugerido = costo, **equilibrio 15 aunque a
  16 se pierde** (el escalón), equilibrio `null` cuando el precio no cubre lo
  variable, `limpiarTarifario` sufija colisiones y descarta lo inválido,
  `limpiarCosteo` normaliza cabecera y tira add-ons huérfanos.
