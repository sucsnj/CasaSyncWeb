import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Cliente Supabase com a SERVICE ROLE KEY.
 * SOMENTE para uso em Server Actions / Route Handlers / Server Components.
 * NUNCA importar este arquivo em código client-side.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada. Defina a variável de ambiente (server-only) no .env.local.'
    )
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}