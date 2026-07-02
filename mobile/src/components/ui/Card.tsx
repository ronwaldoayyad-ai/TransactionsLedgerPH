import { ReactNode } from 'react'
import { Text, View, ViewProps } from 'react-native'

// Web `Card` equivalent (ui.jsx): white rounded panel with a hairline border.
// backdrop-blur is skipped on native — the light screen background does the job.
export function Card({ className = '', children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-slate-200/70 bg-white shadow-sm ${className}`}
      {...props}
    >
      {children}
    </View>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <View className="min-w-0 flex-1">
        <Text className="font-sans-semibold text-base text-slate-900">{title}</Text>
        {subtitle ? <Text className="mt-0.5 font-sans text-xs text-slate-500">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  )
}
