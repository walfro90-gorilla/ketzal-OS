import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { MapPinnedIcon } from 'lucide-react'
import { SalidasList } from './salidas-list'
import type { Salida } from './tipos'

export default async function SalidasPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_departures' as never)
  const salidas = (data ?? []) as unknown as Salida[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salidas"
        description="Las salidas que opera tu agencia: ocupación y captura de pasajeros."
      />
      <Card>
        <CardContent className="pt-6">
          <SalidasList
            rows={salidas}
            empty={
              <EmptyState
                icon={MapPinnedIcon}
                title="No hay salidas próximas"
                description="Las salidas se dan de alta en el servicio (con su cupo). Aquí verás las de los servicios que opera tu agencia."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
