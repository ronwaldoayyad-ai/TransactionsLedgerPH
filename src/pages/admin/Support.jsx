import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import LocalLenderOperations from '../../components/LocalLenderOperations'

export default function Support() {
  const { users } = useApp()
  return <><PageHeader title="Support tickets" subtitle="Review borrower and guest requests, attachments and status history." /><LocalLenderOperations borrowers={users.filter(user => user.role === 'user')} section="support" /></>
}
