import Link from 'next/link'
import { PlusIcon, UserRoundIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { assertSuperadmin } from './guard'
import { ViajerosList, type Viajero } from './viajeros-list'

export default async function ViajerosPage() {
  const { supabase } = await assertSuperadmin()

  const { data } = await supabase.rpc('list_travelers' as never)
  const viajeros = (data ?? []) as unknown as Viajero[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viajeros"
        description="Compradores del marketplace (cuentas B2C). Solo visibles para el god admin."
        action={
          <Link
            href="/viajeros/nuevo"
            className={buttonVariants({ variant: 'default' })}
          >
            <PlusIcon className="size-4" />
            Nuevo viajero
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <ViajerosList
            rows={viajeros}
            empty={
              <EmptyState
                icon={UserRoundIcon}
                title="Aún no hay viajeros"
                description="Cuando alguien cree una cuenta de comprador en el marketplace —o la crees tú— aparecerá aquí."
                action={
                  <Link
                    href="/viajeros/nuevo"
                    className={buttonVariants({ variant: 'default' })}
                  >
                    Nuevo viajero
                  </Link>
                }
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
