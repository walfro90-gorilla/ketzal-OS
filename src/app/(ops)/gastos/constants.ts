// Constantes y tipos compartidos de Gastos (F2).
//
// IMPORTANTE: viven aquí y NO en actions.ts. `actions.ts` lleva la directiva
// 'use server', y Next.js trata TODOS los exports de un módulo 'use server'
// como referencias a server actions: exportar un valor (p. ej. este array) y
// consumirlo desde un componente cliente lo entrega como un proxy de acción,
// no como el array real ⇒ `CATEGORIAS.map is not a function` en runtime.
// Un módulo normal (sin la directiva) exporta el valor tal cual.

export const CATEGORIAS = [
  'operacion',
  'transporte',
  'hospedaje',
  'alimentos',
  'mayorista',
  'marketing',
  'otro',
] as const
export type CategoriaGasto = (typeof CATEGORIAS)[number]

export type GastoInput = {
  concept: string
  category: string
  amount: number
  method?: string
  spent_at: string
  provider_supplier_id?: string | null
  booking_id?: string | null
  notes?: string
}
