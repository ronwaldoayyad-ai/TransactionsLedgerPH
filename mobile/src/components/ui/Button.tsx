import { ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import PressableScale from './PressableScale'

// Web Button variants (ui.jsx) translated to RN.
const variants: Record<string, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-navy-800', text: 'text-white', spinner: '#ffffff' },
  gold: { box: 'bg-gold-500', text: 'text-white', spinner: '#ffffff' },
  secondary: { box: 'bg-white border border-slate-300', text: 'text-slate-700', spinner: '#334155' },
  danger: { box: 'bg-red-600', text: 'text-white', spinner: '#ffffff' },
  ghost: { box: 'bg-transparent', text: 'text-navy-800', spinner: '#1e3a8a' },
}

export default function Button({
  children,
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  icon,
  className = '',
}: {
  children: ReactNode
  variant?: keyof typeof variants
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
  className?: string
}) {
  const v = variants[variant] ?? variants.primary
  const off = disabled || loading
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      className={`${off ? 'opacity-50' : ''}`}
    >
      <View
        className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${v.box} ${className}`}
      >
        {loading ? <ActivityIndicator size="small" color={v.spinner} /> : icon}
        {typeof children === 'string' ? (
          <Text className={`font-sans-semibold text-sm ${v.text}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </PressableScale>
  )
}
