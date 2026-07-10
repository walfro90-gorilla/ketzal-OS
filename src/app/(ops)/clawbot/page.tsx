import { BotIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { getBandeja } from './data'
import { ClawbotList } from './clawbot-list'

export default async function ClawbotPage() {
  const reminders = await getBandeja()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clawbot</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Recordatorios sugeridos: envíalos por WhatsApp con un clic.
        </p>
      </div>

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
