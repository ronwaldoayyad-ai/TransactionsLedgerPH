import { Redirect, Tabs } from 'expo-router'
import { FileText, LayoutDashboard, List, Menu, MessageCircle } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { colors, fonts } from '../../theme'

// Admin bottom-tab shell. The web sidebar has 13 destinations grouped into
// sections; on mobile the five highest-traffic ones are tabs and everything
// else lives behind "More". Non-tab admin screens are registered here with
// `href: null` so they're navigable (router.push) without showing in the bar.
export default function AdminLayout() {
  const { session, authLoading } = useApp()
  const { unreadTotal } = useMessages()
  if (authLoading) return null
  if (!session) return <Redirect href="/login" />
  if (session.needsPasswordSetup) return <Redirect href="/set-password" />
  // A non-admin somehow inside the admin group → bounce to the borrower tabs.
  if (session.user?.role !== 'admin') return <Redirect href="/(tabs)" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy800,
        tabBarInactiveTintColor: colors.slate400,
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e2e8f0' },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="loan-requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
          tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontFamily: fonts.sansSemibold,
            fontSize: 11,
          },
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />

      {/* Non-tab destinations — reachable from More / Overview quick links. */}
      <Tabs.Screen name="payment-due" options={{ href: null }} />
      <Tabs.Screen name="payment-logs" options={{ href: null }} />
      <Tabs.Screen name="invoices" options={{ href: null }} />
      <Tabs.Screen name="arbitrage" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
      <Tabs.Screen name="calculator" options={{ href: null }} />
      <Tabs.Screen name="loan-tracker" options={{ href: null }} />
      <Tabs.Screen name="queue" options={{ href: null }} />
      <Tabs.Screen name="users" options={{ href: null }} />
      <Tabs.Screen name="logs" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  )
}
