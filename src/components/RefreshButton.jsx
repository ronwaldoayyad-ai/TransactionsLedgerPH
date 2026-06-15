import { useApp } from '../context/AppContext'
import Icon from './Icon'
import { Button } from './ui'

// Re-syncs all data from Supabase. Hidden in demo mode (nothing to sync).
// Surfaces a sync error (if the last refresh partially failed) as a tooltip
// title so the failure is visible rather than silent.
export default function RefreshButton({ className = '' }) {
  const { refreshData, refreshing, realSession, syncError } = useApp()
  if (realSession?.source !== 'supabase') return null
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        onClick={refreshData}
        disabled={refreshing}
        className={className}
        title={syncError ?? 'Re-sync data from the database'}
      >
        <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>
      {syncError && !refreshing && (
        <span
          role="alert"
          title={syncError}
          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
        >
          <Icon name="alert" className="h-3.5 w-3.5" />
          Sync issue
        </span>
      )}
    </div>
  )
}
