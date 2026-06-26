import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { PageHeader } from '../../components/AppShell'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import ChatThread from '../../components/messaging/ChatThread'
import { Card } from '../../components/ui'
import { toISODate } from '../../lib/amortization'
import { isReceivable } from '../../lib/transactions'

export default function AdminMessages() {
  const { session, users, transactions } = useApp()
  const { messagesFor, sendMessage, markRead, unreadByBorrower } = useMessages()
  const today = toISODate(new Date())
  const firstName = (session.user.name || 'My').split(' ')[0]

  const [selectedId, setSelectedId] = useState(null)
  const [collapsed, setCollapsed] = useState({}) // group key → bool

  // Borrowers split into those with live receivables vs. everyone else.
  const { active, archived } = useMemo(() => {
    const borrowers = users.filter((u) => u.role === 'user')
    const hasReceivable = (id) => transactions.some((t) => t.userId === id && isReceivable(t, today))
    return {
      active: borrowers.filter((b) => hasReceivable(b.id)),
      archived: borrowers.filter((b) => !hasReceivable(b.id)),
    }
  }, [users, transactions, today])

  const selected = users.find((u) => u.id === selectedId) ?? null
  const thread = selectedId ? messagesFor(selectedId) : []

  // Mark the open conversation read whenever it changes or new mail lands.
  useEffect(() => {
    if (!selectedId) return
    if ((unreadByBorrower[selectedId] ?? 0) > 0) markRead(selectedId)
  }, [selectedId, unreadByBorrower, markRead])

  const groups = [
    ['active', 'Active Loans', active],
    ['archived', 'Archived', archived],
  ]

  return (
    <>
      <PageHeader title="Messages" subtitle="Direct, real-time conversations with your borrowers." />
      <Card className="flex h-[74vh] overflow-hidden p-0">
        {/* LEFT: borrower list */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-slate-200 sm:flex sm:w-80 ${selectedId ? 'hidden sm:flex' : 'flex'}`}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3.5">
            <Icon name="mail" className="h-5 w-5 text-white" />
            <h2 className="text-sm font-semibold text-white">{firstName}&apos;s Messages</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.map(([key, label, list]) => (
              <div key={key}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
                  className="flex w-full cursor-pointer items-center justify-between bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100"
                >
                  {label}
                  <Icon name="chevron" className={`h-4 w-4 transition-transform ${collapsed[key] ? '-rotate-90' : ''}`} />
                </button>
                {!collapsed[key] &&
                  (list.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">No borrowers.</p>
                  ) : (
                    list.map((b) => {
                      const unread = unreadByBorrower[b.id] ?? 0
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedId(b.id)}
                          className={`flex w-full cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                            selectedId === b.id ? 'bg-navy-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <Avatar user={b} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>
                              {b.name}
                            </span>
                          </span>
                          {unread > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-xs font-semibold text-white">
                              {unread}
                            </span>
                          )}
                        </button>
                      )
                    })
                  ))}
              </div>
            ))}
          </div>
        </aside>

        {/* RIGHT: conversation */}
        <section className={`min-w-0 flex-1 flex-col ${selectedId ? 'flex' : 'hidden sm:flex'}`}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to list"
                  className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden"
                >
                  <Icon name="chevron" className="h-5 w-5 rotate-90" />
                </button>
                <Avatar user={selected} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">Conversation with {selected.name}</p>
                  <p className="truncate text-xs text-slate-500">{selected.email}</p>
                </div>
              </div>
              <ChatThread
                messages={thread}
                isAdmin
                meUser={session.user}
                otherUser={selected}
                onSend={(t) => sendMessage(selectedId, t)}
                placeholder={`Message ${selected.name.split(' ')[0]}…`}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="rounded-full bg-slate-100 p-4 text-slate-400">
                <Icon name="mail" className="h-7 w-7" />
              </span>
              <p className="text-sm font-medium text-slate-600">Select a borrower to start chatting</p>
              <p className="max-w-xs text-xs text-slate-400">Unread conversations show a badge in the list and the sidebar.</p>
            </div>
          )}
        </section>
      </Card>
    </>
  )
}
