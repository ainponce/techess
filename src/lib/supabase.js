import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

// No auth in this app — disable session persistence so we don't touch
// localStorage for something we never use.
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
