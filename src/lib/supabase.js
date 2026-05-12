import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

// Persistencia activada para que la sesión del admin del dashboard sobreviva
// al reload. El form anon de inscripción en / no usa sesión, así que no se
// ve afectado.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})
