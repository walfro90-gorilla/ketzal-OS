import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'
import { AgenciaLogo } from '@/components/public/agencia-logo'
import { getPublicPoll } from '@/lib/public/encuesta'
import { filtrarUtm, mesesDelRango } from '@/lib/domain/encuesta'
import { VotarForm } from './votar-form'
import { Resultados } from './resultados'

// Encuesta pública de investigación de mercado (m002). Es el aterrizaje del
// tráfico de Meta Ads: se vota SIN registro, y al terminar se ofrecen las dos
// puertas a Ketzal (crear cuenta / ver la vitrina). La ruta está en la
// allowlist `isPublic` de proxy.ts — sin eso, el middleware manda a /login.

type Params = { params: Promise<{ id: string }> }
type Query = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const poll = await getPublicPoll(id)
  if (!poll) return { title: 'Encuesta no disponible', robots: { index: false } }
  return {
    title: `${poll.question} — Ketzal`,
    description:
      'Vota a dónde y cuándo armamos el siguiente viaje. Sin registro, en 20 segundos.',
    alternates: { canonical: `/opina/${id}` },
    openGraph: { title: poll.question, url: `/opina/${id}`, type: 'website' },
  }
}

export default async function OpinaPage({ params, searchParams }: Params & Query) {
  const { id } = await params
  const poll = await getPublicPoll(id)
  if (!poll) notFound()

  const cerrada = poll.status_efectivo === 'closed'
  const yaVoto = (await cookies()).has(`kz_voted_${poll.id}`)
  const utm = filtrarUtm(await searchParams)

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <AgenciaLogo
              url={poll.agency.logo}
              nombre={poll.agency.name ?? 'Agencia'}
              tamano="mini"
            />
            <span className="text-sm text-muted-foreground">{poll.agency.name}</span>
          </div>
          <h1 className="font-display text-3xl leading-tight text-balance sm:text-4xl">
            {poll.question}
          </h1>
          <p className="text-muted-foreground">
            Tú decides el próximo viaje. Sin registro, en 20 segundos.
          </p>
          <div className="h-1 w-24 rounded-full bg-estela" />
        </div>

        {cerrada || yaVoto ? (
          <Resultados poll={poll} cerrada={cerrada} />
        ) : (
          <VotarForm
            pollId={poll.id}
            options={poll.options}
            meses={mesesDelRango(poll.month_from, poll.month_to)}
            utm={utm}
          />
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
