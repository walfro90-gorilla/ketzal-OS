# ADR-0005 — El dinero SIEMPRE se deriva; nunca una columna mutable

- Estado: aceptada · Fecha: 2026-07-08 · Sustituye: —
- Alcance: saldos, precios "desde", crédito del viajero, cualquier monto agregado

## Contexto
Un campo `balance` mutable diverge tarde o temprano del historial de pagos, y
si el cliente puede escribirlo por PostgREST, es dinero inventable (pasó con
`credits`: saldo derivado de una columna que era escribible ⇒ crédito
gastable infinitas veces; cerrado en b051).

## Decisión
- Saldo de una venta = `total − Σ(pagos COMPLETED) + Σ(reembolsos)` —
  calculado siempre (vista `bookings_with_balance`), jamás almacenado suelto.
- Saldo de un crédito = derivado de `payments.credit_id`.
- Precio "desde" de un servicio = derivado del pack más barato (b046); el
  campo manual se eliminó.
- USD mostrado = derivado de MXN ÷ TC (ver ADR-0009).
- **Corolario:** si un monto se deriva de una columna, esa columna NO puede
  ser escribible por el cliente.

## Consecuencias
- Cero jobs de reconciliación; el número correcto sale solo del ledger.
- Las consultas pagan el Σ en lectura — irrelevante al volumen actual y
  indexable si algún día pesa.
- `verificar_invariantes()` puede afirmar coherencia global en un query.

## Verificación
`select ketzal.verificar_invariantes()` = 0 violaciones; no existe columna
`balance`/`saldo` mutable en tablas de negocio.

## Fuentes
Regla de oro #2, vista `bookings_with_balance`, b046 (precio derivado), b051
(hardening de credits), `src/lib/domain/balance.ts` (misma regla en TS, 8 tests).
