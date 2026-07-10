import Link from 'next/link'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Una sola definición de columnas ⇒ tabla en desktop / tarjetas apiladas en móvil.
// Campo-primero: en el teléfono NUNCA hay scroll horizontal para leer datos.
// Los `cell` devuelven contenido plano (sin <Link> propio): si se pasa `rowHref`,
// el DataList añade el enlace (columna primaria en desktop, tarjeta completa en móvil).
export type DataColumn<T> = {
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  /** Columna-título de la tarjeta móvil (normalmente el nombre). Default: la primera. */
  primary?: boolean
  /** Etiqueta en la tarjeta si difiere del `header`. */
  cardLabel?: React.ReactNode
  /** No mostrar esta columna en la tarjeta móvil. */
  hideOnCard?: boolean
  /** En la tarjeta móvil, ocupar todo el ancho (etiqueta arriba, contenido abajo).
   *  Ideal para acciones o contenido ancho que no cabe en una fila etiqueta/valor. */
  fullWidthOnCard?: boolean
  /** Valor CRUDO para ordenar (número, ISO date string, nombre). Si existe,
   *  la columna es ordenable con clic en el encabezado (solo desktop). */
  sortValue?: (row: T) => string | number | null | undefined
}

/** Ordenamiento activo: índice de columna + dirección. `null` = orden original. */
export type SortState = { index: number; dir: 'asc' | 'desc' }

export function DataList<T>({
  columns,
  rows,
  getRowKey,
  rowHref,
  empty,
  sort,
  onToggleSort,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  rowHref?: (row: T) => string
  empty?: React.ReactNode
  /** Estado de orden (lo posee el padre, p. ej. FilterableList). */
  sort?: SortState | null
  /** Al hacer clic en un encabezado ordenable. Sin esto, no hay controles. */
  onToggleSort?: (index: number) => void
}) {
  if (rows.length === 0) return empty ? <>{empty}</> : null

  const foundPrimary = columns.findIndex((c) => c.primary)
  const primaryIndex = foundPrimary === -1 ? 0 : foundPrimary
  const primaryCol = columns[primaryIndex]

  return (
    <>
      {/* Desktop (md+): tabla */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => {
                const sortable = Boolean(col.sortValue && onToggleSort)
                const active = sortable && sort?.index === i ? sort.dir : null
                if (!sortable) {
                  return (
                    <TableHead
                      key={i}
                      className={cn(col.align === 'right' && 'text-right')}
                    >
                      {col.header}
                    </TableHead>
                  )
                }
                return (
                  <TableHead
                    key={i}
                    className={cn('p-0', col.align === 'right' && 'text-right')}
                    aria-sort={
                      active === 'asc'
                        ? 'ascending'
                        : active === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onToggleSort?.(i)}
                      aria-label={
                        typeof col.header === 'string'
                          ? `Ordenar por ${col.header}`
                          : 'Ordenar'
                      }
                      className={cn(
                        'flex h-10 w-full items-center gap-1 px-2 font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
                        col.align === 'right' && 'justify-end'
                      )}
                    >
                      {col.header}
                      {active === 'asc' ? (
                        <ChevronUp className="size-3.5 shrink-0" />
                      ) : active === 'desc' ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/60" />
                      )}
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((col, i) => (
                  <TableCell
                    key={i}
                    className={cn(col.align === 'right' && 'text-right')}
                  >
                    {rowHref && i === primaryIndex ? (
                      <Link
                        href={rowHref(row)}
                        className="font-medium text-primary hover:underline"
                      >
                        {col.cell(row)}
                      </Link>
                    ) : (
                      col.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Móvil (<md): tarjetas apiladas */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const rest = columns.filter(
            (c, i) => i !== primaryIndex && !c.hideOnCard
          )
          const card = (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="text-base font-medium">{primaryCol.cell(row)}</div>
              {rest.length > 0 && (
                <dl className="flex flex-col gap-1.5 text-sm">
                  {rest.map((col, i) =>
                    col.fullWidthOnCard ? (
                      <div key={i} className="space-y-1.5">
                        <dt className="text-muted-foreground">
                          {col.cardLabel ?? col.header}
                        </dt>
                        <dd>{col.cell(row)}</dd>
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4"
                      >
                        <dt className="shrink-0 text-muted-foreground">
                          {col.cardLabel ?? col.header}
                        </dt>
                        <dd
                          className={cn(
                            'text-right',
                            col.align === 'right' && 'tabular-nums'
                          )}
                        >
                          {col.cell(row)}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              )}
            </div>
          )
          return (
            <li key={getRowKey(row)}>
              {rowHref ? (
                <Link
                  href={rowHref(row)}
                  className="block rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
                >
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
