import { useEffect, useState } from 'react'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import Icon from '../Icon'

// One banner row. Animates its own height from 0 → auto on mount (grid-rows
// trick) so the page content below smoothly pushes down.
function BannerBar({ a, onDismiss }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    // Defer to the next frame so the 0fr → 1fr transition actually runs.
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // The message scrolls (marquee) so it grabs attention. Two identical copies
  // make the loop seamless; the duration scales with the message length.
  const message = (
    <span className="px-8">
      {a.title && <span className="font-semibold">{a.title} </span>}
      {a.body}
    </span>
  )
  const len = (a.title ? a.title.length + 1 : 0) + a.body.length
  const duration = Math.max(12, Math.round(len * 0.32))

  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${show ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 bg-blue-600 px-4 py-2.5 text-sm text-white">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <div className="relative min-w-0 flex-1 overflow-hidden" aria-live="polite">
            <div className="marquee-track" style={{ animationDuration: `${duration}s` }}>
              {message}
              <span className="px-8" aria-hidden="true">
                {a.title && <span className="font-semibold">{a.title} </span>}
                {a.body}
              </span>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 cursor-pointer rounded-md border border-white/40 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

// Stacked push-down banners shown at the very top of the content area.
export default function AnnouncementBanner() {
  const { banners, dismiss } = useAnnouncements()
  if (banners.length === 0) return null
  return (
    <div>
      {banners.map((a) => (
        <BannerBar key={a.id} a={a} onDismiss={() => dismiss(a)} />
      ))}
    </div>
  )
}
