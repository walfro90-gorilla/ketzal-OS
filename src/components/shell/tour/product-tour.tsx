'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import {
  HelpCircleIcon,
  XIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getTourSteps } from './tour-steps'

// Tour de onboarding: se auto-abre una vez por dispositivo (localStorage) al
// primer login y se puede reabrir desde el botón "?" del header. Sin backend:
// el "ya lo vio" es local; reabrirlo siempre está disponible. Subir el sufijo
// _vN fuerza que se re-muestre a todos tras un cambio importante del producto.
const SEEN_KEY = 'ketzal_tour_seen_v1'

export function ProductTour({ role }: { role?: string | null }) {
  const steps = useMemo(() => getTourSteps(role), [role])
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  // Auto-abrir en el primer login (una sola vez por dispositivo).
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setI(0)
        setOpen(true)
      }
    } catch {
      /* SSR / modo privado: sin auto-open, el botón "?" sigue disponible. */
    }
  }, [])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* noop */
    }
  }, [])

  // Cualquier cierre (X, backdrop, Saltar, Entendido) marca como visto.
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) markSeen()
    },
    [markSeen]
  )

  const reopen = useCallback(() => {
    setI(0)
    setOpen(true)
  }, [])

  const step = steps[i]
  const isFirst = i === 0
  const isLast = i === steps.length - 1
  const StepIcon = step.icon

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={reopen}
        aria-label="Guía de Ketzal OS"
        title="Guía de Ketzal OS"
      >
        <HelpCircleIcon />
      </Button>

      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border bg-popover p-5 text-popover-foreground shadow-xl transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-3 top-3"
                  aria-label="Cerrar"
                />
              }
            >
              <XIcon />
            </Dialog.Close>

            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <StepIcon className="size-5" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Paso {i + 1} de {steps.length}
              </span>
            </div>

            <Dialog.Title className="text-lg font-semibold text-foreground">
              {step.title}
            </Dialog.Title>
            <Dialog.Description className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </Dialog.Description>

            {step.href && (
              <Link
                href={step.href}
                onClick={() => onOpenChange(false)}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Ir a {step.label} →
              </Link>
            )}

            {/* Puntos de progreso (clicables). */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {steps.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setI(idx)}
                  aria-label={`Ir al paso ${idx + 1}`}
                  aria-current={idx === i || undefined}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    idx === i
                      ? 'w-4 bg-primary'
                      : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {isLast ? 'Cerrar' : 'Saltar'}
              </Button>
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>
                    <ArrowLeftIcon />
                    Atrás
                  </Button>
                )}
                {isLast ? (
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    <CheckIcon />
                    Entendido
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setI(i + 1)}>
                    Siguiente
                    <ArrowRightIcon />
                  </Button>
                )}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
