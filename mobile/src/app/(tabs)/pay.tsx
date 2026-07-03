import { useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Check, FileText, Paperclip, ScrollText, Send, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatPeso } from '../../lib/amortization'
import { Card, CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import CurrencyInput from '../../components/ui/CurrencyInput'
import FadeInView from '../../components/ui/FadeInView'
import Toast, { ToastData } from '../../components/ui/Toast'
import PaymentList from '../../components/PaymentList'
import PressableScale from '../../components/ui/PressableScale'
import { errorHaptic, successHaptic, tapHaptic } from '../../lib/haptics'
import { colors, fonts } from '../../theme'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB (web parity)
const METHODS = ['GCash', 'Maya', 'Bank Transfer', 'Cash Deposit']

type Picked = { uri: string; name: string; size?: number; mimeType?: string | null }

// My Payments: submit a proof of payment + track its verification status
// (web Payments.jsx port).
export default function Pay() {
  const { session, loans, payments, transactions, submitPayment, refreshing, refreshData } =
    useApp()
  const router = useRouter()

  // Only loans that still have an outstanding POSITIVE-amount installment
  // (credits/negative rows are excluded) — same rule as the web page.
  const myLoans = loans.filter((l: any) => {
    if (l.userId !== session.user.id) return false
    const txns = transactions.filter((t: any) => t.loanId === l.id)
    return txns.some(
      (t: any) => t.amount > 0 && !['paid', 'refunded', 'cancelled'].includes(t.status),
    )
  })
  const myPayments = payments.filter((p: any) => p.userId === session.user.id)

  const [file, setFile] = useState<Picked | null>(null)
  const [loanIds, setLoanIds] = useState<Set<string>>(() => new Set())
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState('GCash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (next: Omit<ToastData, 'id'>) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ ...next, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  const toggleLoan = (id: string) =>
    setLoanIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Same validation rules + copy as the web dropzone.
  const acceptFile = (f: Picked | null) => {
    if (!f) return
    if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) {
      setError('Unsupported file type. Only JPG, PNG, or PDF files are accepted.')
      errorHaptic()
      return
    }
    if (f.size && f.size > MAX_FILE_BYTES) {
      setError(
        `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). The maximum allowed size is 5 MB.`,
      )
      errorHaptic()
      return
    }
    setFile(f)
    setError('')
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera unavailable', 'Allow camera access in Settings to take a photo.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    const a = res.assets?.[0]
    if (a) acceptFile({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, size: a.fileSize, mimeType: a.mimeType })
  }

  const chooseImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 })
    const a = res.assets?.[0]
    if (a) acceptFile({ uri: a.uri, name: a.fileName ?? `image-${Date.now()}.jpg`, size: a.fileSize, mimeType: a.mimeType })
  }

  const choosePdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })
    const a = res.assets?.[0]
    if (a) acceptFile({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType })
  }

  const pickAttachment = () => {
    const options = ['Take photo', 'Choose image', 'Choose PDF', 'Cancel']
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) takePhoto()
          else if (i === 1) chooseImage()
          else if (i === 2) choosePdf()
        },
      )
    } else {
      Alert.alert('Attach proof of payment', undefined, [
        { text: 'Take photo', onPress: takePhoto },
        { text: 'Choose image', onPress: chooseImage },
        { text: 'Choose PDF', onPress: choosePdf },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  const handleSubmit = async () => {
    if (!file) return setError('Please attach your proof of payment.')
    if (loanIds.size === 0) return setError('Please select at least one loan this payment is for.')
    if (!amount || amount <= 0) return setError('Please enter the amount you paid.')
    setError('')
    setSubmitting(true)
    // One proof can cover multiple loans (same due date) — record it against each.
    const ids = [...loanIds]
    let saved = 0
    try {
      for (const id of ids) {
        const payment = await submitPayment(session.user.name, {
          userId: session.user.id,
          loanId: id,
          amount,
          method,
          reference: reference.trim() || '—',
          fileName: file.name,
          fileType: /\.pdf$/i.test(file.name) ? 'pdf' : 'image',
          file,
        })
        if (payment) saved += 1
      }
    } catch {
      // fall through — any shortfall is an upload failure
    }
    setSubmitting(false)
    if (saved < ids.length) {
      errorHaptic()
      showToast({ variant: 'error', title: 'Upload Failed', message: 'Please try uploading again.' })
      return
    }
    setFile(null)
    setAmount(null)
    setReference('')
    setLoanIds(new Set())
    successHaptic()
    showToast({
      variant: 'success',
      title: 'Upload Complete',
      message: 'Your proof of payment has been uploaded and now being verified.',
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      {/* Floating toast */}
      {toast && (
        <View className="absolute left-4 right-4 top-16 z-50">
          <Toast toast={toast} />
        </View>
      )}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="gap-4 p-4 pb-8"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
          }
        >
          <FadeInView className="flex-row items-center justify-between px-1">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="font-sans-bold text-xl text-slate-900">My Payments</Text>
              <Text className="mt-0.5 font-sans text-xs text-slate-500">
                GCash receipts, bank transfer screenshots, or PDFs.
              </Text>
            </View>
            <PressableScale onPress={() => router.push('/payment-logs')}>
              <View className="flex-row items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2">
                <ScrollText size={13} color={colors.navy700} />
                <Text className="font-sans-medium text-xs text-navy-700">Logs</Text>
              </View>
            </PressableScale>
          </FadeInView>

          {/* Submit card */}
          <FadeInView delay={60}>
            <Card>
              <CardHeader title="Submit proof of payment" subtitle="JPG, PNG, or PDF · max 5 MB" />
              <View className="gap-4 px-5 py-4">
                {/* Attachment */}
                {file ? (
                  <View className="flex-row items-center gap-3 rounded-xl border border-navy-200 bg-navy-50 p-3">
                    {/\.pdf$/i.test(file.name) ? (
                      <View className="h-11 w-11 items-center justify-center rounded-lg bg-white">
                        <FileText size={18} color={colors.navy700} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: file.uri }}
                        style={{ width: 44, height: 44, borderRadius: 8 }}
                        contentFit="cover"
                      />
                    )}
                    <Text className="flex-1 font-sans-medium text-sm text-navy-900" numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Pressable onPress={() => setFile(null)} hitSlop={8} accessibilityLabel="Remove attachment">
                      <X size={18} color={colors.navy700} />
                    </Pressable>
                  </View>
                ) : (
                  <PressableScale onPress={pickAttachment}>
                    <View className="items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6">
                      <Paperclip size={20} color={colors.slate500} />
                      <Text className="font-sans-medium text-sm text-slate-700">
                        Attach proof of payment
                      </Text>
                      <Text className="font-sans text-xs text-slate-500">
                        Take a photo, or pick an image / PDF
                      </Text>
                    </View>
                  </PressableScale>
                )}

                {/* Loan multi-select */}
                <View className="gap-1.5">
                  <Text className="font-sans-medium text-xs text-slate-600">
                    Which loan(s) is this payment for?
                  </Text>
                  {myLoans.length === 0 ? (
                    <Text className="font-sans text-sm text-slate-500">
                      No loans with outstanding payments.
                    </Text>
                  ) : (
                    myLoans.map((l: any) => {
                      const on = loanIds.has(l.id)
                      return (
                        <Pressable
                          key={l.id}
                          onPress={() => {
                            tapHaptic()
                            toggleLoan(l.id)
                          }}
                          hitSlop={{ left: 8, right: 8 }}
                          android_ripple={{ color: '#e2e8f0' }}
                          style={({ pressed }) => ({ minHeight: 54, opacity: pressed ? 0.85 : 1 })}
                          className={`flex-row items-center gap-3 rounded-xl border px-3 ${
                            on ? 'border-navy-300 bg-navy-50' : 'border-slate-200 bg-white'
                          }`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={l.label}
                        >
                          <View
                            className={`h-6 w-6 items-center justify-center rounded-lg border-2 ${
                              on ? 'border-navy-800 bg-navy-800' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {on && <Check size={15} color="#ffffff" strokeWidth={3.5} />}
                          </View>
                          <Text className="flex-1 py-3 font-sans-medium text-sm text-slate-800" numberOfLines={1}>
                            {l.label}
                          </Text>
                          <Text className="font-mono text-xs text-slate-500">
                            {formatPeso(l.principal)}
                          </Text>
                        </Pressable>
                      )
                    })
                  )}
                </View>

                {/* Amount */}
                <View className="gap-1.5">
                  <Text className="font-sans-medium text-xs text-slate-600">Amount paid</Text>
                  <CurrencyInput value={amount} onValueChange={setAmount} />
                </View>

                {/* Method chips */}
                <View className="gap-1.5">
                  <Text className="font-sans-medium text-xs text-slate-600">Payment method</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {METHODS.map((m) => (
                      <PressableScale key={m} onPress={() => setMethod(m)}>
                        <View
                          className={`rounded-full border px-3.5 py-2 ${
                            method === m ? 'border-navy-800 bg-navy-800' : 'border-slate-300 bg-white'
                          }`}
                        >
                          <Text
                            className={`font-sans-medium text-xs ${
                              method === m ? 'text-white' : 'text-slate-600'
                            }`}
                          >
                            {m}
                          </Text>
                        </View>
                      </PressableScale>
                    ))}
                  </View>
                </View>

                {/* Reference */}
                <View className="gap-1.5">
                  <Text className="font-sans-medium text-xs text-slate-600">
                    Reference number (optional)
                  </Text>
                  <TextInput
                    value={reference}
                    onChangeText={setReference}
                    placeholder="e.g. 1234-5678"
                    placeholderTextColor="#94a3b8"
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 15,
                      color: '#0f172a',
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: '#ffffff',
                    }}
                    cursorColor={colors.navy800}
                  />
                </View>

                {error ? (
                  <FadeInView dy={4} className="rounded-xl bg-red-50 px-3 py-3">
                    <Text className="font-sans text-sm text-red-700">{error}</Text>
                  </FadeInView>
                ) : null}

                <Button
                  variant="gold"
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={submitting}
                  icon={<Send size={15} color="#ffffff" />}
                >
                  {submitting ? 'Uploading…' : 'Submit for verification'}
                </Button>
              </View>
            </Card>
          </FadeInView>

          {/* History */}
          <FadeInView delay={120}>
            <Card>
              <CardHeader title="My submissions" subtitle="View status or open a proof" />
              <View className="pt-3">
                <PaymentList payments={myPayments} emptyBody="Your submitted proofs will appear here." />
              </View>
            </Card>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
