import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function destino(city: string | null, state: string | null): string {
  const p = [city, state].filter(Boolean)
  return p.length > 0 ? p.join(', ') : '—'
}

const ROL_TONO: Record<string, string> = {
  Dueño: 'bg-primary/10 text-primary',
  Transporte: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  Hospedaje: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

type Servicio = {
  id: string
  name: string
  service_type: string | null
  city_to: string | null
  state_to: string | null
  published: boolean
  rol: string
}
type ProviderData = { supplier: string | null; servicios: Servicio[] }

export default async function ProveedorPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_provider_services' as never)
  const d = (data ?? { supplier: null, servicios: [] }) as unknown as ProviderData

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {d.supplier ?? 'Tu panel'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los viajes donde participas como dueño, transporte u hospedaje.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          No se pudieron cargar tus servicios: {error.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Tus servicios
            {d.servicios.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {d.servicios.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>Vista de solo lectura.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.servicios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay viajes que te tengan asignado. Cuando una agencia te use
              como proveedor, aparecerán aquí.
            </p>
          ) : (
            <ul className="divide-y">
              {d.servicios.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.service_type ? `${capitalizar(s.service_type)} · ` : ''}
                      {destino(s.city_to, s.state_to)}
                      {!s.published ? ' · sin publicar' : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      ROL_TONO[s.rol] ?? 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {s.rol}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
