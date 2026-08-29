import Link from 'next/link'
import { VoteIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { etiquetaMes } from '@/lib/domain/encuesta'
import { ESTADO_LABEL, type Poll, type PollStatus } from './tipos'

// Investigación de mercado (m002): las encuestas que la agencia publica y pega
// en Meta Ads. La RLS (`polls_scoped_sel`) ya acota por agencia — aquí no se
// filtra por supplier_id a mano.

const VARIANTE: Record<PollStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  open: 'success',
  closed: 'outline',
}

type Fila = Poll & { votos: number }

export default async function InvestigacionPage() {
  const supabase = await createClient()

  const { data: polls } = await supabase
    .from('polls' as never)
    .select('id, supplier_id, question, options, month_from, month_to, status, closes_at, created_at')
    .order('created_at', { ascending: false })

  const lista = (polls ?? []) as unknown as Poll[]

  // Un `count` por encuesta en vez de traerse los votos para contarlos en TS:
  // PostgREST corta la respuesta en 1000 filas por default y el conteo saldría
  // corto en silencio justo cuando la campaña funciona.
  const conteos = await Promise.all(
    lista.map(async (p) => {
      const { count } = await supabase
        .from('poll_votes' as never)
        .select('id', { count: 'exact', head: true })
        .eq('poll_id', p.id)
      return count ?? 0
    }),
  )

  const filas: Fila[] = lista.map((p, i) => ({ ...p, votos: conteos[i] }))

  const columns: DataColumn<Fila>[] = [
    { header: 'Pregunta', primary: true, cell: (f) => f.question },
    {
      header: 'Estado',
      cell: (f) => <Badge variant={VARIANTE[f.status]}>{ESTADO_LABEL[f.status]}</Badge>,
    },
    {
      header: 'Meses',
      cell: (f) => (
        <span className="capitalize">
          {etiquetaMes(f.month_from)} – {etiquetaMes(f.month_to)}
        </span>
      ),
    },
    {
      header: 'Votos',
      align: 'right',
      cell: (f) => <span className="tabular-nums">{f.votos}</span>,
      sortValue: (f) => f.votos,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investigación de mercado"
        description="Pregúntale al mercado a dónde y cuándo quiere viajar antes de armar la salida."
        action={
          <Link href="/investigacion/nueva" className={buttonVariants()}>
            Nueva encuesta
          </Link>
        }
      />

      <DataList
        columns={columns}
        rows={filas}
        getRowKey={(f) => f.id}
        rowHref={(f) => `/investigacion/${f.id}`}
        empty={
          <EmptyState
            icon={VoteIcon}
            title="Todavía no hay encuestas"
            description="Crea una, ábrela y pega su liga en un anuncio de Meta. Quien la vea vota sin registrarse."
            action={
              <Link href="/investigacion/nueva" className={buttonVariants()}>
                Nueva encuesta
              </Link>
            }
          />
        }
      />
    </div>
  )
}
