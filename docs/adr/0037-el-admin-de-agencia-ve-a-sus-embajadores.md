# ADR-0037 — Un RPC que niega devolviendo lista vacía es un bug que nadie reporta

- **Fecha:** 2026-09-02
- **Estado:** aceptada
- **Amplía:** [ADR-0004](0004-tenancy-rls-por-agencia.md) ·
  [ADR-0021](0021-embajadores-los-paga-quien-recluta.md)
- **Contexto de código:**
  `db/proposed/b089_list_ambassadors_alcance_agencia.sql` ·
  `src/app/(ops)/comisiones/page.tsx` ·
  `src/app/(ops)/gastos/nuevo/page.tsx`
- **Verificación:** `pnpm hard-test list_ambassadors_alcance` (11/11) —
  `supabase/tests/list_ambassadors_alcance.sql` afirma, suplantando por claim de
  JWT: el superadmin ve a los 3 embajadores del harness (caso 1); el admin de la
  agencia A ve al suyo (caso 2, **el caso que falla contra la versión anterior**)
  y **no** ve al de B (caso 3) ni al directo de Ketzal mientras no le haya
  vendido (caso 4); la fila trae `supplier_id` y vale `ag_a` (caso 5); un
  `booking` en `draft` con `?ref` **no** mete al embajador (caso 6) y uno en
  `reserved` **sí** (caso 7); y devuelven `[]` el agente raso (8), el viajero
  (9), la cuenta inactiva con rol admin (10) y el anónimo (11).

## Contexto

`ketzal.list_ambassadors()` abría con:

```sql
if not ketzal.is_superadmin() then return '[]'::jsonb; end if;
```

Un admin de agencia no recibía un error: recibía **una lista vacía**. Y los tres
llamadores tratan `[]` como *«no hay embajadores»*, no como *«no tienes
permiso»*. El resultado, medido contra la BD viva:

- **`/comisiones` → "Accesos" salía vacío.** El admin no podía reemitirle la
  contraseña a **sus propios** embajadores — exactamente lo contrario de lo que
  decidió m005 («quien recluta también entrega el acceso, si no cada alta vuelve
  a pasar por el fundador»).
- **`/gastos/nuevo` → el selector de embajador salía vacío.** No había forma de
  registrar a mano el pago de una comisión.
- **`/dashboard`** no se veía afectado: esa llamada ya vive dentro de un
  `if (esSuperadmin)`.

Los dos embajadores que existen hoy son directos de Ketzal (`supplier_id` null)
y ninguna agencia había reclutado a nadie, así que **el hueco nunca produjo una
queja**. Salió al rediseñar la página, no al usarla.

Un guard que niega lanzando produce un reporte de bug el primer día. Un guard
que niega devolviendo la lista vacía produce una pantalla que parece funcionar y
está mintiendo — la misma familia de fallo que ADR-0023 (el harness que se
apagaba en silencio al borrarle su cuenta) y que ADR-0029 (la atribución que
fallaba sin dejar rastro hasta que existió `referral_misses`).

## Decisión

**`list_ambassadors()` acota por tenencia en vez de negar por rol**, con el
mismo criterio que ya usa `corte_embajadores`:

| Quién | Qué ve |
|---|---|
| superadmin | todos los embajadores |
| admin de agencia | los **suyos** (`profiles.supplier_id` = su agencia) **∪** los que ya le **vendieron** (`bookings.ambassador_id` con `selling_supplier_id` suyo y estado `reserved`/`confirmed`/`paid`) |
| cualquier otro (agente raso, viajero, cuenta inactiva, anónimo) | `[]` |

El segundo conjunto no es hipotético: con el modelo sin límite de
[ADR-0021](0021-embajadores-los-paga-quien-recluta.md) un embajador de otra agencia —o directo
de Ketzal— puede vender el viaje de una agencia, y entonces **esa agencia le
debe dinero** y necesita poder nombrarlo al registrar el gasto. El filtro de
estado excluye la cotización abandonada con `?ref`: un `draft` no convierte a
nadie en beneficiario.

**La fila devuelve `supplier_id`.** No es decoración: el guard de
`regenerarAccesoEmbajador` exige que el embajador sea de la agencia del admin,
así que ofrecerle reemitir el acceso de uno que solo le vendió sería un botón
que siempre falla. La UI de `/comisiones` usa `supplier_id` para separar
*«a quién administro»* (accesos, tarifa por servicio, quién recluta) de
*«a quién le debo»*.

**Se conserva el contrato silencioso** (`[]` en vez de excepción) porque los
tres llamadores ya lo asumen y cambiarlo a `raise` los rompería a los tres. Lo
que cambia es **a quién le toca el `[]`**.

De paso, `/comisiones` deja de pedir el catálogo de `services` solo para el
superadmin: la tarifa de embajador **por servicio** vive en la pestaña del
admin, y la RLS de `services` ya lo acota a lo suyo.

## Alternativas descartadas

- **Abrir la función a todos los embajadores para cualquier admin.** Rompe
  ADR-0004: le entrega a una agencia los nombres y códigos de referido de los
  embajadores de otra.
- **Cambiar el `[]` por `raise exception 'Sin permiso'`.** Más honesto en
  aislamiento, pero los tres llamadores hacen `data ?? []` y ninguno muestra el
  error: el usuario vería lo mismo y además se rompería `/dashboard`, que llama
  al RPC dentro de un `Promise.all`.
- **Un RPC nuevo `list_ambassadors_for_agency`.** Dos funciones para el mismo
  concepto, y el llamador eligiendo cuál — es decir, el mismo hueco esperando a
  que alguien elija mal. Sobre-ingeniería (ADR-0003).

## Consecuencias

- Un admin de agencia ya puede reclutar, entregar accesos y pagarle a sus
  embajadores sin pasar por el fundador. Era el requisito de m005 y llevaba
  desde b026 sin cumplirse.
- El alcance queda atado a una prueba ejecutable (ADR-0034): si alguien vuelve a
  angostar la función, el caso 2 truena.
- Queda vivo un hueco menor y consciente: si un embajador ajeno le vende a una
  agencia, el admin lo ve en el selector de gastos pero **no** puede reemitirle
  el acceso — correcto, no es suyo. La UI no le ofrece el botón.
