import { useRef, useState } from 'react'

// 3D coverflow carousel driven by swipe / drag (no nav arrows). Mirrors the
// Cards & Wallet coverflow look: one item centered, neighbours tilted back.
// Tap a side item to centre it; tap the centred item to fire onActivate.
const SWIPE_PX = 40 // horizontal travel that counts as a swipe

export default function SwipeCoverflow({ items, renderItem, onActivate, hint = 'Swipe to switch', height = 150 }) {
  const n = items.length
  const [active, setActive] = useState(0)
  // Size the stage to the tallest actual card so it fits snugly (no dead space).
  const [measuredH, setMeasuredH] = useState(0)
  const cardH = measuredH || height
  const measure = (el) => {
    if (el) setMeasuredH((p) => (el.offsetHeight > p ? el.offsetHeight : p))
  }
  const drag = useRef({ startX: 0, down: false, moved: false })
  const go = (i) => setActive(Math.max(0, Math.min(n - 1, i)))

  const onDown = (e) => {
    drag.current = { startX: e.clientX, down: true, moved: false }
  }
  const onMove = (e) => {
    if (drag.current.down && Math.abs(e.clientX - drag.current.startX) > 8) drag.current.moved = true
  }
  const onUp = (e) => {
    if (!drag.current.down) return
    const dx = e.clientX - drag.current.startX
    drag.current.down = false
    if (dx <= -SWIPE_PX) go(active + 1)
    else if (dx >= SWIPE_PX) go(active - 1)
  }

  const clickItem = (i) => {
    if (drag.current.moved) return // was a swipe, not a tap
    if (i !== active) go(i)
    else onActivate?.(items[i])
  }

  return (
    <div className="select-none">
      <div
        className="relative touch-pan-y overflow-hidden"
        style={{ height: cardH, perspective: '1300px' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {items.map((it, i) => {
          const off = i - active
          const abs = Math.abs(off)
          const hidden = abs > 2
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => clickItem(i)}
              aria-label={off === 0 ? 'Open' : 'Bring to front'}
              className="absolute left-1/2 top-1/2 w-64 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.3,1)]"
              style={{
                transform: `translate(-50%, -50%) translateX(${off * 132}px) translateZ(${-abs * 90}px) rotateY(${off * -38}deg) scale(${1 - abs * 0.05})`,
                zIndex: 100 - abs,
                opacity: hidden ? 0 : 1 - abs * 0.18,
                pointerEvents: hidden ? 'none' : 'auto',
                filter: off === 0 ? 'none' : 'brightness(0.82)',
              }}
            >
              <div ref={measure}>{renderItem(it, off === 0)}</div>
            </button>
          )
        })}
      </div>

      {/* Page dots + swipe hint (no arrows — swipe or tap a side card). */}
      <div className="mt-1 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${it.label ?? `item ${i + 1}`}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === active ? 'w-4 bg-navy-700' : 'w-1.5 cursor-pointer bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
        <p className="flex items-center gap-1 text-xs text-slate-400">
          <span aria-hidden>←</span> {hint} <span aria-hidden>→</span>
        </p>
      </div>
    </div>
  )
}
