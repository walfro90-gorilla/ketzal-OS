'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
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

// Tour de onboarding con SPOTLIGHT: oscurece el fondo, resalta el ítem del nav
// (data-tour={href}), auto-scrollea hasta él y ancla la tarjeta al lado. Los
// pasos sin sección (bienvenida, dinero) van centrados con fondo opaco.
// Se auto-abre una vez por dispositivo (localStorage) y se reabre con el "?".
const SEEN_KEY = 'ketzal_tour_seen_v1'
const PAD = 6 // aire alrededor del elemento resaltado
const GAP = 12 // separación entre elemento y tarjeta
const CARD_MAX = 400
const CARD_EST_H = 340 // estimación para acotar la posición vertical

/** Coloca la tarjeta junto al elemento (lado con más espacio) o centrada. */
function placeCard(rect: DOMRect | null): CSSProperties {
  if (typeof window === 'undefined' || !rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(vw - 16, CARD_MAX)
  const clampLeft = (l: number) => Math.max(8, Math.min(l, vw - w - 8))
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - CARD_EST_H - 12))

  if (vw - rect.right >= w + GAP + 8) {
    return { left: rect.right + GAP, top: clampTop(rect.top), width: w } // derecha
  }
  if (rect.left >= w + GAP + 8) {
    return { left: clampLeft(rect.left - GAP - w), top: clampTop(rect.top), width: w } // izquierda
  }
  if (vh - rect.bottom >= CARD_EST_H + GAP) {
    return { left: clampLeft(rect.left), top: rect.bottom + GAP, width: w } // abajo
  }
  return { left: clampLeft(rect.left), bottom: vh - rect.top + GAP, width: w } // arriba (ancla por bottom)
}

export function ProductTour({ role }: { role?: string | null }) {
  const steps = useMemo(() => getTourSteps(role), [role])
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Auto-abrir en el primer login (una sola vez por dispositivo).
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setI(0)
        setOpen(true)
      }
    } catch {
      /* SSR / modo privado: sin auto-open; el botón "?" sigue disponible. */
    }
  }, [])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* noop */
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    markSeen()
  }, [markSeen])

  const reopen = useCallback(() => {
    setI(0)
    setOpen(true)
  }, [])

  const step = open ? steps[i] : null

  // Localizar el elemento del paso, hacer scroll y seguir su posición.
  useEffect(() => {
    if (!open || !step) return
    const sel = step.href ? `[data-tour="${step.href}"]` : null
    const el = sel
      ? document.querySelector<HTMLElement>(`${sel}:not([hidden])`)
      : null

    if (!el || el.offsetParent === null) {
      setRect(null) // sin objetivo visible (paso general o ítem oculto) → centrado
      return
    }

    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    // Recalcular mientras el scroll suave se asienta.
    const timers = [120, 320, 600].map((ms) => window.setTimeout(update, ms))
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, i, step])

  // Escape cierra; enfocar la tarjeta al abrir cada paso (a11y).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    cardRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, i, close])

  const isFirst = i === 0
  const isLast = i === steps.length - 1
  const StepIcon = step?.icon ?? HelpCircleIcon

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

      {open && step && (
        <>
          {/* Captura de clics: bloquea la interacción con la página detrás. */}
          <div
            className="fixed inset-0 z-50"
            aria-hidden
            onClick={(e) => e.stopPropagation()}
          />

          {rect ? (
            // Spotlight: caja transparente sobre el elemento; su box-shadow gigante
            // oscurece TODO lo demás y el interior deja ver el elemento resaltado.
            <div
              aria-hidden
              className="pointer-events-none fixed z-[51] rounded-xl border-2 border-primary transition-all duration-300 ease-out"
              style={{
                left: rect.left - PAD,
                top: rect.top - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
              }}
            />
          ) : (
            // Paso general (sin sección): fondo opaco parejo.
            <div aria-hidden className="fixed inset-0 z-[51] bg-black/62" />
          )}

          {/* Tarjeta del paso, anclada al elemento o centrada. */}
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            tabIndex={-1}
            className="fixed z-[60] flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border bg-popover p-5 text-popover-foreground shadow-xl outline-none"
            style={placeCard(rect)}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3"
              onClick={close}
              aria-label="Cerrar"
            >
              <XIcon />
            </Button>

            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <StepIcon className="size-5" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Paso {i + 1} de {steps.length}
              </span>
            </div>

            <h2 id="tour-title" className="text-lg font-semibold text-foreground">
              {step.title}
            </h2>
            <p id="tour-body" className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>

            {step.href && (
              <Link
                href={step.href}
                onClick={close}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Ir a {step.label} →
              </Link>
            )}

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
              <Button variant="ghost" size="sm" onClick={close}>
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
                  <Button size="sm" onClick={close}>
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
          </div>
        </>
      )}
    </>
  )
}
