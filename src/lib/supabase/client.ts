import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/db/database.types'

export function createClient() {
  return createBrowserClient<Database, 'ketzal'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'ketzal' } }
  )
}
