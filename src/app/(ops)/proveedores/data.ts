import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ADR-0057: ciudades ya capturadas, para sugerirlas al llenar un proveedor. No
// es un catálogo cerrado —las ciudades son infinitas— sino un empujón a reusar:
// que la segunda persona escoja "Ciudad Juárez" en vez de teclear "Cd. Juarez"
// y partir el reporte en dos.
export const ciudadesConocidas = cache(async (): Promise<string[]> => {
  const supabase = await createClient()
  // `city`/`country` en suppliers son columnas nuevas (b098) y aún no están en
  // los tipos generados ⇒ cast, convención del repo.
  const [{ data: prov }, { data: svc }] = await Promise.all([
    supabase.from('suppliers').select('city' as never),
    supabase.from('services').select('city_from, city_to'),
  ])
  const todas = [
    ...((prov ?? []) as unknown as { city: string | null }[]).map((p) => p.city),
    ...((svc ?? []) as unknown as { city_from: string | null; city_to: string | null }[]).flatMap(
      (s) => [s.city_from, s.city_to]
    ),
  ]
  return [...new Set(todas.map((c) => c?.trim()).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b, 'es')
  )
})
