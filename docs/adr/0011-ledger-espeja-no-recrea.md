# ADR-0011 — Ledger balance-0: ESPEJA hechos, no los recrea; registro ≠ custodia

- Estado: aceptada · Fecha: 2026-08-04 (b052) / 2026-08-19 (b056) · Sustituye: —
- Alcance: `ledger_entries`, `ledger_post`, triggers espejo, `settle_ledger`, `/cuentas`

## Contexto
Ketzal devengaba comisiones pero nunca las cobraba; hacía falta contabilidad
por actor (plataforma/agencia/embajador/agente/viajero) sin duplicar la
verdad que ya vive en `commission_lines`, `credits` y `payments`.

## Decisión
- **Doble partida**: cada grupo de asientos suma 0, validado en
  `ledger_post` — ÚNICA vía de escritura; tabla append-only deny-all.
- **El ledger espeja, no recrea**: triggers sobre los hechos
  (`commission_lines`, emisión/canje de `credits`) generan los asientos. No
  se insertan asientos "a mano" que re-cuenten un hecho ya contado (doble
  contabilidad).
- **Registro ≠ custodia**: Ketzal anota deudas y saldos; el dinero se mueve
  por MP Split / SPEI / efectivo. `settle_ledger` **rechaza cuentas de
  viajero**: el crédito es redimible en Ketzal, NO retirable en efectivo
  (línea roja fintech/CNBV que se decidió no pisar).
- Pagos a mayorista = filas de `expenses` categoría `mayorista` (un solo
  ledger de egresos; NO tabla `supplier_payments`).

## Consecuencias
- La deuda inter-agencias por canje cruzado sale derivada, sin reporte
  aparte.
- Suma global del ledger = $0.00 SIEMPRE; cualquier desviación es bug.
- Hueco documentado: cliente sin `marketplace_customer_id` no se espeja en
  /cuentas (WARNING en log, crédito sigue válido).

## Verificación
`select sum(...)` global de `ledger_entries` = 0; `settle_ledger('viajero')`
falla; `verificar_invariantes()` 0.

## Fuentes
`docs/FINANZAS_PLATAFORMA.md`, b052–b053, b056, `docs/COMISIONES_MOTOR.md`
(b019+, b054 agente).
