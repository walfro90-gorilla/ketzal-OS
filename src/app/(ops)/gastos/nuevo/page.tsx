import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { GastoForm } from '../gasto-form'

export default async function NuevoGastoPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const defaultCategory = typeof sp.category === 'string' ? sp.category : undefined
  const defaultProvider = typeof sp.provider === 'string' ? sp.provider : undefined

  const supabase = await createClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id, name')
    .order('name')
  const proveedores = (data ?? []) as { id: string; name: string }[]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Nuevo gasto"
        backHref="/gastos"
        backLabel="Volver a gastos"
      />
      <Card>
        <CardHeader>
          <CardTitle>Registrar egreso</CardTitle>
        </CardHeader>
        <CardContent>
          <GastoForm
            proveedores={proveedores}
            defaultCategory={defaultCategory}
            defaultProvider={defaultProvider}
          />
        </CardContent>
      </Card>
    </div>
  )
}
