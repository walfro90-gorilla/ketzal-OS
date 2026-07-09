import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/db/database.types'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database, 'ketzal'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'ketzal' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component: cookies can only be set in
            // Server Actions / Route Handlers. Safe to ignore if middleware
            // refreshes sessions.
          }
        },
      },
    }
  )
}
