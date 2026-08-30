import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

export type DonutSegment = { key: string; color: string; value: number }

// JS-thread eased driver (easeOutCubic) shared by the ring sweep and the center
// count-up. RAF exists on native and web, so — unlike reanimated's SVG
// animatedProps — the arcs reliably reach their final size on react-native-web.
function useEased(target: number, signature: string, duration = 850) {
  const [val, setVal] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const from = fromRef.current
    const startedAt = Date.now()
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (target - from) * eased
      setVal(next)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // signature retriggers the sweep when the segment mix changes.
  }, [target, signature, duration])
  return val
}

export default function DuesDonutChart({
  size,
  segments,
  centerValue,
  centerFormat,
  centerCaption,
}: {
  size: number
  segments: DonutSegment[]
  centerValue: number
  centerFormat: (n: number) => string
  centerCaption: string
}) {
  const strokeWidth = Math.round(size * 0.13)
  const radius = (size - strokeWidth) / 2
  const cxy = radius + strokeWidth / 2
  const circumference = 2 * Math.PI * radius

  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  // Cumulative start offset per segment (prefix sums — immutable during render).
  const lengths = segments.map((s) => (total > 0 ? Math.max(0, s.value) / total : 0))
  const arcs = segments
    .map((s, i) => ({
      key: s.key,
      color: s.color,
      start: lengths.slice(0, i).reduce((a, b) => a + b, 0),
      length: lengths[i],
    }))
    .filter((a) => a.length > 0)

  const sig = segments.map((s) => Math.round(s.value)).join('|')
  const sweep = useEased(1, sig) // 0→1 ring reveal
  const displayValue = useEased(centerValue, sig, 700)

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {/* Rotate the whole ring so arcs start at 12 o'clock. Using the Svg's
          style transform keeps it valid CSS on web (no invalid-DOM warning). */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={cxy} cy={cxy} r={radius} stroke="#eef2f7" strokeWidth={strokeWidth} fill="none" />
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={cxy}
            cy={cxy}
            r={radius}
            stroke={a.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            fill="none"
            strokeDasharray={`${a.length * circumference * sweep} ${circumference}`}
            strokeDashoffset={-a.start * circumference * sweep}
          />
        ))}
      </Svg>
      {/* Center overlay (unrotated). */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: size, height: size }}
        className="items-center justify-center"
      >
        <Text className="font-mono-semibold text-slate-900" style={{ fontSize: Math.round(size * 0.2) }}>
          {centerFormat(displayValue)}
        </Text>
        <Text className="mt-0.5 font-sans text-xs text-slate-500" numberOfLines={1}>
          {centerCaption}
        </Text>
      </View>
    </View>
  )
}
