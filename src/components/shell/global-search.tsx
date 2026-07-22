'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import {
  BanknoteIcon,
  Building2Icon,
  FileTextIcon,
  MapPinIcon,
  SearchIcon,
  UsersIcon,
} from 'lucide-react'
import { buscarGlobal, type ResultadoBusqueda } from '@/app/(ops)/buscar-actions'
import { Input } from '@/components/ui/input'
import { Orb } from '@/components/ui/orb'
import { cn } from '@/lib/utils'

// Paleta de búsqueda global (⌘K / Ctrl+K): clientes, ventas, cotizaciones,
// servicios y proveedores. El backend (`buscarGlobal` → RPC `global_search`)
// ya agrupa, ordena y acota por RLS. El orden de `GRUPOS` fija el orden de
// despliegue por sección.

const GRUPOS = [
  { type: 'cliente', label: 'Clientes', Icon: UsersIcon },
  { type: 'venta', label: 'Ventas', Icon: BanknoteIcon },
  { type: 'cotizacion', label: 'Cotizaciones', Icon: FileTextIcon },
  { type: 'servicio', label: 'Servicios', Icon: MapPinIcon },
  { type: 'proveedor', label: 'Proveedores', Icon: Building2Icon },
] as const

const LISTBOX_ID = 'busqueda-global-resultados'

// Detección de plataforma hidratación-segura: el servidor pinta "Ctrl K" y el
// cliente corrige a "⌘K" en Mac sin mismatch (useSyncExternalStore).
const suscripcionNula = () => () => {}
const esMacCliente = () =>
  /Mac|iP(hone|ad|od)/i.test(navigator.platform || navigator.userAgent)
const esMacServidor = () => false

function kbdClass(extra?: string) {
  return cn(
    'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground select-none',
    extra
  )
}

