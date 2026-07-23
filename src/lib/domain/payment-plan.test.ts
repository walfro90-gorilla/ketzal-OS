import { describe, it, expect } from 'vitest'
import {
  sumaMontos,
  saldosCorridos,
  conSaldoCorrido,
  planCuadra,
  type PlanMonto,
} from './payment-plan'

// Plan de pagos: enganche + N abonos. El saldo corrido y el invariante suma=total
// son lo que corre en TS (la aritmética del calendario vive en el RPC).

// Enganche 1000 + 2 abonos de 2000 = 5000 (un abono llega como string, como jsonb).
const plan: PlanMonto[] = [{ amount: 1000 }, { amount: '2000' }, { amount: 2000 }]

describe('sumaMontos', () => {
  it('suma tratando string y number igual', () => {
    expect(sumaMontos(plan)).toBe(5000)
  })
  it('vacío ⇒ 0', () => {
    expect(sumaMontos([])).toBe(0)
  })
})

describe('saldosCorridos', () => {
  it('saldo tras cada fila = total − acumulado', () => {
    expect(saldosCorridos(plan, 5000)).toEqual([4000, 2000, 0])
  })
  it('vacío ⇒ []', () => {
    expect(saldosCorridos([], 5000)).toEqual([])
  })
})

describe('conSaldoCorrido', () => {
  it('adjunta el saldo conservando los demás campos', () => {
    const items = [
      { seq: 0, kind: 'enganche', amount: 1000 },
      { seq: 1, kind: 'abono', amount: 4000 },
    ]
    const rows = conSaldoCorrido(items, 5000)
    expect(rows).toEqual([
      { seq: 0, kind: 'enganche', amount: 1000, saldo: 4000 },
      { seq: 1, kind: 'abono', amount: 4000, saldo: 0 },
    ])
  })
})

describe('planCuadra (invariante suma = total)', () => {
  it('cuadra cuando los montos suman el total', () => {
    expect(planCuadra(plan, 5000)).toBe(true)
  })
  it('no cuadra si falta o sobra un centavo', () => {
    expect(planCuadra(plan, 5000.01)).toBe(false)
    expect(planCuadra([{ amount: 4999.99 }], 5000)).toBe(false)
  })
  it('tolera ruido de centavos (enganche 20% + 4 abonos)', () => {
    // 5000: enganche 1000 + 4 abonos de 1000 → suma exacta
    const p: PlanMonto[] = [
      { amount: 1000 },
      { amount: 1000 },
      { amount: 1000 },
      { amount: 1000 },
      { amount: 1000 },
    ]
    expect(planCuadra(p, 5000)).toBe(true)
  })
  it('plan vacío solo cuadra con total 0', () => {
    expect(planCuadra([], 0)).toBe(true)
    expect(planCuadra([], 5000)).toBe(false)
  })
})
