import { ScrollView, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Megaphone } from 'lucide-react-native'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import EmptyState from '../../components/ui/EmptyState'
import FadeInView from '../../components/ui/FadeInView'
import { colors, fonts } from '../../theme'

// Full-text announcement view (web AnnouncementDetail port).
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { getById } = useAnnouncements()
  const a = getById(id)

  return (
    <View className="flex-1 bg-[#f3f6fb]">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Announcement',
          headerTitleStyle: { fontFamily: fonts.sansSemibold },
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {!a ? (
        <EmptyState
          icon={<Megaphone size={20} color={colors.slate500} />}
          title="This announcement is no longer available"
          body="It may have expired or been removed by your administrator."
        />
      ) : (
        <ScrollView contentContainerClassName="p-4 pb-10">
          <FadeInView className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <View className="self-start rounded-full bg-navy-50 p-2.5">
              <Megaphone size={18} color={colors.navy800} />
            </View>
            {a.title ? (
              <Text className="mt-3 font-sans-bold text-xl text-slate-900">{a.title}</Text>
            ) : null}
            {a.createdAt ? (
              <Text className="mt-1 font-sans text-xs text-slate-500">
                {new Date(a.createdAt).toLocaleString('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
            ) : null}
            <Text className="mt-4 font-sans text-[15px] leading-[23px] text-slate-700">
              {a.body}
            </Text>
          </FadeInView>
        </ScrollView>
      )}
    </View>
  )
}
