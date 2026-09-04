import { describe, expect, it } from 'vitest'
import { cn } from './utils'

// tailwind-merge resuelve conflictos por grupo. Los tokens de la home
// (ADR-0046) tienen que caer en el grupo correcto: tamaño vs color.
describe('cn con los tokens de la home', () => {
  it('tamaño y color de texto conviven', () => {
    expect(cn('text-lead', 'text-mid')).toBe('text-lead text-mid')
    expect(cn('text-small', 'text-low')).toBe('text-small text-low')
    expect(cn('text-display-lg', 'text-hi', 'lg:text-display-xl')).toBe('text-display-lg text-hi lg:text-display-xl')
  })

  it('dos tamaños sí compiten (gana el último)', () => {
    expect(cn('text-sm', 'text-lead')).toBe('text-lead')
    expect(cn('text-display-md', 'text-heading')).toBe('text-heading')
  })

  it('dos colores sí compiten (gana el último)', () => {
    expect(cn('text-mid', 'text-hi')).toBe('text-hi')
    expect(cn('bg-jade-600', 'bg-jade-500')).toBe('bg-jade-500')
    expect(cn('border-hairline', 'border-hairline-strong')).toBe('border-hairline-strong')
  })

  it('radio y espaciado por rol resuelven contra los de Tailwind', () => {
    expect(cn('rounded-lg', 'rounded-pill')).toBe('rounded-pill')
    expect(cn('py-14', 'py-section')).toBe('py-section')
  })

  it('lo de siempre sigue igual', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-muted-foreground')).toBe('text-sm text-muted-foreground')
  })
})
