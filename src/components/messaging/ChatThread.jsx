import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import Avatar from '../Avatar'
import EmojiPicker from './EmojiPicker'
import { QUICK_REACTIONS } from './emoji'

const timeLabel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

const reactionCounts = (reactions) => {
  const counts = {}
  Object.values(reactions || {}).forEach((e) => {
    counts[e] = (counts[e] ?? 0) + 1
  })
  return Object.entries(counts) // [['👍', 1], ...]
}

// Message list + composer. `isAdmin` decides which bubbles are "mine". Supports
// emoji reactions, pinning, per-message + whole-thread deletion, and an emoji
// composer. `greeting` renders a static system bubble at the top.
export default function ChatThread({
  messages,
  isAdmin,
  meUser,
  otherUser,
  onSend,
  placeholder = 'Message…',
  greeting,
  disabled = false,
  onReact,
  onTogglePin,
  onDeleteMessage,
}) {
  const [text, setText] = useState('')
  const [activeId, setActiveId] = useState(null) // message whose toolbar is tapped open (mobile)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText('')
    setEmojiOpen(false)
  }

  const pinned = messages.find((m) => m.pinned)
  const myRole = isAdmin ? 'admin' : 'borrower'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Pinned banner */}
      {pinned && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <Icon name="pin" className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate text-amber-900">
            <span className="font-semibold">Pinned:</span> {pinned.body}
          </span>
          {onTogglePin && (
            <button
              onClick={() => onTogglePin(pinned.id)}
              className="shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Unpin
            </button>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-5 sm:px-6">
        {greeting && (
          <div className="flex justify-center pb-2">
            <p className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-center text-sm text-slate-600">
              {greeting}
            </p>
          </div>
        )}
        {messages.length === 0 && !greeting ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">No messages yet — say hello 👋</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.fromAdmin === isAdmin
            const who = mine ? meUser : otherUser
            const endOfRun = i === messages.length - 1 || messages[i + 1].fromAdmin !== m.fromAdmin
            const gutter = endOfRun ? (
              <Avatar user={who} size={30} className="self-end" />
            ) : (
              <span className="w-[30px] shrink-0" />
            )
            const reacts = reactionCounts(m.reactions)
            const open = activeId === m.id
            return (
              <div key={m.id} className={`group flex items-end gap-2 py-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && gutter}
                <div className={`relative flex max-w-[74%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {/* Hover/tap toolbar: quick reactions + pin + delete */}
                  <div
                    className={`absolute -top-9 z-10 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1 py-0.5 shadow-md transition-opacity duration-150 ${
                      mine ? 'right-0' : 'left-0'
                    } ${open ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}
                  >
                    {QUICK_REACTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => onReact?.(m.id, e)}
                        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-base transition-transform hover:scale-110 ${
                          m.reactions?.[myRole] === e ? 'bg-navy-100' : 'hover:bg-slate-100'
                        }`}
                        aria-label={`React ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                    <span className="mx-0.5 h-4 w-px bg-slate-200" />
                    {onTogglePin && (
                      <button
                        type="button"
                        onClick={() => onTogglePin(m.id)}
                        title={m.pinned ? 'Unpin' : 'Pin'}
                        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100 ${m.pinned ? 'text-amber-600' : 'text-slate-500'}`}
                      >
                        <Icon name="pin" className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(m.id)}
                        title="Delete message"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveId(open ? null : m.id)}
                    className={`relative cursor-pointer rounded-2xl px-3.5 py-2 text-left text-sm ${
                      mine ? 'rounded-br-md bg-navy-800 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.pinned && (
                      <Icon name="pin" className={`mr-1 inline h-3 w-3 align-[-1px] ${mine ? 'text-amber-300' : 'text-amber-600'}`} />
                    )}
                    {m.body}
                  </button>

                  {/* Reaction pills */}
                  {reacts.length > 0 && (
                    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {reacts.map(([emoji, count]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => onReact?.(m.id, emoji)}
                          className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                            m.reactions?.[myRole] === emoji
                              ? 'border-navy-300 bg-navy-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span className="text-slate-500">{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="mt-1 px-1 text-[11px] text-slate-400">
                    {timeLabel(m.createdAt)}
                    {mine && m.readAt ? ' · Read' : ''}
                  </span>
                </div>
                {mine && gutter}
              </div>
            )
          })
        )}
      </div>

      <div className="relative border-t border-slate-100 px-3 py-3 sm:px-4">
        {emojiOpen && (
          <EmojiPicker
            className="bottom-16 left-3"
            onPick={(e) => setText((t) => t + e)}
            onClose={() => setEmojiOpen(false)}
          />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            aria-label="Add emoji"
            className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
              emojiOpen ? 'bg-navy-100 text-navy-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Icon name="smile" className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            aria-label="Message"
            className="min-h-11 flex-1 rounded-full border border-slate-300/80 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-800 text-white transition-[background-color,transform] duration-150 hover:bg-navy-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Icon name="send" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
