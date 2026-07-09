import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'

/**
 * Cliente Supabase con SERVICE ROLE. Solo para código de servidor sin sesión de
 * usuario (webhooks, tareas). NUNCA se importa en un Client Component.
 * Requiere SUPABASE_SERVICE_ROLE_KEY (variable de entorno secreta en Vercel).
 */
export function createServiceClient() {
  return createClient<Database, 'ketzal'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'ketzal' }, auth: { persistSession: false } }
  )
}
