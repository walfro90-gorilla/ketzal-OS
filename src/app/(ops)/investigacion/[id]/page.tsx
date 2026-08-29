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
import { etiquetaMes, linkWhatsapp } from '@/lib/domain/encuesta'
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

  const [{ data: pollRaw }, { data: votosRaw }] = await Promise.all([
    supabase
      .from('polls' as never)
      .select('id, supplier_id, question, options, month_from, month_to, status, closes_at, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('poll_votes' as never)
      .select('id, poll_id, option_id, preferred_month, suggestion, contact, meta, created_at')
      .eq('poll_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!pollRaw) notFound()
  const poll = pollRaw as unknown as Poll
  const votos = (votosRaw ?? []) as unknown as PollVote[]

  const etiquetas: Record<number, string> = Object.fromEntries(
    poll.options.map((o) => [o.id, o.label]),
  )

  const porDestino = new Map<number, number>()
  const porMes = new Map<string, number>()
  for (const v of votos) {
    porDestino.set(v.option_id, (porDestino.get(v.option_id) ?? 0) + 1)
    const m = v.preferred_month.slice(0, 7)
    porMes.set(m, (porMes.get(m) ?? 0) + 1)
  }

  const destinos = [...porDestino.entries()]
    .map(([oid, n]) => ({ label: etiquetas[oid] ?? 'Otro', votes: n }))
    .sort((a, b) => b.votes - a.votes)
  const meses = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, n]) => ({ label: etiquetaMes(m), votes: n }))

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
            <span>· {votos.length} {votos.length === 1 ? 'voto' : 'votos'}</span>
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
            <BarrasPorcentaje datos={destinos} total={votos.length} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cuándo</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasPorcentaje datos={meses} total={votos.length} />
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
