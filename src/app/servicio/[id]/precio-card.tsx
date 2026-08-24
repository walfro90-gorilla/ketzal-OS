import Link from 'next/link'
import { BedDoubleIcon, CalendarDaysIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { CupoBadge } from '@/components/public/ficha-primitivos'
import { formatTravelDate, mxn } from '@/components/data/format'

// Card de precio (Dir A "Hoja de venta"): responde "¿cuánto?" en un solo bloque —
// desde + próxima salida con cupo + precio por ocupación. Los botones sólo desde
// md: en el teléfono viven en la CtaBar fija (un solo `estela` por viewport).
export function PrecioCard({
  price,
  packs,
  proxima,
  cupoLibre,
  comprarHref,
  comprarOnline,
  waHref,
  mailHref,
}: {
  price: number
  packs: { key: string; label: string; price: number }[]
  proxima: { departs_on: string; free: number } | null
  cupoLibre: number | null
  comprarHref: string
  comprarOnline: boolean
  waHref: string | null
  mailHref: string | null
}) {
  const secundario = buttonVariants({ variant: comprarOnline ? 'outline' : 'estela', size: 'touch' })
  return (
    <Card className="mt-6">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Desde</p>
          <p className="font-display text-3xl font-semibold tracking-[-0.02em] tabular-nums">
            {mxn.format(price)}{' '}
            <span className="text-sm font-normal text-muted-foreground">por persona</span>
          </p>
        </div>

        {/* Urgencia desde datos reales: la próxima salida y su cupo. */}
        {proxima ? (
          <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
            <CalendarDaysIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="flex-1">
              Próxima salida <b>{formatTravelDate(proxima.departs_on)}</b>
            </span>
            <CupoBadge free={proxima.free} />
          </p>
        ) : cupoLibre != null ? (
          <CupoBadge free={cupoLibre} />
        ) : null}

        {packs.length > 1 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Precio por ocupación
            </p>
            <ul className="mt-1 divide-y text-sm">
              {packs.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <BedDoubleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {p.label}
                  </span>
                  <span className="font-semibold tabular-nums">{mxn.format(p.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* < md: los botones viven en la CtaBar fija; aquí sólo desde md. */}
        <div className="hidden gap-2 md:flex md:flex-row">
          {comprarOnline && (
            <Link href={comprarHref} className={buttonVariants({ variant: 'estela', size: 'touch' })}>
              Comprar en línea
            </Link>
          )}
          {waHref ? (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className={secundario}>
              Reservar por WhatsApp
            </a>
          ) : mailHref ? (
            <a href={mailHref} className={secundario}>
              Pedir informes
            </a>
          ) : null}
        </div>
        <Link
          href="/politica-cancelacion"
          className="flex min-h-11 items-center justify-center text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Política de cancelación
        </Link>
      </CardContent>
    </Card>
  )
}
