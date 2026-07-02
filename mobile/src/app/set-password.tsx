import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Redirect, useRouter } from 'expo-router'
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated'
import { AlertCircle, Check, Lock } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import FloatingInput from '../components/ui/FloatingInput'
import Button from '../components/ui/Button'
import LoadingSplash from '../components/LoadingSplash'
import { errorHaptic, successHaptic } from '../lib/haptics'
import { colors } from '../theme'

// Forced password setup on first login for invited users (web SetPassword port).
const rules = [
  { id: 'len', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'num', label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  {
    id: 'case',
    label: 'Upper & lowercase letters',
    test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
]

export default function SetPassword() {
  const { session, completePasswordSetup } = useApp()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [splash, setSplash] = useState(false)

  if (splash) return <LoadingSplash />
  if (!session) return <Redirect href="/login" />
  if (!session.needsPasswordSetup) return <Redirect href="/(tabs)" />

  const allPass = rules.every((r) => r.test(password))

  const handleSubmit = async () => {
    if (!allPass) {
      setError('Your password does not meet all the requirements yet.')
      errorHaptic()
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      errorHaptic()
      return
    }
    setSubmitting(true)
    const { error: setupError } = await completePasswordSetup(password)
    setSubmitting(false)
    if (setupError) {
      setError(setupError)
      errorHaptic()
      return
    }
    successHaptic()
    setSplash(true)
    setTimeout(() => router.replace('/(tabs)'), 5000)
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
            <Animated.View entering={FadeInDown.duration(400)} className="rounded-2xl bg-white p-6">
              <View className="self-start rounded-full bg-navy-50 p-3">
                <Lock size={22} color={colors.navy800} />
              </View>
              <Text className="mt-4 font-sans-bold text-xl text-slate-900">
                Set your permanent password
              </Text>
              <Text className="mt-1 font-sans text-sm leading-5 text-slate-600">
                Welcome, {session.user.name.split(' ')[0]}. Your temporary credential has been
                verified — choose a permanent password to activate your account.
              </Text>

              <View className="mt-6 gap-4">
                <FloatingInput
                  label="New password"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t)
                    setError('')
                  }}
                  secure
                  autoCapitalize="none"
                  autoComplete="new-password"
                />

                <View className="gap-2" accessibilityLabel="Password requirements">
                  {rules.map((r) => {
                    const ok = r.test(password)
                    return (
                      <View key={r.id} className="flex-row items-center gap-2">
                        {ok ? (
                          <Animated.View entering={ZoomIn.springify().damping(14)}>
                            <View className="h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                              <Check size={12} color="#059669" strokeWidth={3} />
                            </View>
                          </Animated.View>
                        ) : (
                          <View className="h-5 w-5 rounded-full border border-slate-300" />
                        )}
                        <Text
                          className={`font-sans text-sm ${ok ? 'text-emerald-600' : 'text-slate-500'}`}
                        >
                          {r.label}
                        </Text>
                      </View>
                    )
                  })}
                </View>

                <FloatingInput
                  label="Confirm password"
                  value={confirm}
                  onChangeText={(t) => {
                    setConfirm(t)
                    setError('')
                  }}
                  secure
                  autoCapitalize="none"
                  autoComplete="new-password"
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
                  {submitting ? 'Saving…' : 'Activate account'}
                </Button>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
