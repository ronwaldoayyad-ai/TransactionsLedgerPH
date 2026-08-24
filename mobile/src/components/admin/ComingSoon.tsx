import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Hammer } from 'lucide-react-native'
import PressableScale from '../ui/PressableScale'
import { colors } from '../../theme'

// Temporary scaffold for admin screens still being ported from the web app.
// Keeps the shell navigable and the route registered while the real screen
// lands. Shows a header so the user can see which destination they reached.
export default function ComingSoon({
  title,
  subtitle,
  note,
}: {
  title: string
  subtitle?: string
  note?: string
}) {
  const router = useRouter()
  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <View className="flex-row items-center gap-2 px-3 pb-2 pt-1">
        {router.canGoBack() ? (
          <PressableScale onPress={() => router.back()} accessibilityLabel="Go back" className="p-1">
            <ChevronLeft size={24} color={colors.navy800} />
          </PressableScale>
        ) : null}
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-xl text-slate-900" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="font-sans text-xs text-slate-500" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerClassName="flex-1 items-center justify-center gap-3 p-8">
        <View className="rounded-2xl bg-navy-50 p-4">
          <Hammer size={28} color={colors.navy700} />
        </View>
        <Text className="text-center font-sans-semibold text-base text-slate-800">
          Building this screen
        </Text>
        <Text className="max-w-xs text-center font-sans text-sm text-slate-500">
          {note ??
            'The admin data layer is live — this view is being ported from the web app to match it feature-for-feature.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
