# ADR-0007 — Folios atómicos por contador (agencia, serie); nunca `count(*)+1`

- Estado: aceptada · Fecha: 2026-07-08 (recibos) / 2026-07-21 (genérico F1) · Sustituye: —
- Alcance: `receipt_counters`, `doc_counters`, todo documento foliado nuevo (recibo, COT-n, voucher)

## Contexto
`count(*)+1` bajo concurrencia duplica folios; un folio duplicado en un
recibo de dinero es un problema legal/contable, no cosmético.

## Decisión
- Cada serie de folios vive en una tabla contador por `(scope, serie)` con
  incremento atómico bajo row-lock (`insert … on conflict do nothing` + `+1`).
- `next_receipt_folio` (recibos) y `next_doc_folio` (genérico: cotización
  COT-n, voucher) son la ÚNICA vía; el scope es la agencia o el `auth.uid`
  del agente libre, **sin FK** (el contador sobrevive a lo que cuente).
- Documentos foliados nuevos REUSAN `next_doc_folio` con serie nueva — no se
  inventa otro mecanismo.

## Consecuencias
- Folios consecutivos por agencia sin huecos por carrera.
- Los contadores son parte del ledger inmutable (no_mutar + REVOKE): no se
  reinician desde el cliente; un reset es operación administrativa explícita.

## Verificación
Check `folio_cot_duplicado` dentro de `verificar_invariantes()`; hard-test de
folios consecutivos por agencia (F1).

## Fuentes
Regla de oro #4, `db/proposed/007_folio_cotizacion.sql`, F1 en
`docs/PLAN_COMPETIDOR.md`, F4 vouchers (`012_vouchers.sql`).
