import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { assertSuperadmin } from '../guard'
import { ViajeroForm } from '../viajero-form'

export default async function NuevoViajeroPage() {
  await assertSuperadmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Nuevo viajero"
        backHref="/viajeros"
        backLabel="Volver a viajeros"
      />
      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta de comprador</CardTitle>
        </CardHeader>
        <CardContent>
          <ViajeroForm />
        </CardContent>
      </Card>
    </div>
  )
}
