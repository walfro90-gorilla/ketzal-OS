import Link from 'next/link'
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
}

export function DataList<T>({
  columns,
  rows,
  getRowKey,
  rowHref,
  empty,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  rowHref?: (row: T) => string
  empty?: React.ReactNode
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
              {columns.map((col, i) => (
                <TableHead
                  key={i}
                  className={cn(col.align === 'right' && 'text-right')}
                >
                  {col.header}
                </TableHead>
              ))}
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
                        className="font-medium hover:underline"
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
