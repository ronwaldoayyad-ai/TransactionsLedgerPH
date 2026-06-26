import { useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import ChatThread from '../../components/messaging/ChatThread'
import { Card } from '../../components/ui'

export default function UserMessages() {
  const { session, users } = useApp()
  const { messagesFor, sendMessage, markRead, unreadTotal } = useMessages()
  const meId = session.user.id

  const admin = users.find((u) => u.role === 'admin')
  const lenderName = admin?.name?.split(' ')[0] || 'your lender'
  const thread = messagesFor(meId)

  // Reading the page clears the borrower's unread badge.
  useEffect(() => {
    if (unreadTotal > 0) markRead(meId)
  }, [unreadTotal, markRead, meId])

  return (
    <>
      <PageHeader title="Messages" subtitle="Chat directly with your lender — replies arrive in real time." />
      <div className="mx-auto max-w-2xl">
        <Card className="flex h-[72vh] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 bg-navy-800 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
              <Icon name="mail" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">In-app Support</p>
              <p className="text-xs text-white/70">Messages go straight to {lenderName}</p>
            </div>
          </div>
          <ChatThread
            messages={thread}
            isAdmin={false}
            meUser={session.user}
            otherUser={admin ?? { id: 'lender', name: lenderName }}
            onSend={(t) => sendMessage(meId, t)}
            placeholder={`Message ${lenderName}…`}
            greeting={`Hi! Your message will be delivered directly to ${lenderName}.`}
          />
        </Card>
      </div>
    </>
  )
}
