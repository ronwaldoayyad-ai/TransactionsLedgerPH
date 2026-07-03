import { Text, View } from 'react-native'
import { CheckCircle2, XCircle } from 'lucide-react-native'
import FadeInView from './FadeInView'

export type ToastData = {
  id: number
  variant: 'success' | 'error'
  title: string
  message: string
}

// Inline toast card (web Toast.jsx port) — the caller owns timing/dismissal.
export default function Toast({ toast }: { toast: ToastData }) {
  const success = toast.variant === 'success'
  return (
    <FadeInView
      key={toast.id}
      dy={-8}
      className={`flex-row items-start gap-3 rounded-2xl border p-4 shadow-lg ${
        success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
      }`}
    >
      {success ? (
        <CheckCircle2 size={20} color="#047857" style={{ marginTop: 1 }} />
      ) : (
        <XCircle size={20} color="#b91c1c" style={{ marginTop: 1 }} />
      )}
      <View className="min-w-0 flex-1">
        <Text
          className={`font-sans-semibold text-sm ${success ? 'text-emerald-900' : 'text-red-900'}`}
        >
          {toast.title}
        </Text>
        <Text
          className={`mt-0.5 font-sans text-xs leading-4 ${success ? 'text-emerald-800' : 'text-red-800'}`}
        >
          {toast.message}
        </Text>
      </View>
    </FadeInView>
  )
}
