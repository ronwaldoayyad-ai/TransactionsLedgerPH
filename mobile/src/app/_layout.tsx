import '../global.css'
import { useEffect } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import {
  IBMPlexSans_300Light,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans'
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono'
import { AppProvider } from '../context/AppContext'
import { MessagesProvider } from '../context/MessagesContext'
import { AnnouncementsProvider } from '../context/AnnouncementsContext'
import AnnouncementOverlays from '../components/announcements/AnnouncementOverlays'
import { colors } from '../theme'

// Hold the native splash until fonts are ready — no flash of fallback text.
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_300Light,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded])

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.navy950 }} />

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <MessagesProvider>
          <AnnouncementsProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.screenBg } }}
            >
              <Stack.Screen name="login" options={{ contentStyle: { backgroundColor: colors.navy950 } }} />
              <Stack.Screen
                name="set-password"
                options={{ contentStyle: { backgroundColor: colors.navy950 } }}
              />
              <Stack.Screen name="(tabs)" />
            </Stack>
            <AnnouncementOverlays />
          </AnnouncementsProvider>
        </MessagesProvider>
      </AppProvider>
    </GestureHandlerRootView>
  )
}
