import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Stack, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Camera, LogOut } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import FloatingInput from '../components/ui/FloatingInput'
import Toast, { ToastData } from '../components/ui/Toast'
import { errorHaptic, successHaptic, warningHaptic } from '../lib/haptics'
import { fonts } from '../theme'

// Borrower self-service profile (web profile modal port): name/nickname/phone
// edits via rpc update_my_profile, avatar upload, sign out. Email is
// admin-managed and shown read-only.
export default function Profile() {
  const { session, updateMyProfile, setMyAvatar, signOut } = useApp()
  const router = useRouter()
  const me = session?.user

  const [firstName, setFirstName] = useState(me?.firstName ?? '')
  const [lastName, setLastName] = useState(me?.lastName ?? '')
  const [nickname, setNickname] = useState(me?.nickname ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  if (!me) return null

  const showToast = (t: Omit<ToastData, 'id'>) => {
    setToast({ ...t, id: Date.now() })
    setTimeout(() => setToast(null), 4000)
  }

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    const a = res.assets?.[0]
    if (!a) return
    setAvatarBusy(true)
    const { error } = await setMyAvatar({
      uri: a.uri,
      name: a.fileName ?? `avatar-${Date.now()}.jpg`,
      mimeType: a.mimeType,
    })
    setAvatarBusy(false)
    if (error) {
      errorHaptic()
      showToast({ variant: 'error', title: 'Photo not saved', message: error })
    } else {
      successHaptic()
      showToast({ variant: 'success', title: 'Photo updated', message: 'Looking sharp!' })
    }
  }

  const save = async () => {
    setSaving(true)
    const { error } = await updateMyProfile({ firstName, lastName, nickname, phone })
    setSaving(false)
    if (error) {
      errorHaptic()
      showToast({ variant: 'error', title: 'Not saved', message: error })
    } else {
      successHaptic()
      showToast({ variant: 'success', title: 'Profile saved', message: 'Your details are up to date.' })
    }
  }

  const confirmSignOut = () => {
    warningHaptic()
    Alert.alert('Sign out?', 'You will need your credentials to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/login')
        },
      },
    ])
  }

  return (
    <View className="flex-1 bg-[#f3f6fb]">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'My Profile',
          presentation: 'modal',
          headerTitleStyle: { fontFamily: fonts.sansSemibold },
        }}
      />
      {toast && (
        <View className="absolute left-4 right-4 top-4 z-50">
          <Toast toast={toast} />
        </View>
      )}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <Animated.View entering={FadeInDown.duration(400)} className="items-center py-4">
            <Pressable onPress={pickAvatar} accessibilityLabel="Change profile photo">
              <Avatar name={me.name} url={me.avatarUrl} size={96} />
              <View className="absolute -bottom-1 -right-1 rounded-full border-2 border-[#f3f6fb] bg-navy-800 p-2">
                {avatarBusy ? (
                  <ActivityIndicator size={14} color="#ffffff" />
                ) : (
                  <Camera size={14} color="#ffffff" />
                )}
              </View>
            </Pressable>
            <Text className="mt-3 font-sans-bold text-lg text-slate-900">{me.name}</Text>
            <Text className="font-sans text-xs text-slate-500">Borrower · {me.email}</Text>
          </Animated.View>

          {/* Details */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(80)}
            className="gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"
          >
            <FloatingInput label="First name" value={firstName} onChangeText={setFirstName} />
            <FloatingInput label="Last name" value={lastName} onChangeText={setLastName} />
            <FloatingInput
              label="Nickname (shown around the app)"
              value={nickname}
              onChangeText={setNickname}
            />
            <FloatingInput
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Button onPress={save} loading={saving} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </Animated.View>

          {/* Sign out */}
          <Animated.View entering={FadeInDown.duration(400).delay(140)}>
            <Button variant="danger" onPress={confirmSignOut} icon={<LogOut size={15} color="#ffffff" />}>
              Sign out
            </Button>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
