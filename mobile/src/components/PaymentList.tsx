import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Image } from 'expo-image'
import { FileText, Inbox, Trash2 } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { formatDate, formatPeso } from '../lib/amortization'
import Badge from './ui/Badge'
import EmptyState from './ui/EmptyState'
import SegmentedTabs from './ui/SegmentedTabs'
import FadeInView from './ui/FadeInView'
import ProofViewer from './ProofViewer'
import { errorHaptic, warningHaptic } from '../lib/haptics'
import { colors } from '../theme'

const TABS = ['all', 'pending', 'approved', 'rejected'].map((v) => ({ value: v, label: v }))

// Borrower proof-of-payment history (web PaymentList port, read-only side):
// status tabs, proof viewing (fresh signed URL), swipe-to-delete on pending.
export default function PaymentList({
  payments,
  showTabs = true,
  emptyBody = 'No submissions yet.',
}: {
  payments: any[]
  showTabs?: boolean
  emptyBody?: string
}) {
  const { getProofUrl, deletePayment } = useApp()
  const [filter, setFilter] = useState('all')
  const [viewing, setViewing] = useState<{ url: string; fileName: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const list = payments.filter((p) => filter === 'all' || p.status === filter)

  const openProof = async (p: any) => {
    setBusyId(p.id)
    // Always fetch a fresh signed URL — the one loaded with the list may have expired.
    const url = await getProofUrl(p)
    setBusyId(null)
    if (!url) {
      errorHaptic()
      Alert.alert('Unavailable', 'The proof file could not be loaded. Pull to refresh and try again.')
      return
    }
    if (p.fileType === 'pdf') {
      // Safari VC (iOS) and custom tabs (Android) both render PDFs natively.
      WebBrowser.openBrowserAsync(url).catch(() => {})
    } else {
      setViewing({ url, fileName: p.fileName })
    }
  }

  const confirmDelete = (p: any) => {
    warningHaptic()
    Alert.alert('Delete this proof?', `${p.fileName} will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePayment(p) },
    ])
  }

  const renderRow = (p: any, idx: number) => {
    const row = (
      <Pressable
        onPress={() => openProof(p)}
        className={`flex-row items-center gap-3 bg-white px-4 py-3 active:bg-slate-50 ${
          idx > 0 ? 'border-t border-slate-100' : ''
        }`}
        accessibilityLabel={`View proof ${p.fileName}`}
      >
        {p.fileType === 'pdf' || !p.fileUrl ? (
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-slate-100">
            <FileText size={18} color={colors.slate500} />
          </View>
        ) : (
          <Image
            source={{ uri: p.fileUrl }}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            contentFit="cover"
            transition={120}
          />
        )}
        <View className="min-w-0 flex-1">
          <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>
            {p.fileName}
          </Text>
          <Text className="mt-0.5 font-sans text-xs text-slate-500" numberOfLines={1}>
            {formatDate(p.submittedAt)} · {p.method}
            {p.reference && p.reference !== '—' ? ` · ${p.reference}` : ''}
          </Text>
          {p.status === 'rejected' && p.note ? (
            <Text className="mt-1 font-sans text-xs text-red-600" numberOfLines={2}>
              Note: {p.note}
            </Text>
          ) : null}
        </View>
        <View className="items-end gap-1">
          {busyId === p.id ? (
            <ActivityIndicator size="small" color={colors.navy600} />
          ) : (
            <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(p.amount)}</Text>
          )}
          <Badge status={p.status} />
        </View>
      </Pressable>
    )

    // Only the borrower's own PENDING proofs can be withdrawn (web parity).
    if (p.status !== 'pending') return <View key={p.id}>{row}</View>
    return (
      <ReanimatedSwipeable
        key={p.id}
        friction={2}
        rightThreshold={36}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={() => confirmDelete(p)}
            className="w-20 items-center justify-center bg-red-600"
            accessibilityLabel="Delete proof"
          >
            <Trash2 size={20} color="#ffffff" />
            <Text className="mt-1 font-sans-medium text-[11px] text-white">Delete</Text>
          </Pressable>
        )}
      >
        {row}
      </ReanimatedSwipeable>
    )
  }

  return (
    <View>
      {showTabs && (
        <View className="px-4 pb-3">
          <SegmentedTabs tabs={TABS} active={filter} onChange={setFilter} />
        </View>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={<Inbox size={20} color={colors.slate500} />}
          title="Nothing here"
          body={filter === 'all' ? emptyBody : `No ${filter} submissions.`}
        />
      ) : (
        <FadeInView className="overflow-hidden rounded-b-2xl">
          {list.map(renderRow)}
        </FadeInView>
      )}
      {viewing && (
        <ProofViewer url={viewing.url} fileName={viewing.fileName} onClose={() => setViewing(null)} />
      )}
    </View>
  )
}
