import { createClient } from '@supabase/supabase-js'

// ============================================================
//  SUPABASE CONNECTION
//
//  Replace the two values below with your own from the
//  Supabase dashboard:  Project Settings → API
//
//  1) SUPABASE_URL — your project's BASE url only.
//     ⚠ Do NOT include "/rest/v1/" — the client adds it itself.
//
//  2) SUPABASE_PUBLIC_KEY — your publishable (anon) key.
//     Safe to ship in the front-end; never put the secret
//     (service_role) key here.
// ============================================================

// 👉 PASTE YOUR PROJECT URL HERE:
const SUPABASE_URL = 'https://ckbpdrucyogsjatnmvvu.supabase.co'

// 👉 PASTE YOUR PUBLIC (publishable/anon) KEY HERE:
const SUPABASE_PUBLIC_KEY = 'sb_publishable_J4Ir9Ww2QNoZSlmv8ALfig_Eej1BXWb'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)
