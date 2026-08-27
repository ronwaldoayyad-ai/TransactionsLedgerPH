import { useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Image } from 'expo-image'
import { Check, FileText, Inbox, Trash2, X } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { formatDate, formatPeso } from '../lib/amortization'
import Badge from './ui/Badge'
import EmptyState from './ui/EmptyState'
import SegmentedTabs from './ui/SegmentedTabs'
import FadeInView from './ui/FadeInView'
import ProofViewer from './ProofViewer'
import { errorHaptic, successHaptic, warningHaptic } from '../lib/haptics'
import { colors } from '../theme'

const TABS = ['all', 'pending', 'approved', 'rejected'].map((v) => ({ value: v, label: v }))

// Shared proof-of-payment list (web PaymentList port). Borrower side: read-only
// history with swipe-to-delete on own pending proofs. Admin side (canReview):
// approve/reject with an optional note, and the borrower's name shown.
export default function PaymentList({
  payments,
  showTabs = true,
  showControls = false,
  canReview = false,
  showBorrower = false,
  pageSize = 50,
  emptyBody = 'No submissions yet.',
}: {
  payments: any[]
  showTabs?: boolean
  showControls?: boolean
  canReview?: boolean
  showBorrower?: boolean
  pageSize?: number
  emptyBody?: string
}) {
  const { users, getProofUrl, deletePayment, reviewPayment } = useApp()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [viewing, setViewing] = useState<{ url: string; fileName: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [limit, setLimit] = useState(pageSize)

  const nameOf = (userId: string) => users.find((u: any) => u.id === userId)?.name ?? 'Borrower'
  const toggleSort = (k: 'date' | 'amount') => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }
  const base = payments.filter((p) => filter === 'all' || p.status === filter)
  const q = query.trim().toLowerCase()
  const dir = sortDir === 'asc' ? 1 : -1
  // Search + sort only when the host opts in (My Payments); otherwise keep the
  // caller's order (dashboard preview, admin queue).
  const list = !showControls
    ? base
    : base
        .filter((p) => {
          if (!q) return true
          const loan = (p.loanId ?? '').toString().toLowerCase()
          const hay = `${nameOf(p.userId)} ${loan} ${p.method ?? ''} ${p.reference ?? ''} ${p.fileName ?? ''} ${p.amount}`.toLowerCase()
          return hay.includes(q)
        })
        .sort((a, b) => {
          const cmp =
            sortKey === 'amount'
              ? (Number(a.amount) || 0) - (Number(b.amount) || 0)
              : String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''))
          return (cmp || String(a.id).localeCompare(String(b.id))) * dir
        })
  const shown = list.slice(0, limit)

  const openProof = async (p: any) => {
    setBusyId(p.id)
    const url = await getProofUrl(p)
    setBusyId(null)
    if (!url) {
      errorHaptic()
      Alert.alert('Unavailable', 'The proof file could not be loaded. Pull to refresh and try again.')
      return
    }
    if (p.fileType === 'pdf') {
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

  const approve = (p: any) => {
    successHaptic()
    reviewPayment(p.id, 'approved')
  }

  // Reject with an optional note. Alert.prompt is iOS-only, so Android falls
  // back to a plain confirm (note empty) — parity enough for v1.
  const reject = (p: any) => {
    warningHaptic()
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      ;(Alert as any).prompt(
        'Reject proof',
        'Add a note for the borrower (optional):',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (note: string) => reviewPayment(p.id, 'rejected', note ?? '') },
        ],
        'plain-text',
      )
    } else {
      Alert.alert('Reject this proof?', `${p.fileName} will be marked rejected.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => reviewPayment(p.id, 'rejected', '') },
      ])
    }
  }

  const renderRow = (p: any, idx: number) => {
    const title = showBorrower ? nameOf(p.userId) : p.fileName
    const subtitle = showBorrower
      ? `${p.fileName} · ${formatDate(p.submittedAt)}`
      : `${formatDate(p.submittedAt)} · ${p.method}${p.reference && p.reference !== '—' ? ` · ${p.reference}` : ''}`

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
            {title}
          </Text>
          <Text className="mt-0.5 font-sans text-xs text-slate-500" numberOfLines={1}>
            {subtitle}
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

    // Admin review controls for pending proofs.
    const reviewBar =
      canReview && p.status === 'pending' ? (
        <View className="flex-row gap-2 border-t border-slate-100 bg-white px-4 py-2.5">
          <Pressable
            onPress={() => approve(p)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 active:opacity-80"
            accessibilityLabel="Approve proof"
          >
            <Check size={16} color="#ffffff" />
            <Text className="font-sans-semibold text-sm text-white">Approve</Text>
          </Pressable>
          <Pressable
            onPress={() => reject(p)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 active:opacity-80"
            accessibilityLabel="Reject proof"
          >
            <X size={16} color="#ffffff" />
            <Text className="font-sans-semibold text-sm text-white">Reject</Text>
          </Pressable>
        </View>
      ) : null

    // Swipe-to-delete: borrower's own pending, or any proof when admin.
    const deletable = canReview || p.status === 'pending'
    const content = (
      <View>
        {row}
        {reviewBar}
      </View>
    )
    if (!deletable) return <View key={p.id}>{content}</View>
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
        {content}
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
      {showControls && payments.length > 0 && (
        <View className="gap-2 px-4 pb-3">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search reference, method, loan…"
            placeholderTextColor={colors.slate400}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
          />
          <View className="flex-row items-center gap-2">
            <Text className="font-sans text-xs text-slate-500">Sort</Text>
            <View className="flex-row rounded-lg border border-slate-300 bg-white p-0.5">
              {(['date', 'amount'] as const).map((k) => {
                const active = sortKey === k
                return (
                  <Pressable key={k} onPress={() => toggleSort(k)} className={`rounded-md px-2.5 py-1.5 ${active ? 'bg-navy-800' : ''}`}>
                    <Text className={`font-sans-medium text-xs ${active ? 'text-white' : 'text-slate-600'}`}>
                      {k === 'date' ? 'Date' : 'Amount'}
                      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
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
          {shown.map(renderRow)}
          {list.length > shown.length ? (
            <Pressable
              onPress={() => setLimit((n) => n + pageSize)}
              className="items-center border-t border-slate-100 bg-white py-3 active:bg-slate-50"
            >
              <Text className="font-sans-medium text-sm text-navy-700">
                Show more ({list.length - shown.length})
              </Text>
            </Pressable>
          ) : null}
        </FadeInView>
      )}
      {viewing && (
        <ProofViewer url={viewing.url} fileName={viewing.fileName} onClose={() => setViewing(null)} />
      )}
    </View>
  )
}
