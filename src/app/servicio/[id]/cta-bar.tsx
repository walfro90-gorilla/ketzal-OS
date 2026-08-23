import Link from 'next/link'
import { MessageCircleIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { mxn } from '@/components/data/format'

// Barra fija inferior de la ficha en móvil: precio "desde" + la acción de
// dinero siempre al alcance del pulgar (UI_UX_PLAN §2.3). Sólo < md: en
// desktop los botones viven en la card de precio (`hidden md:flex`), así hay
// exactamente UN botón `estela` visible por viewport sin JS que coordine.
// Misma clase base que shell/travel-bottom-nav.tsx (safe-area + blur).
export function CtaBar({
  desde,
  comprarHref,
  comprarOnline,
  wa,
  nombre,
}: {
  desde: number
  comprarHref: string
  comprarOnline: boolean
  wa: string | null
  nombre: string
}) {
  const waHref = wa ? `${wa}?text=${encodeURIComponent(`Hola, me interesa el viaje "${nombre}".`)}` : null
  if (!comprarOnline && !waHref) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Desde · por persona</p>
          <p className="font-display text-lg font-semibold leading-tight tabular-nums">{mxn.format(desde)}</p>
        </div>
        {comprarOnline ? (
          <>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Reservar por WhatsApp"
                className={buttonVariants({ variant: 'outline', size: 'icon-touch' })}
              >
                <MessageCircleIcon />
              </a>
            )}
            <Link href={comprarHref} className={buttonVariants({ variant: 'estela', size: 'touch' })}>
              Comprar
            </Link>
          </>
        ) : (
          <a
            href={waHref!}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'estela', size: 'touch' })}
          >
            <MessageCircleIcon />
            Reservar por WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
