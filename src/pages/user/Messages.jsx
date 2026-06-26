import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { PageHeader } from '../../components/AppShell'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import ChatThread from '../../components/messaging/ChatThread'
import { Button, Card, Modal } from '../../components/ui'

export default function UserMessages() {
  const { session, users } = useApp()
  const { messagesFor, sendMessage, markRead, reactToMessage, togglePin, deleteMessage, clearConversation, unreadTotal } =
    useMessages()
  const meId = session.user.id

  const admin = users.find((u) => u.role === 'admin')
  const lenderName = admin?.name?.split(' ')[0] || 'your lender'
  const lender = admin ?? { id: 'lender', name: lenderName }
  const thread = messagesFor(meId)
  const [clearing, setClearing] = useState(false)

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
            {admin?.avatarUrl ? (
              <Avatar user={admin} size={38} className="ring-2 ring-white/30" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
                <Icon name="mail" className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{admin ? admin.name : 'In-app Support'}</p>
              <p className="truncate text-xs text-white/70">Messages go straight to {lenderName}</p>
            </div>
            {thread.length > 0 && (
              <button
                onClick={() => setClearing(true)}
                title="Clear chat history"
                aria-label="Clear chat history"
                className="shrink-0 cursor-pointer rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
          </div>
          <ChatThread
            messages={thread}
            isAdmin={false}
            meUser={session.user}
            otherUser={lender}
            onSend={(t) => sendMessage(meId, t)}
            onReact={reactToMessage}
            onTogglePin={togglePin}
            onDeleteMessage={deleteMessage}
            placeholder={`Message ${lenderName}…`}
            greeting={`Hi! Your message will be delivered directly to ${lenderName}.`}
          />
        </Card>
      </div>

      <Modal
        open={clearing}
        title="Clear chat history?"
        onClose={() => setClearing(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearing(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await clearConversation(meId)
                setClearing(false)
              }}
            >
              <Icon name="trash" className="h-4 w-4" />
              Delete all messages
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently deletes your entire conversation with {lenderName} for both of you. This
          can&apos;t be undone.
        </p>
      </Modal>
    </>
  )
}
