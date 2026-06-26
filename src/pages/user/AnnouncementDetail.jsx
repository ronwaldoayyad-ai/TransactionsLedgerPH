import { Link, useParams } from 'react-router-dom'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import { PageHeader } from '../../components/AppShell'
import { Card } from '../../components/ui'

// "Read more" target for long toast announcements.
export default function AnnouncementDetail() {
  const { id } = useParams()
  const { getById } = useAnnouncements()
  const a = getById(id)

  return (
    <>
      <PageHeader title="Announcement" subtitle="A message from your lender" />
      <div className="mx-auto max-w-2xl">
        <Card className="p-6">
          {a ? (
            <>
              {a.title && <h2 className="text-xl font-bold text-slate-900">{a.title}</h2>}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{a.body}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">This announcement is no longer available.</p>
          )}
          <Link
            to="/portal"
            className="mt-6 inline-block text-sm font-medium text-navy-700 transition-colors hover:text-navy-900 hover:underline"
          >
            ← Back to dashboard
          </Link>
        </Card>
      </div>
    </>
  )
}
