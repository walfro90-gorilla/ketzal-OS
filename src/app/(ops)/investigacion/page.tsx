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

  const [{ data: polls }, { data: votos }] = await Promise.all([
    supabase
      .from('polls' as never)
      .select('id, supplier_id, question, options, month_from, month_to, status, closes_at, created_at')
      .order('created_at', { ascending: false }),
    // Conteo en TS: son decenas de encuestas y unos miles de votos como techo.
    // ponytail: si el volumen crece, esto se vuelve un RPC agregado.
    supabase.from('poll_votes' as never).select('poll_id'),
  ])

  const porEncuesta = new Map<string, number>()
  for (const v of (votos ?? []) as unknown as { poll_id: string }[]) {
    porEncuesta.set(v.poll_id, (porEncuesta.get(v.poll_id) ?? 0) + 1)
  }
  const filas: Fila[] = ((polls ?? []) as unknown as Poll[]).map((p) => ({
    ...p,
    votos: porEncuesta.get(p.id) ?? 0,
  }))

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
