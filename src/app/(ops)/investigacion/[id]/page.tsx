import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLinkIcon, MessageCircleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { BarrasPorcentaje } from '@/components/data/barras-porcentaje'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { etiquetaMes, linkWhatsapp, mesesDelRango } from '@/lib/domain/encuesta'
import { ESTADO_LABEL, type Poll, type PollStatus, type PollVote } from '../tipos'
import { EstadoBotones } from './estado-botones'
import { CompartirLink } from './compartir-link'
import { LeadsCsv } from './leads-csv'

// Detalle de una encuesta: lo que contestó el mercado y a quién hay que llamar.
// La RLS acota a la agencia dueña — incluida la PII de los leads.

const VARIANTE: Record<PollStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  open: 'success',
  closed: 'outline',
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/** Tope del listado de votos individuales (leads y sugerencias). Los agregados
 *  no dependen de esto: salen de `count` en SQL. */
const TOPE_LISTADO = 2000

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export default async function EncuestaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pollRaw } = await supabase
    .from('polls' as never)
    .select('id, supplier_id, question, options, month_from, month_to, status, closes_at, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!pollRaw) notFound()
  const poll = pollRaw as unknown as Poll

  const etiquetas: Record<number, string> = Object.fromEntries(
    poll.options.map((o) => [o.id, o.label]),
  )

  // Los agregados salen de `count` en SQL, no de contar filas traídas: PostgREST
  // corta en 1000 y las barras mentirían justo cuando la campaña funcionó.
  const [total, porDestino, porMes, listado] = await Promise.all([
    supabase
      .from('poll_votes' as never)
      .select('id', { count: 'exact', head: true })
      .eq('poll_id', id)
      .then((r) => r.count ?? 0),
    Promise.all(
      poll.options.map(async (o) => {
        const { count } = await supabase
          .from('poll_votes' as never)
          .select('id', { count: 'exact', head: true })
          .eq('poll_id', id)
          .eq('option_id', o.id)
        return { label: o.label, votes: count ?? 0 }
      }),
    ),
    Promise.all(
      mesesDelRango(poll.month_from, poll.month_to).map(async (m) => {
        const { count } = await supabase
          .from('poll_votes' as never)
          .select('id', { count: 'exact', head: true })
          .eq('poll_id', id)
          .eq('preferred_month', `${m}-01`)
        return { label: etiquetaMes(m), votes: count ?? 0 }
      }),
    ),
    // Las filas sí se traen (hacen falta el contacto y el texto), con tope
    // explícito para que el corte sea visible en la UI y no silencioso.
    supabase
      .from('poll_votes' as never)
      .select('id, poll_id, option_id, preferred_month, suggestion, contact, meta, created_at')
      .eq('poll_id', id)
      .order('created_at', { ascending: false })
      .range(0, TOPE_LISTADO),
  ])

  const votos = (listado.data ?? []) as unknown as PollVote[]
  const truncado = votos.length > TOPE_LISTADO

  const destinos = porDestino.filter((d) => d.votes > 0).sort((a, b) => b.votes - a.votes)
  const meses = porMes.filter((m) => m.votes > 0)

  const leads = votos.filter((v) => v.contact)
  const sugerencias = votos.filter((v) => v.suggestion)

  const urlPublica = `${siteUrl}/opina/${poll.id}?utm_source=meta&utm_medium=cpc&utm_campaign=${slug(poll.question)}`

  const columnasLeads: DataColumn<PollVote>[] = [
    {
      header: 'Contacto',
      primary: true,
      cell: (v) => {
        const wa = linkWhatsapp(v.contact)
        return wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            <MessageCircleIcon className="size-4" />
            {v.contact}
          </a>
        ) : (
          v.contact
        )
      },
    },
    { header: 'Destino', cell: (v) => etiquetas[v.option_id] ?? '—' },
    {
      header: 'Mes',
      cell: (v) => <span className="capitalize">{etiquetaMes(v.preferred_month.slice(0, 7))}</span>,
    },
    { header: 'Campaña', cell: (v) => v.meta?.utm_campaign ?? v.meta?.utm_source ?? '—' },
    { header: 'Fecha', align: 'right', cell: (v) => v.created_at.slice(0, 10) },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={poll.question}
        backHref="/investigacion"
        backLabel="Investigación"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={VARIANTE[poll.status]}>{ESTADO_LABEL[poll.status]}</Badge>
            <span className="capitalize">
              {etiquetaMes(poll.month_from)} – {etiquetaMes(poll.month_to)}
            </span>
            <span>· {total} {total === 1 ? 'voto' : 'votos'}</span>
            {poll.closes_at && <span>· cierra el {poll.closes_at}</span>}
          </span>
        }
        action={
          <Link
            href={`/investigacion/${poll.id}/editar`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Editar
          </Link>
        }
      />

      <EstadoBotones id={poll.id} status={poll.status} />

      {poll.status !== 'draft' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liga para el anuncio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CompartirLink url={urlPublica} />
            <a
              href={`/opina/${poll.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" />
              Ver la página como la ve el público
            </a>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A dónde quieren ir</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasPorcentaje datos={destinos} total={total} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cuándo</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasPorcentaje datos={meses} total={total} />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">
            Leads ({leads.length})
          </h2>
          <LeadsCsv votos={leads} etiquetas={etiquetas} nombre={slug(poll.question)} />
        </div>
        <p className="text-sm text-muted-foreground">
          Quienes dejaron contacto esperando que el viaje se arme. Escríbeles cuando abras
          la salida ganadora.
        </p>
        {truncado && (
          <p className="text-sm text-[var(--warning)]">
            Mostrando los {TOPE_LISTADO} votos más recientes. Los porcentajes de arriba sí
            cuentan los {total}.
          </p>
        )}
        <DataList
          columns={columnasLeads}
          rows={leads}
          getRowKey={(v) => v.id}
          empty={
            <EmptyState
              title="Todavía nadie deja contacto"
              description="Los votos anónimos sí cuentan para los resultados de arriba."
            />
          }
        />
      </section>

      {sugerencias.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl">Lo que escribieron ({sugerencias.length})</h2>
          <ul className="space-y-2">
            {sugerencias.map((v) => (
              <li key={v.id} className="rounded-lg border bg-card p-3 text-sm">
                <p>{v.suggestion}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {etiquetas[v.option_id] ?? '—'} · {v.created_at.slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
