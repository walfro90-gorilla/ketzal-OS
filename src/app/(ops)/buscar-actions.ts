'use server'

import { createClient } from '@/lib/supabase/server'

export type ResultadoBusqueda = {
  type: 'cliente' | 'venta' | 'cotizacion' | 'servicio' | 'proveedor'
  id: string
  label: string
  sublabel: string
  href: string
}

/**
 * Buscador global (paleta de comandos). Delega en el RPC `global_search`
 * (SECURITY INVOKER: la RLS acota a lo que el agente puede ver). Devuelve
 * hasta ~6 resultados por tipo, agrupados. Cadena < 2 chars → vacío.
 */
export async function buscarGlobal(q: string): Promise<ResultadoBusqueda[]> {
  const query = q.trim()
  if (query.length < 2) return []

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.rpc('global_search', { p_q: query })
  if (error) return []

  return (data ?? []) as unknown as ResultadoBusqueda[]
}
