import { BotIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { getBandeja } from './data'
import { ClawbotList } from './clawbot-list'

export default async function ClawbotPage() {
  const reminders = await getBandeja()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clawbot"
        description="Recordatorios sugeridos: envíalos por WhatsApp con un clic."
      />

      {reminders.length === 0 ? (
        <EmptyState
          icon={BotIcon}
          title="Todo al día"
          description="Clawbot no tiene recordatorios pendientes."
        />
      ) : (
        <ClawbotList reminders={reminders} />
      )}
    </div>
  )
}
