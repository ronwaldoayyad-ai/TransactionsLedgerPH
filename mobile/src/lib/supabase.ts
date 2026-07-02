import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

// Same Supabase project as the web app (loan-amortization-app/src/supabaseClient.js).
// The publishable key is safe to ship in the client bundle; RLS scopes all data.
// EXPO_PUBLIC_* overrides allow pointing at another project without code edits.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://ckbpdrucyogsjatnmvvu.supabase.co'
const SUPABASE_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_J4Ir9Ww2QNoZSlmv8ALfig_Eej1BXWb'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no browser URL in React Native
  },
})

// Supabase's documented React Native pattern: refresh auth tokens only while
// the app is foregrounded (timers don't fire reliably in the background).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
