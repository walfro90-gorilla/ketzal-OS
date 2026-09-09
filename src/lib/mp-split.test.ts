import { describe, it, expect } from 'vitest'
import { mismaCuentaMp } from './mp-split'

// ADR-0062: el marketplace no se cobra `application_fee` a sí mismo (MP 2059).
// El punto de decisión es este predicado; el guard de resolverSplitMp lo usa
// para caer a cobro directo cuando vendedor == plataforma.
describe('mismaCuentaMp', () => {
  it('misma cuenta MP aunque el tipo difiera (number vs string) ⇒ true', () => {
    expect(mismaCuentaMp('479630144', 479630144)).toBe(true)
    expect(mismaCuentaMp(479630144, '479630144')).toBe(true)
    expect(mismaCuentaMp('479630144', '479630144')).toBe(true)
  })
  it('cuentas distintas ⇒ false (split con application_fee normal)', () => {
    expect(mismaCuentaMp('479630144', '999999')).toBe(false)
    expect(mismaCuentaMp(1, 2)).toBe(false)
  })
  it('null/undefined ⇒ false (no se puede afirmar mismo dueño)', () => {
    expect(mismaCuentaMp(null, '1')).toBe(false)
    expect(mismaCuentaMp('1', undefined)).toBe(false)
    expect(mismaCuentaMp(null, null)).toBe(false)
    expect(mismaCuentaMp(undefined, undefined)).toBe(false)
  })
})
