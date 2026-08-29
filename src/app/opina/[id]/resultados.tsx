import Link from 'next/link'
import { CheckCircle2Icon, UsersIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarrasPorcentaje } from '@/components/data/barras-porcentaje'
import { etiquetaMes } from '@/lib/domain/encuesta'
import type { PublicPoll } from '@/lib/public/encuesta'

// Lo que ve el votante después de opinar (o si la encuesta ya cerró): el pulso
// de los demás como prueba social, y las dos puertas a Ketzal.

export function Resultados({ poll, cerrada }: { poll: PublicPoll; cerrada: boolean }) {
  const etiquetas = new Map(poll.options.map((o) => [o.id, o.label]))
  const destinos = poll.by_option.map((b) => ({
    label: etiquetas.get(b.id) ?? 'Otro',
    votes: b.votes,
  }))
  const meses = poll.by_month.map((b) => ({ label: etiquetaMes(b.month), votes: b.votes }))

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 text-center">
        {cerrada ? (
          <p className="font-display text-lg">Esta encuesta ya cerró</p>
        ) : (
          <p className="flex items-center justify-center gap-2 font-display text-lg">
            <CheckCircle2Icon className="size-5 text-[var(--success)]" />
            ¡Listo, tu voto quedó!
          </p>
        )}
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <UsersIcon className="size-4" />
          {poll.total_votes} {poll.total_votes === 1 ? 'persona ha opinado' : 'personas han opinado'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A dónde quiere ir la banda</CardTitle>
        </CardHeader>
        <CardContent>
          <BarrasPorcentaje datos={destinos} total={poll.total_votes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuándo les late</CardTitle>
        </CardHeader>
        <CardContent>
          <BarrasPorcentaje datos={meses} total={poll.total_votes} />
        </CardContent>
      </Card>

      <div className="space-y-3 rounded-xl border bg-muted/40 p-5">
        <p className="font-display text-lg">Mientras se arma, ve lo que ya sale</p>
        <p className="text-sm text-muted-foreground">
          Crea tu cuenta para apartar con el mínimo en cuanto abramos la salida ganadora.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/entrar?next=/explora" className={buttonVariants({ size: 'lg' })}>
            Crear mi cuenta
          </Link>
          <Link
            href="/explora"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            Ver los viajes
          </Link>
        </div>
      </div>
    </div>
  )
}
