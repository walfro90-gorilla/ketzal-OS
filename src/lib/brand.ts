import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * URL del logo oficial configurado (o null si no se ha subido → la marca cae al
 * SVG por defecto). Vía RPC `get_brand_logo` (SECURITY DEFINER, anon+auth) para
 * que funcione también en páginas anónimas (login, vitrina). Cacheada por request.
 */
export const getBrandLogo = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_brand_logo' as never)
  if (error) return null
  return (data as string | null) ?? null
})
