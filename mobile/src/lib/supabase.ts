import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

// Expo inlines these public variables. Never use a service-role/server key.
// An unconfigured native build must not silently connect to production.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_PUBLIC_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL) ||
    !SUPABASE_PUBLIC_KEY || !SUPABASE_PUBLIC_KEY.startsWith('sb_publishable_')) {
  throw new Error('Configure the native app with its Supabase URL and publishable key before building.')
}

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
