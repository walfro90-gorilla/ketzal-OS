import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ADR-0053: contenido editorial por destino, editable desde el panel. Se lee por
// RPC (SECURITY DEFINER, anon) y NO por la tabla: el visitante nunca toca
// `ketzal.destinos`, cuya RLS es solo-superadmin. El RPC además filtra por
// `publicado`, así que un borrador no se escapa a la vitrina.

export type DestinoContenido = {
  slug: string
  nombre: string
  estado: string | null
  pais: string
  lat: number | null
  lng: number | null
  ubicacion: string | null
  como_llegar: string | null
  por_que: string | null
  cuando_ir: string | null
  que_visitar: string[]
}

export const listDestinosPublicos = cache(async (): Promise<DestinoContenido[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_destinos_publicos' as never)
  if (error || data == null) return []
  return data as unknown as DestinoContenido[]
})

/** Mapa slug → contenido, para no recorrer la lista por cada destino. */
export const contenidoPorSlug = cache(async (): Promise<Map<string, DestinoContenido>> => {
  const filas = await listDestinosPublicos()
  return new Map(filas.map((d) => [d.slug, d]))
})

/** ¿Tiene algo que valga la pena pintar? Una fila vacía no debe abrir sección. */
export function tieneContenido(d: DestinoContenido | undefined | null): boolean {
  if (!d) return false
  return Boolean(
    d.ubicacion || d.como_llegar || d.por_que || d.cuando_ir || (d.que_visitar?.length ?? 0) > 0
  )
}
