import { ReactNode } from 'react'
import { Text, View } from 'react-native'

// Web EmptyState equivalent: icon circle + title + body, used in every list.
export default function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: ReactNode
  title: string
  body?: string
}) {
  return (
    <View className="items-center px-8 py-12">
      {icon ? (
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          {icon}
        </View>
      ) : null}
      <Text className="text-center font-sans-semibold text-base text-slate-800">{title}</Text>
      {body ? (
        <Text className="mt-1 text-center font-sans text-sm leading-5 text-slate-500">{body}</Text>
      ) : null}
    </View>
  )
}
