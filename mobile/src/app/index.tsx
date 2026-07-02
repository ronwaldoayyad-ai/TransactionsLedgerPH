import { View } from 'react-native'
import { Redirect } from 'expo-router'
import { useApp } from '../context/AppContext'
import { colors } from '../theme'

// Auth gate. Restored sessions route instantly — the 5s splash only plays for
// a sign-in the user just initiated (web Login parity).
export default function Index() {
  const { session, authLoading } = useApp()

  if (authLoading) return <View style={{ flex: 1, backgroundColor: colors.navy950 }} />
  if (!session) return <Redirect href="/login" />
  if (session.needsPasswordSetup) return <Redirect href="/set-password" />
  return <Redirect href="/(tabs)" />
}
