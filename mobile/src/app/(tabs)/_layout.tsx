import { Redirect, Tabs } from 'expo-router'
import { LayoutDashboard, List, MessageCircle, Upload } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { colors, fonts } from '../../theme'

// Bottom tab bar — the mobile-native replacement for the web sidebar.
// Messages carries an iOS-style red unread badge.
export default function TabsLayout() {
  const { session, authLoading } = useApp()
  const { unreadTotal } = useMessages()
  if (authLoading) return null
  if (!session) return <Redirect href="/login" />
  if (session.needsPasswordSetup) return <Redirect href="/set-password" />

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
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: 'Pay',
          tabBarIcon: ({ color, size }) => <Upload color={color} size={size} />,
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
    </Tabs>
  )
}
