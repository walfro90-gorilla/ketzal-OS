# ADR-0042 — Desconectar la cuenta MP de una agencia borra la copia de Ketzal; revocar sigue siendo del vendedor

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** `b092_mp_account_disconnect`
- **Sustituye a:** ninguno (complementa a [ADR-0024](0024-rotacion-de-credenciales-de-terceros.md))
- **Toca:** `ketzal.mp_account_disconnect(uuid)` (nuevo) · `mp_accounts` (sigue
  deny-all) · `system_log` · `/proveedores/[id]` (botón "Desconectar",
  `desconectar-mp.tsx`, `mp-actions.ts`)
- **Relacionadas:** [ADR-0024](0024-rotacion-de-credenciales-de-terceros.md)
  (Reconectar rota, no revoca; se descartó un botón "revocar"),
  [ADR-0016](0016-pagos-solo-mp.md), [ADR-0006](0006-ledger-append-only-rpc-only.md)
  (tabla sensible = una sola puerta de escritura, en la BD)

## Contexto

`mp_accounts` guarda los tokens OAuth de cada agencia y es deny-all: la única
puerta era el callback del OAuth (b053), que hace `upsert` por `supplier_id`.
Con eso una agencia podía **conectar** y **reconectar**, pero nunca **quedar sin
cuenta**. El 2026-09-03, al probar el redirect URI del dominio nuevo, Border
Travels quedó conectada al MP user `479630144`: el mismo de Wanderlust, la
cuenta del fundador. Mientras esa fila existiera, cada venta en línea de Border
haría split hacia esa cuenta. La salida era "reconectar con la correcta", que
exige tener la correcta a la mano y sesión en ella.

ADR-0024 descartó un botón "revocar" porque Ketzal no controla los permisos
del lado de Mercado Pago. Eso sigue siendo cierto y no es lo que se pide aquí:
lo que faltaba es que Ketzal deje de **usar** una cuenta.

## Decisión

**Existe `mp_account_disconnect(p_supplier)`: borra la fila de `mp_accounts`
(tokens incluidos) y la agencia vuelve al modo sin split (depósito a 7 días).**

1. **Mismo guard que `mp_account_status`**: superadmin o admin activo de esa
   agencia, con `coalesce(..., false)`. Un agente (`role='user'`) o el admin de
   otra agencia reciben excepción. El guard vive en el RPC, no en la acción.
2. **Idempotente y verificable**: devuelve `true` si había fila y `false` si no;
   escribe `system_log` (`source='mp_oauth'`, `event='desconectada'`, con
   `supplier_id`, `mp_user_id` y `by`). Una desconexión se puede auditar
   después aunque la fila ya no exista.
3. **La tabla sigue deny-all.** Ninguna policy ni GRANT nuevo sobre
   `mp_accounts`; el RPC es la única puerta de borrado, igual que el callback
   es la única de escritura.
4. **El botón dice lo que hace**: "Ketzal dejará de cobrar a esta cuenta… Esto
   *no* le quita el permiso a Ketzal en Mercado Pago". Confirmación en dos pasos
   dentro de la página (patrón de `EliminarProveedor`). El éxito se ve: la
   tarjeta vuelve a "Conectar mi Mercado Pago".

## Consecuencias

- Una cuenta equivocada se quita en un clic; conectar la correcta es el
  flujo de siempre. Reconectar (upsert) y Desconectar (delete) conviven.
- Los pagos ya creados con el token borrado siguen existiendo en MP; el
  webhook los busca con el token de plataforma y con los tokens de las cuentas
  **conectadas** — uno ya borrado no se prueba. Un pago pendiente de esa
  cuenta al momento de desconectar puede quedar sin confirmar hasta que la
  agencia reconecte. Techo aceptado: hoy no hay operación real.
- Revocar del lado de MP sigue siendo manual y del vendedor (ADR-0024).

## Alternativas descartadas

- **Reconectar con la cuenta correcta y ya.** Exige sesión en la cuenta buena
  ahí mismo; mientras, el dinero de la agencia sigue yendo a la equivocada.
- **Server action con service client** (sin RPC). Duplica el guard en la app,
  y una tabla de credenciales con dos puertas de escritura es exactamente lo
  que ADR-0006 evita en las de dinero. El RPC además se prueba con un `.sql`.
- **Intentar revocar el token en MP desde el botón.** No hay API pública para
  revocar el grant desde la app; prometerlo es la falsa sensación de cierre que
  ADR-0024 ya descartó.

## Verificación

- `supabase/tests/mp_desconectar.sql` (`pnpm hard-test mp_desconectar`): sin
  sesión ⇒ excepción; admin de otra agencia ⇒ excepción y la fila sigue;
  agente de la misma agencia ⇒ excepción; como `authenticated` un `delete`
  directo no borra; admin propio ⇒ `true`, fila fuera y `mp_account_status`
  dice `connected=false`; segunda llamada ⇒ `false` sin excepción; la otra
  agencia no se toca; superadmin ⇒ `true`; queda una línea en `system_log`
  con agencia, MP user y quién. Todo con fixtures propias y revertido.
