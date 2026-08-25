import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  AlertCircle,
  BarChart3,
  Bell,
  Calculator,
  ChevronRight,
  FileText,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  ScrollText,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import Avatar from '../../components/ui/Avatar'
import PressableScale from '../../components/ui/PressableScale'
import FadeInView from '../../components/ui/FadeInView'
import { Card } from '../../components/ui/Card'
import { colors } from '../../theme'

type Item = { label: string; icon: any; href: string; tint?: string }

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Overview',
    items: [{ label: 'Command Center', icon: LayoutDashboard, href: '/(admin)' }],
  },
  {
    title: 'Ledger',
    items: [
      { label: 'Overall Transactions', icon: List, href: '/(admin)/transactions' },
      { label: 'Payment Logs', icon: Wallet, href: '/(admin)/payment-logs' },
      { label: 'Invoices', icon: FileText, href: '/(admin)/invoices' },
      { label: 'Interest / Arbitrage', icon: TrendingUp, href: '/(admin)/arbitrage' },
      { label: 'Cards & Bills Wallet', icon: Wallet, href: '/(admin)/wallet' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Messages', icon: Mail, href: '/(admin)/messages' },
      { label: 'Announcements', icon: Bell, href: '/(admin)/announcements' },
    ],
  },
  {
    title: 'Loans',
    items: [
      { label: 'Loan Calculator', icon: Calculator, href: '/(admin)/calculator' },
      { label: 'Loan Requests', icon: FileText, href: '/(admin)/loan-requests' },
      { label: 'Loan Tracker', icon: Wallet, href: '/(admin)/loan-tracker' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Verification Queue', icon: Inbox, href: '/(admin)/queue' },
      { label: 'User Management', icon: Users, href: '/(admin)/users' },
      { label: 'Analytics', icon: BarChart3, href: '/(admin)/analytics' },
      { label: 'Reports & Logs', icon: ScrollText, href: '/(admin)/logs' },
    ],
  },
]

export default function AdminMore() {
  const { session, signOut } = useApp()
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <FadeInView>
          <PressableScale
            onPress={() => router.push('/(admin)/profile')}
            className="flex-row items-center gap-3 rounded-2xl bg-white p-4"
          >
            <Avatar name={session.user.name} url={session.user.avatarUrl} size={48} />
            <View className="min-w-0 flex-1">
              <Text className="font-sans-semibold text-base text-slate-900" numberOfLines={1}>
                {session.user.name}
              </Text>
              <Text className="font-sans text-xs text-slate-500">Administrator · View profile</Text>
            </View>
            <ChevronRight size={18} color={colors.slate400} />
          </PressableScale>
        </FadeInView>

        {GROUPS.map((group, gi) => (
          <FadeInView key={group.title} delay={60 * (gi + 1)}>
            <Text className="mb-1.5 px-2 font-sans-semibold text-xs uppercase tracking-wide text-slate-400">
              {group.title}
            </Text>
            <Card>
              {group.items.map((item, idx) => {
                const Ico = item.icon
                return (
                  <PressableScale
                    key={item.href}
                    scaleTo={0.985}
                    onPress={() => router.push(item.href as any)}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <View className="rounded-lg bg-navy-50 p-2">
                      <Ico size={18} color={colors.navy700} />
                    </View>
                    <Text className="flex-1 font-sans-medium text-[15px] text-slate-900">{item.label}</Text>
                    <ChevronRight size={18} color={colors.slate400} />
                  </PressableScale>
                )
              })}
            </Card>
          </FadeInView>
        ))}

        <FadeInView delay={400}>
          <PressableScale
            onPress={signOut}
            className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl bg-white p-4"
          >
            <LogOut size={18} color="#dc2626" />
            <Text className="font-sans-semibold text-sm text-red-600">Sign out</Text>
          </PressableScale>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  )
}
