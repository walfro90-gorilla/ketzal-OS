import { notFound } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { assertSuperadmin } from '../guard'
import { ViajeroForm } from '../viajero-form'
import { ViajeroPeligro } from '../viajero-peligro'
import type { Viajero } from '../viajeros-list'

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

export default async function ViajeroDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await assertSuperadmin()

  const { data } = await supabase.rpc('list_travelers' as never)
  const viajeros = (data ?? []) as unknown as Viajero[]
  const viajero = viajeros.find((v) => v.id === id)
  if (!viajero) notFound()

  const registrado = (() => {
    const p = new Date(viajero.created_at)
    return Number.isNaN(p.getTime()) ? viajero.created_at : fecha.format(p)
  })()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={viajero.full_name}
        description="Cuenta de comprador del marketplace."
        backHref="/viajeros"
        backLabel="Volver a viajeros"
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos de contacto</CardTitle>
          <CardDescription>
            Registrado el {registrado} ·{' '}
            {viajero.num_compras === 1
              ? '1 compra'
              : `${viajero.num_compras} compras`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViajeroForm viajero={viajero} />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Zona de peligro</CardTitle>
          <CardDescription>
            {viajero.num_compras > 0
              ? 'No se puede eliminar: tiene compras registradas (datos ligados a dinero).'
              : 'Elimina permanentemente la cuenta de este viajero.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViajeroPeligro
            id={viajero.id}
            nombre={viajero.full_name}
            numCompras={viajero.num_compras}
          />
        </CardContent>
      </Card>
    </div>
  )
}
