import { View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'

export type DonutSlice = { key: string; value: number; color: string }

// Lightweight donut/pie built on react-native-svg (recharts has no RN build).
// Slices are drawn as stroked arcs via strokeDasharray, so a single 100% slice
// renders a full ring (no degenerate-arc issue). Empty data shows a grey track.
export default function Donut({
  data,
  size = 150,
  thickness = 26,
}: {
  data: DonutSlice[]
  size?: number
  thickness?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          {total <= 0 ? (
            <Circle cx={cx} cy={cy} r={r} stroke="#e2e8f0" strokeWidth={thickness} fill="none" />
          ) : (
            data.map((d) => {
              const dash = (d.value / total) * circ
              const el = (
                <Circle
                  key={d.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={d.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              )
              offset += dash
              return el
            })
          )}
        </G>
      </Svg>
    </View>
  )
}