export function GlobalSearch() {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ResultadoBusqueda[]>([])
  // Última consulta cuyo resultado está en pantalla: evita mostrar
  // "sin resultados" antes de que la búsqueda actual termine.
  const [buscado, setBuscado] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const isMac = React.useSyncExternalStore(
    suscripcionNula,
    esMacCliente,
    esMacServidor
  )

  // Debounce + guardia contra respuestas fuera de orden: solo la secuencia
  // más reciente puede escribir resultados; el resto se descarta.
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = React.useRef(0)

  const buscar = (value: string) => {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    const seq = ++seqRef.current
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      setBuscado('')
      setLoading(false)
      setHighlight(0)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      const res = await buscarGlobal(q)
      if (seq !== seqRef.current) return // respuesta obsoleta
      setResults(res)
      setBuscado(q)
      setLoading(false)
      setHighlight(0) // el resaltado vuelve al primer resultado
    }, 200)
  }

  // Cierra y deja la paleta en estado limpio (invalida búsquedas en vuelo).
  const cerrar = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    seqRef.current++
    setOpen(false)
    setQuery('')
    setResults([])
    setBuscado('')
    setLoading(false)
    setHighlight(0)
  }, [])

  // Atajo global ⌘K / Ctrl+K (toggle).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) cerrar()
        else setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, cerrar])

  // Al desmontar, cancela el debounce pendiente.
  React.useEffect(() => {
    const timer = timerRef
    const seq = seqRef
    return () => {
      if (timer.current) clearTimeout(timer.current)
      seq.current++
    }
  }, [])

  // Lista plana en el mismo orden en que se pinta (por grupos).
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: results.filter((r) => r.type === g.type),
  })).filter((g) => g.items.length > 0)
  const flat = grupos.flatMap((g) => g.items)

  // Mantiene visible la opción resaltada al navegar con flechas.
  React.useEffect(() => {
    document
      .getElementById(`gs-opt-${highlight}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const seleccionar = (r: ResultadoBusqueda) => {
    cerrar()
    router.push(r.href)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      const r = flat[highlight]
      if (r) {
        e.preventDefault()
        seleccionar(r)
      }
    }
  }

  const q = query.trim()

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : cerrar())}
    >
      {/* Disparador: ícono en móvil, campo de búsqueda en sm+. */}
      <Dialog.Trigger
        render={
          <button
            type="button"
            aria-label="Buscar en Ketzal OS"
            aria-keyshortcuts="Control+K Meta+K"
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-sm outline-none transition-colors select-none',
              'hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              // móvil: botón de ícono con blanco de toque pleno
              'size-11 text-foreground',
              // sm+: parece un campo de búsqueda
              'sm:h-10 sm:w-52 sm:justify-start sm:border-input sm:bg-background sm:px-3 sm:text-muted-foreground sm:hover:bg-muted/50 sm:dark:bg-input/30',
              'md:h-9 md:w-64'
            )}
          />
        }
      >
        <SearchIcon aria-hidden className="size-5 shrink-0 sm:size-4" />
        <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">
          Buscar…
        </span>
        <kbd className={kbdClass('hidden shrink-0 sm:inline-flex')}>
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs motion-reduce:transition-none" />
        <Dialog.Popup
          aria-modal="true"
          initialFocus={() => inputRef.current}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden rounded-xl bg-popover bg-clip-padding text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none',
            'transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
            // móvil: casi pantalla completa, anclado arriba (deja sitio al teclado)
            'inset-x-2 top-2 max-h-[calc(100dvh-5rem)]',
            // sm+: panel centrado tipo paleta de comandos
            'sm:inset-x-auto sm:top-[15svh] sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:max-h-[60svh]'
          )}
        >
          <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>

          <div className="flex items-center gap-2.5 border-b px-3.5">
            <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              role="combobox"
              aria-label="Buscar clientes, ventas, cotizaciones, servicios y proveedores"
              aria-expanded={flat.length > 0}
              aria-controls={LISTBOX_ID}
              aria-activedescendant={
                flat.length > 0 ? `gs-opt-${highlight}` : undefined
              }
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Buscar clientes, ventas, servicios…"
              value={query}
              onChange={(e) => buscar(e.target.value)}
              onKeyDown={onInputKeyDown}
              className="h-12 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
            {loading && <Orb size="xs" decorative />}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            {q.length < 2 ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                Escribe al menos 2 letras para buscar clientes, ventas,
                cotizaciones, servicios o proveedores.
              </p>
            ) : flat.length > 0 ? (
              <div
                role="listbox"
                id={LISTBOX_ID}
                aria-label="Resultados de búsqueda"
              >
                {grupos.map(({ type, label, Icon, items }) => (
                  <div key={type} role="group" aria-labelledby={`gs-grp-${type}`}>
                    <div
                      id={`gs-grp-${type}`}
                      role="presentation"
                      className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                    >
                      {label}
                    </div>
                    {items.map((r) => {
                      const i = flat.indexOf(r)
                      return (
                        <button
                          key={`${r.type}-${r.id}`}
                          type="button"
                          role="option"
                          id={`gs-opt-${i}`}
                          aria-selected={i === highlight}
                          data-highlighted={i === highlight || undefined}
                          onClick={() => seleccionar(r)}
                          onMouseMove={() => setHighlight(i)}
                          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none data-highlighted:bg-muted md:min-h-10"
                        >
                          <Icon
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">
                              {r.label}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {r.sublabel}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : !loading && buscado === q ? (
              <p
                aria-live="polite"
                className="px-2.5 py-6 text-center text-sm text-muted-foreground"
              >
                Sin resultados para “{q}”.
              </p>
            ) : (
              <p
                aria-live="polite"
                className="px-2.5 py-6 text-center text-sm text-muted-foreground"
              >
                Buscando…
              </p>
            )}
          </div>

          <div className="hidden items-center gap-4 border-t px-3.5 py-2 text-[11px] text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass()}>↑↓</kbd> navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass()}>↵</kbd> abrir
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass()}>Esc</kbd> cerrar
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
