import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { AlertCircle, ShieldCheck, Wallet } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import FloatingInput from '../components/ui/FloatingInput'
import Button from '../components/ui/Button'
import LoadingSplash from '../components/LoadingSplash'
import { errorHaptic, successHaptic } from '../lib/haptics'
import { colors } from '../theme'

// Invite-only sign-in (AUTH-5/AUTH-7 parity with the web Login page), followed
// by the ≥5s loading splash before routing into the app.
export default function Login() {
  const { session, signInWithPassword } = useApp()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [splash, setSplash] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)

  const target = !session ? null : session.needsPasswordSetup ? '/set-password' : '/(tabs)'

  // Keep the splash on screen for at least 5 seconds after sign-in.
  useEffect(() => {
    if (!splash) return
    const t = setTimeout(() => setMinElapsed(true), 5000)
    return () => clearTimeout(t)
  }, [splash])

  // Route in once the 5s minimum has passed and the session is resolved.
  useEffect(() => {
    if (splash && minElapsed && target) {
      successHaptic()
      router.replace(target as any)
    }
  }, [splash, minElapsed, target, router])

  // Error shake (mirrors the web's attention cue).
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }))
  const runShake = () => {
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      ),
    )
  }

  if (splash) return <LoadingSplash />

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      errorHaptic()
      runShake()
      return
    }
    setSubmitting(true)
    const { error: authError } = await signInWithPassword(email.trim(), password)
    setSubmitting(false)
    if (authError) {
      setError(
        authError === 'Invalid login credentials'
          ? 'Invalid email or password. Access is by invitation only — contact your administrator if you need an account.'
          : authError,
      )
      errorHaptic()
      runShake()
      return
    }
    setSplash(true) // ≥5s loading screen; the effect routes once ready
  }

  return (
    <View className="flex-1 bg-navy-950">
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="flex-grow justify-center px-6 py-10"
            keyboardShouldPersistTaps="handled"
          >
            {/* Brand */}
            <Animated.View entering={FadeInDown.duration(400)} className="mb-10 items-center">
              <View className="flex-row items-center gap-3">
                <View className="rounded-xl bg-gold-500 p-2.5">
                  <Wallet size={26} color="#ffffff" />
                </View>
                <Text className="font-sans-bold text-2xl text-white">LoanLedger PH</Text>
              </View>
              <Text className="mt-3 text-center font-sans text-sm leading-5 text-navy-200">
                Predictable loan schedules.{'\n'}Transparent disclosures.
              </Text>
            </Animated.View>

            {/* Form card */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(80)}
              style={shakeStyle}
              className="rounded-2xl bg-white p-6"
            >
              <Text className="font-sans-bold text-xl text-slate-900">Sign in</Text>
              <Text className="mt-1 font-sans text-sm text-slate-600">
                Use the credentials from your email invitation.
              </Text>

              <View className="mt-6 gap-4">
                <FloatingInput
                  label="Email address"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t)
                    setError('')
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                />
                <FloatingInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secure
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onSubmitEditing={handleSubmit}
                />
                {error ? (
                  <Animated.View
                    entering={FadeInDown.duration(200)}
                    className="flex-row items-start gap-2 rounded-xl bg-red-50 px-3 py-3"
                  >
                    <AlertCircle size={16} color="#b91c1c" style={{ marginTop: 1 }} />
                    <Text className="flex-1 font-sans text-sm leading-5 text-red-700">{error}</Text>
                  </Animated.View>
                ) : null}
                <Button onPress={handleSubmit} loading={submitting} disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(400).delay(160)}
              className="mt-8 flex-row items-center justify-center gap-2"
            >
              <ShieldCheck size={15} color={colors.navy300} />
              <Text className="font-sans text-xs text-navy-300">
                Invite-only access. Public registration is disabled.
              </Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
