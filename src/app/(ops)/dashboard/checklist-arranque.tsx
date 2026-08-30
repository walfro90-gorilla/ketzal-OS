import Link from 'next/link'
import { CheckIcon, ChevronDownIcon, RocketIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// b064 — Checklist de arranque del admin de agencia.
//
// El tour (`components/shell/tour/`) explica QUÉ es cada sección; esto le dice
// QUÉ LE FALTA a él. Sin esta tarjeta, un admin recién creado aterriza en un
// Panel de ceros con EmptyStates correctos pero pasivos, sin saber por dónde
// empezar.
//
// Todo viene derivado del RPC `onboarding_agencia()`: no hay flags de progreso
// que mantener ni que se puedan desincronizar. Si borra su único servicio, el
// paso reaparece — que es lo correcto.
//
// SUGERIDO, NO BLOQUEANTE: es una tarjeta más del Panel. Bloquear el OS hasta
// completarla sería hostil, sobre todo porque dos pasos (CLABE, Mercado Pago)
// dependen de trámites externos que no se resuelven en el momento.
//
// COLAPSABLE con `<details>` nativo: cero JS, cero estado, y el teclado y el
// lector de pantalla lo entienden sin ayuda. Se abre solo mientras quede más
// de un paso; con uno pendiente ya no vale ocupar media pantalla —el resumen
// de la cabecera dice cuál falta— y completa se colapsa del todo. Ese era el
// problema real: con 7 de 8 hechos seguía empujando el panel hacia abajo.

export type PasoOnboarding = {
  id: string
  hecho: boolean
  titulo: string
  detalle: string
  href: string
  cta: string
}

export type Onboarding = {
  agencia: string | null
  total: number
  pendientes: number
  pasos: PasoOnboarding[]
}

export function ChecklistArranque({ data }: { data: Onboarding }) {
  const listos = data.total - data.pendientes
  const pct = data.total > 0 ? Math.round((listos / data.total) * 100) : 0
  // Los pendientes primero: es lo accionable. Los hechos quedan abajo como
  // constancia de avance (borrarlos de la vista se siente como perder progreso).
  const pasos = [...data.pasos].sort((a, b) => Number(a.hecho) - Number(b.hecho))

  // El siguiente pendiente, para nombrarlo en la cabecera cuando está colapsado:
  // así el resumen dice QUÉ falta, no solo cuántos.
  const siguiente = pasos.find((p) => !p.hecho)

  return (
    <details
      open={data.pendientes > 1}
      className="group rounded-2xl bg-primary/5 ring-1 ring-primary/25"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-2xl p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <RocketIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
              Primeros pasos
            </h2>
            <p className="text-sm text-muted-foreground">
              {/* Colapsado dice qué falta; abierto, para qué sirve la lista. */}
              <span className="group-open:hidden">
                {siguiente
                  ? `Te falta: ${siguiente.titulo}`
                  : 'Tu agencia ya está lista para vender.'}
              </span>
              <span className="hidden group-open:inline">
                Deja lista tu agencia para vender. Puedes hacerlo en cualquier orden.
              </span>
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium tabular-nums text-muted-foreground">
          {listos} de {data.total}
          <ChevronDownIcon
            aria-hidden
            className="size-4 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="px-5 pb-5">

      <div
        className="h-1.5 overflow-hidden rounded-full bg-primary/15"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${listos} de ${data.total} pasos completados`}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {pasos.map((p) => (
          <li
            key={p.id}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5',
              p.hecho ? 'opacity-60' : 'bg-background/60'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full',
                p.hecho
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-muted-foreground/35'
              )}
            >
              {p.hecho && <CheckIcon className="size-3" />}
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', p.hecho && 'line-through')}>
                {p.titulo}
              </p>
              {!p.hecho && (
                <p className="text-xs text-muted-foreground">{p.detalle}</p>
              )}
            </div>

            {!p.hecho && (
              <Link
                href={p.href}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                {p.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
      </div>
    </details>
  )
}
