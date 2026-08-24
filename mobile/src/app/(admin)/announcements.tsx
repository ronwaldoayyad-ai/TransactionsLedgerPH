import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Bell, Check, Pencil, Send, Trash2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null

export default function AdminAnnouncements() {
  const { users, refreshing, refreshData } = useApp()
  const { announcements, createAnnouncement, updateAnnouncement, deleteAnnouncement } = useAnnouncements()
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? id

  const [editingId, setEditingId] = useState<string | null>(null)
  const [type, setType] = useState<'toast' | 'banner'>('toast')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'all' | 'targeted'>('all')
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [until, setUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)

  const now = Date.now()
  const canSave = body.trim().length > 0 && (audience === 'all' || targets.size > 0)

  const reset = () => {
    setEditingId(null)
    setType('toast')
    setTitle('')
    setBody('')
    setAudience('all')
    setTargets(new Set())
    setUntil('')
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    const payload = {
      type,
      title: title.trim(),
      body: body.trim(),
      audience,
      targetUserIds: [...targets],
      expiresAt: until ? new Date(`${until}T23:59:59`).toISOString() : null,
    }
    const res = editingId
      ? await updateAnnouncement(editingId, payload)
      : await createAnnouncement(payload)
    setSaving(false)
    if (res?.error) {
      Alert.alert('Failed', res.error)
      return
    }
    reset()
  }

  const startEdit = (a: any) => {
    setEditingId(a.id)
    setType(a.type)
    setTitle(a.title ?? '')
    setBody(a.body)
    setAudience(a.audience)
    setTargets(new Set(a.targetUserIds ?? []))
    setUntil(a.expiresAt ? String(a.expiresAt).slice(0, 10) : '')
  }

  const confirmDelete = (a: any) =>
    Alert.alert('Delete announcement?', 'This removes it for all borrowers.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAnnouncement(a.id) },
    ])

  const toggleTarget = (id: string) =>
    setTargets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Announcements</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Broadcast a toast or banner to all borrowers, or target specific ones.
          </Text>
        </FadeInView>

        {/* Composer */}
        <FadeInView delay={60}>
          <Card>
            <CardHeader title={editingId ? 'Edit announcement' : 'New announcement'} />
            <View className="gap-4 px-4 py-4">
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Type</Text>
                <View className="flex-row gap-2">
                  {(['toast', 'banner'] as const).map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => setType(v)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 ${
                        type === v ? 'border-navy-300 bg-navy-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Text className="font-sans-semibold text-sm capitalize text-slate-800">{v}</Text>
                      <Text className="mt-0.5 font-sans text-[11px] text-slate-500">
                        {v === 'toast' ? 'Card, auto-dismisses' : 'Full-width bar'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Title (optional)</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="🚀 New Feature Live!" placeholderTextColor={colors.slate400} className={input} />
              </View>

              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Message</Text>
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  multiline
                  placeholder="We've just added a new setting to your profile."
                  placeholderTextColor={colors.slate400}
                  className={`${input} min-h-[80px]`}
                  textAlignVertical="top"
                />
              </View>

              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Audience</Text>
                <View className="flex-row gap-2">
                  {([['all', 'All borrowers'], ['targeted', 'Specific']] as const).map(([v, label]) => (
                    <Pressable
                      key={v}
                      onPress={() => setAudience(v)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 ${
                        audience === v ? 'border-navy-300 bg-navy-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Text className="text-center font-sans-medium text-sm text-slate-700">{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {audience === 'targeted' ? (
                  <Pressable onPress={() => setPicker(true)} className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <Text className="font-sans-medium text-sm text-slate-700">
                      {targets.size > 0 ? `${targets.size} recipient${targets.size === 1 ? '' : 's'} selected` : 'Select recipients'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Show until (optional)</Text>
                <TextInput value={until} onChangeText={setUntil} placeholder="YYYY-MM-DD" autoCapitalize="none" placeholderTextColor={colors.slate400} className={`${input} font-mono`} />
              </View>

              <View className="flex-row gap-2">
                {editingId ? (
                  <Button variant="secondary" onPress={reset}>
                    Cancel
                  </Button>
                ) : null}
                <View className="flex-1">
                  <Button variant="gold" onPress={submit} disabled={!canSave || saving} icon={<Send size={15} color="#ffffff" />}>
                    {saving ? 'Publishing…' : editingId ? 'Save changes' : 'Publish'}
                  </Button>
                </View>
              </View>
            </View>
          </Card>
        </FadeInView>

        {/* Published */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Published" subtitle={`${announcements.length} announcement${announcements.length === 1 ? '' : 's'}`} />
            {announcements.length === 0 ? (
              <EmptyState icon={<Bell size={20} color={colors.slate500} />} title="No announcements yet" body="Publish one above to push it to borrowers." />
            ) : (
              announcements.map((a: any, idx: number) => {
                const expired = a.expiresAt && new Date(a.expiresAt).getTime() < now
                return (
                  <View key={a.id} className={`flex-row items-start gap-2 px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View className={`mt-0.5 rounded-full px-2 py-0.5 ${a.type === 'toast' ? 'bg-violet-50' : 'bg-blue-50'}`}>
                      <Text className={`font-sans-semibold text-[10px] uppercase ${a.type === 'toast' ? 'text-violet-700' : 'text-blue-700'}`}>{a.type}</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={2}>
                        {a.title ? `${a.title} — ` : ''}
                        <Text className="font-sans text-slate-600">{a.body}</Text>
                      </Text>
                      <Text className="mt-0.5 font-sans text-xs text-slate-500" numberOfLines={2}>
                        {a.audience === 'all'
                          ? 'All borrowers'
                          : `${a.targetUserIds.length} recipient${a.targetUserIds.length === 1 ? '' : 's'}: ${a.targetUserIds.map(nameOf).join(', ')}`}
                        {' · '}
                        {expired ? 'Expired' : a.expiresAt ? `Until ${fmt(a.expiresAt)}` : 'No expiry'}
                      </Text>
                    </View>
                    <Pressable onPress={() => startEdit(a)} className="p-1.5" accessibilityLabel="Edit">
                      <Pencil size={16} color={colors.slate500} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(a)} className="p-1.5" accessibilityLabel="Delete">
                      <Trash2 size={16} color={colors.slate500} />
                    </Pressable>
                  </View>
                )
              })
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Recipients picker */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[75%] rounded-t-3xl bg-white p-3">
            <View className="flex-row items-center justify-between px-2 py-2">
              <Text className="font-sans-bold text-base text-slate-900">Select recipients</Text>
              <Pressable onPress={() => setPicker(false)} className="p-1">
                <X size={22} color={colors.slate500} />
              </Pressable>
            </View>
            <ScrollView>
              {borrowers.map((b: any) => (
                <Pressable
                  key={b.id}
                  onPress={() => toggleTarget(b.id)}
                  className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50"
                >
                  <Text className="font-sans-medium text-sm text-slate-900">{b.name}</Text>
                  <View className={`h-5 w-5 items-center justify-center rounded-md border ${targets.has(b.id) ? 'border-navy-700 bg-navy-700' : 'border-slate-300'}`}>
                    {targets.has(b.id) ? <Check size={14} color="#ffffff" /> : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View className="p-2">
              <Button onPress={() => setPicker(false)}>Done ({targets.size})</Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
