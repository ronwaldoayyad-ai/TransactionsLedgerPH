import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Eye, Mail, Pencil, Trash2, UserPlus, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/amortization'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import FloatingInput from '../../components/ui/FloatingInput'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import Toast from '../../components/ui/Toast'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const emptyForm = { name: '', email: '', phone: '' }

// Global user management (web Users.jsx): invite, edit, delete, resend invite,
// and "view as" a borrower.
export default function AdminUsers() {
  const { users, loans, transactions, inviteUser, updateUser, deleteUser, resendInvite, startViewAs, refreshing, refreshData } =
    useApp()
  const router = useRouter()
  const [modal, setModal] = useState<null | 'invite' | 'edit'>(null)
  const [target, setTarget] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<any>(null)

  const borrowers = users.filter((u: any) => u.role === 'user')

  const countsFor = (userId: string) => {
    const txnsOfLoan = (loanId: string) => transactions.filter((t: any) => t.loanId === loanId)
    const installmentLoans = loans.filter(
      (l: any) => l.userId === userId && l.txnType !== 'straight' && txnsOfLoan(l.id).length > 0,
    )
    const loanFullyPaid = (loanId: string) => {
      const ts = txnsOfLoan(loanId)
      return ts.length > 0 && ts.every((t: any) => t.status === 'paid')
    }
    const straight = transactions.filter((t: any) => t.userId === userId && t.type === 'Straight')
    return {
      activeInstallments: installmentLoans.filter((l: any) => !loanFullyPaid(l.id)).length,
      fullyPaidInstallments: installmentLoans.filter((l: any) => loanFullyPaid(l.id)).length,
      straightCount: straight.length,
    }
  }

  const flash = (msg: string) => {
    setToast({ id: String(Date.now()), type: 'success', message: msg })
    setTimeout(() => setToast(null), 4000)
  }

  const openInvite = () => {
    setForm(emptyForm)
    setError('')
    setModal('invite')
  }
  const openEdit = (u: any) => {
    setTarget(u)
    setForm({ name: u.name, email: u.email, phone: u.phone ?? '' })
    setError('')
    setModal('edit')
  }

  const submit = () => {
    if (!form.name.trim() || !/.+@.+\..+/.test(form.email)) {
      setError('A full name and a valid email address are required.')
      return
    }
    if (modal === 'invite') {
      inviteUser({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() })
      flash(`Profile created for ${form.email.trim()}. Send the sign-in invite from Supabase.`)
    } else {
      updateUser(target.id, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() })
      flash('Profile updated.')
    }
    setModal(null)
  }

  const confirmDelete = (u: any) => {
    Alert.alert(
      'Delete account',
      `Permanently delete ${u.name} (${u.email})? Their records stay in the audit trail, but they lose all access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteUser(u.id)
            flash('Account deleted.')
          },
        },
      ],
    )
  }

  const handleViewAs = (u: any) => {
    startViewAs(u)
    router.replace('/(tabs)')
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">User Management</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Public registration is disabled — accounts are created here by invitation.
          </Text>
        </FadeInView>

        <PressableScale
          onPress={openInvite}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3"
        >
          <UserPlus size={18} color="#ffffff" />
          <Text className="font-sans-semibold text-sm text-white">Invite new user</Text>
        </PressableScale>

        {toast ? <Toast toast={toast} /> : null}

        <FadeInView delay={80}>
          <Card>
            <CardHeader title="Borrower Accounts" subtitle={`${borrowers.length} accounts`} />
            {borrowers.length === 0 ? (
              <EmptyState title="No borrowers yet" body="Invite your first borrower to get started." />
            ) : (
              borrowers.map((u: any, idx: number) => {
                const c = countsFor(u.id)
                return (
                  <View
                    key={u.id}
                    className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <View className="flex-row items-center gap-3">
                      <Avatar name={u.name} url={u.avatarUrl} size={40} />
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>
                            {u.name}
                          </Text>
                          <Badge status={u.status} />
                        </View>
                        <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-2.5 flex-row gap-2">
                      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
                        <Text className="font-mono-semibold text-sm text-slate-900">{c.activeInstallments}</Text>
                        <Text className="font-sans text-[10px] text-slate-500">Active</Text>
                      </View>
                      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
                        <Text className="font-mono-semibold text-sm text-emerald-700">{c.fullyPaidInstallments}</Text>
                        <Text className="font-sans text-[10px] text-slate-500">Fully paid</Text>
                      </View>
                      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
                        <Text className="font-mono-semibold text-sm text-slate-900">{c.straightCount}</Text>
                        <Text className="font-sans text-[10px] text-slate-500">Straight</Text>
                      </View>
                      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
                        <Text className="font-sans-medium text-xs text-slate-700" numberOfLines={1}>
                          {u.lastLogin ? formatDate(u.lastLogin) : 'Never'}
                        </Text>
                        <Text className="font-sans text-[10px] text-slate-500">Last login</Text>
                      </View>
                    </View>

                    <View className="mt-2.5 flex-row justify-end gap-1.5">
                      <ActionBtn label="View as" onPress={() => handleViewAs(u)} tint="#b45309" bg="bg-amber-50">
                        <Eye size={16} color="#b45309" />
                      </ActionBtn>
                      {u.status === 'invited' ? (
                        <ActionBtn
                          label="Resend"
                          onPress={() => {
                            resendInvite(u)
                            flash(`Invitation re-sent to ${u.email}.`)
                          }}
                          tint="#0369a1"
                          bg="bg-sky-50"
                        >
                          <Mail size={16} color="#0369a1" />
                        </ActionBtn>
                      ) : null}
                      <ActionBtn label="Edit" onPress={() => openEdit(u)} tint={colors.navy700} bg="bg-navy-50">
                        <Pencil size={16} color={colors.navy700} />
                      </ActionBtn>
                      <ActionBtn label="Delete" onPress={() => confirmDelete(u)} tint="#dc2626" bg="bg-red-50">
                        <Trash2 size={16} color="#dc2626" />
                      </ActionBtn>
                    </View>
                  </View>
                )
              })
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Invite / Edit modal */}
      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="rounded-t-3xl bg-white p-5 pb-8">
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="font-sans-bold text-lg text-slate-900">
                  {modal === 'invite' ? 'Invite new user' : `Edit ${target?.name ?? ''}`}
                </Text>
                <Pressable onPress={() => setModal(null)} className="p-1" accessibilityLabel="Close">
                  <X size={22} color={colors.slate500} />
                </Pressable>
              </View>

              {modal === 'invite' ? (
                <Text className="mb-4 rounded-xl bg-navy-50 px-3 py-2.5 font-sans text-xs leading-5 text-navy-800">
                  Creates the borrower profile. Send the actual sign-in invite from the Supabase
                  Dashboard (Authentication → Users); they set a password on first login.
                </Text>
              ) : null}

              <View className="gap-4">
                <FloatingInput label="Full name" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
                <FloatingInput
                  label="Email address"
                  value={form.email}
                  onChangeText={(t) => setForm({ ...form, email: t })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <FloatingInput
                  label="Mobile number"
                  value={form.phone}
                  onChangeText={(t) => setForm({ ...form, phone: t })}
                  keyboardType="phone-pad"
                />
                {error ? (
                  <Text className="rounded-xl bg-red-50 px-3 py-2.5 font-sans text-sm text-red-700">{error}</Text>
                ) : null}
                <Button onPress={submit}>{modal === 'invite' ? 'Create & invite' : 'Save changes'}</Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function ActionBtn({
  children,
  label,
  onPress,
  bg,
}: {
  children: React.ReactNode
  label: string
  onPress: () => void
  tint: string
  bg: string
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} className={`rounded-xl ${bg} p-2.5`}>
      {children}
    </PressableScale>
  )
}
