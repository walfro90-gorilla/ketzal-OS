import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// La página tenía OCHO tarjetas apiladas del mismo peso mezclando tres trabajos
// distintos (pagar el corte, configurar tarifas, dar de alta gente). Se separan
// en pestañas por trabajo.
//
// ponytail: pestañas por `?tab=` con <Link> — server components, cero JS de
// cliente, URL compartible y el back del navegador funciona. Un primitivo sobre
// @base-ui/react solo si algún día se pide animar la transición.

export type Tab = {
  id: string
  label: string
  /** Contador o aviso a la derecha de la etiqueta. */
  badge?: ReactNode
}

export function Tabs({
  tabs,
  actual,
  base = '/comisiones',
}: {
  tabs: Tab[]
  actual: string
  /** Ruta base; la PRIMERA pestaña es la default y se enlaza sin query. */
  base?: string
}) {
  return (
    <nav aria-label="Secciones" className="overflow-x-auto">
      <ul className="flex min-w-max border-b">
        {tabs.map((t, i) => {
          const activo = t.id === actual
          return (
            <li key={t.id}>
              <Link
                href={i === 0 ? base : `${base}?tab=${t.id}`}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  activo
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
                {t.badge}
                {/* La estela: mismo rastro que marca el tab activo en móvil. */}
                {activo && (
                  <span
                    aria-hidden
                    className="bg-estela absolute inset-x-3 bottom-0 h-0.5 rounded-full"
                  />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Sección secundaria plegada: lo que se toca una vez y estorba el resto del
 *  tiempo (overrides por servicio). Mismo `<details>` nativo que el resto del
 *  repo — cero JS, el buscar-en-página lo abre solo. */
export function Avanzado({
  titulo,
  nota,
  children,
}: {
  titulo: string
  nota?: string
  children: ReactNode
}) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>{titulo}</span>
        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          {nota}
          <ChevronDownIcon
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </span>
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  )
}
