# ADR-0030 — A una persona se le paga registrando el gasto; el ledger lo espeja

- Estado: aceptada · Fecha: 2026-09-01 · Sustituye: —
- Complementa: [ADR-0011](0011-ledger-espeja-no-recrea.md) (esto es aplicarlo donde no se había aplicado)
- Alcance: `expenses`, `tg_ledger_mirror_expense`, `settle_ledger`,
  `my_ambassador_earnings`, `ambassador_payables_summary` (b081)

## Contexto

Antes de construir el corte quincenal de comisiones había que resolver por dónde
se paga. Y había **dos puertas que no se veían entre sí**:

| Camino | Qué mueve | Qué deja mintiendo |
|---|---|---|
| `/gastos` → `expenses` category='embajador' | CxP y el "pagado" del portal | el saldo sigue **vivo en el ledger** |
| `/cuentas` → `settle_ledger` | el ledger | la CxP y el portal siguen mostrando **saldo por cobrar** |

Un corte quincenal que lea una fuente mientras alguien liquidó por la otra
**paga dos veces**. Y hoy, con cualquiera de las dos, una pantalla miente.

## Decisión

No hubo que decidir nada nuevo: **ADR-0011 ya lo había decidido** y este camino
era la excepción que lo rompía.

> El ledger **espeja, no recrea**: triggers sobre los hechos generan los
> asientos. No se insertan asientos "a mano" que re-cuenten un hecho ya contado
> (doble contabilidad).

`settle_ledger` sobre un embajador es literalmente un asiento puesto a mano que
re-cuenta un pago que ya vive en `expenses`.

1. **El hecho es el gasto.** Pagarle a una persona = registrarlo en `/gastos`.
2. **`tg_ledger_mirror_expense`** postea la liquidación al ledger solo — gemelo
   exacto de `tg_ledger_mirror_commission`: el devengo puso `+persona / −agencia`,
   el pago pone lo contrario y el grupo cierra en 0. Un `reverso` invierte los signos.
3. **`settle_ledger` rechaza `embajador` y `agente`**, con un mensaje que dice a
   dónde ir, igual que ya rechazaba `viajero`.

Un solo acto mueve las tres pantallas. **No se puede pagar doble porque solo hay
una puerta.**

### `agencia` no entra, y es a propósito

Su saldo en el ledger es el **corte de plataforma** (Ketzal ↔ agencia), mientras
que `expenses` category='mayorista' es **pagarle a un proveedor**. Son deudas
distintas, no hay choque, y `settle_ledger` sigue siendo su camino legítimo.

### Categoría `agente`

`expenses` no tenía cómo registrar el pago a un agente. Desde m010 el portal de
embajador **también lo usan los agentes** con código de referido, y su `pagado`
salía solo de `category='embajador'`: a un agente pagado por `settle_ledger` su
portal le decía **"pagado $0" para siempre**, aunque ya hubiera cobrado. Se abre
`category='agente'` (exige `provider_profile_id`, igual que 'embajador') y los
dos resúmenes leen `category in ('embajador','agente')`.

## Alternativas descartadas

- **Que `settle_ledger` fuera el camino canónico y el portal leyera del ledger.**
  Obliga a reescribir `my_ambassador_earnings` y `ambassador_payables_summary`, y
  deja el pago sin comprobante en `/gastos` — que es donde el operador espera ver
  a dónde se fue el dinero.
- **Dejar las dos puertas y sumar un guard en el corte.** Mueve el problema al
  consumidor: cada reporte futuro tendría que acordarse de mirar las dos fuentes.
  El bug vuelve en cuanto alguien escriba el siguiente.

## Lo que esto NO resuelve

- **Un reembolso sin cancelación sigue sin reversar la comisión** (ADR-0029). El
  corte tiene que filtrar por pagos netos > 0.
- **No hay concepto de corte/quincena todavía**: esto deja el riel listo, no el
  proceso. Es lo siguiente.
