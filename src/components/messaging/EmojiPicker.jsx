import { useEffect } from 'react'
import { EMOJIS } from './emoji'

// Lightweight emoji popover. The parent renders it inside a `relative` wrapper
// and controls open/close; a transparent backdrop closes it on outside click.
export default function EmojiPicker({ onPick, onClose, className = '' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button aria-label="Close emoji picker" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div className={`absolute z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ${className}`}>
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg transition-colors hover:bg-slate-100"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
