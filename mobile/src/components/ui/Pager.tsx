import { Pressable, Text, View } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { colors } from '../../theme'

// Compact list pager. Renders nothing for a single page. Pairs with the
// usePagination hook (page/pageCount/total/start/end + setPage).
export default function Pager({
  page,
  pageCount,
  total,
  start,
  end,
  onPage,
  label = 'items',
}: {
  page: number
  pageCount: number
  total: number
  start: number
  end: number
  onPage: (n: number) => void
  label?: string
}) {
  if (pageCount <= 1) return null
  const prevOff = page <= 1
  const nextOff = page >= pageCount
  return (
    <View className="flex-row items-center justify-between border-t border-slate-100 px-4 py-2.5">
      <Text className="font-sans text-[11px] text-slate-500">
        {start + 1}–{end} of {total} {label}
      </Text>
      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => onPage(page - 1)}
          disabled={prevOff}
          hitSlop={6}
          accessibilityLabel="Previous page"
          className={`rounded-lg p-1.5 ${prevOff ? 'opacity-30' : ''}`}
        >
          <ChevronLeft size={18} color={colors.navy700} />
        </Pressable>
        <Text className="font-sans-medium text-xs text-slate-600">
          {page}/{pageCount}
        </Text>
        <Pressable
          onPress={() => onPage(page + 1)}
          disabled={nextOff}
          hitSlop={6}
          accessibilityLabel="Next page"
          className={`rounded-lg p-1.5 ${nextOff ? 'opacity-30' : ''}`}
        >
          <ChevronRight size={18} color={colors.navy700} />
        </Pressable>
      </View>
    </View>
  )
}
