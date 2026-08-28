# ADR-0012 — Identidad única: `profiles.type` sobre un solo `auth.users`

- Estado: aceptada · Fecha: 2026-07-24/25 (b024–b028) · Sustituye: tabla `marketplace_customers` (eliminada en b025)

## Contexto
El marketplace nació con una tabla `marketplace_customers` aparte para que el
comprador no naciera como agente. Dos tablas de personas = dos RLS, dos
flujos de auth, joins duplicados y bugs de identidad (¿quién es el payee de
una comisión?).

## Decisión
- UNA identidad: `auth.users` + `ketzal.profiles`, con
  **`profiles.type ∈ {agente, viajero, embajador, proveedor}`**.
- `marketplace_customers` se eliminó (b025); el comprador es `profiles` tipo
  `viajero`. El motor de comisiones paga a `profiles` (b026). El proveedor
  entra por magic-link a su portal read-only (b028) — mismo auth.
- Coherencia tipo↔rol se endureció en b058 (entrar a una agencia te hace
  `agente` solo desde viajero/null; un `proveedor` con supplier_id NO se
  vuelve agente).
- Usuarios nuevos nacen pendientes (`active=false`) salvo el flujo de
  comprador; la aprobación es de admin.

## Consecuencias
- Un solo camino de auth (magic link / password / Google) para todas las
  personas; los portales (/embajador, /proveedor, /mis-compras) son vistas
  sobre la misma identidad.
- Cambiar de tipo es UPDATE con guard, no migración de tabla.

## Verificación
`grep marketplace_customers` en `src/` = 0 usos vivos; guards de
`assign_user_agency`/`set_agency_member_role` en la BD.

## Fuentes
`docs/REFACTOR_IDENTIDAD.md`, b024–b028, b058, memoria `modelo-usuarios`.
