'use client'

import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DataList,
  type DataColumn,
  type SortState,
} from '@/components/data/data-list'

// Búsqueda + filtros instantáneos EN MEMORIA sobre un DataList (campo-primero:
// cero round-trips al servidor; las listas v1 caben completas en el cliente).
// Envuelve a DataList sin tocarlo: mismas columns/getRowKey/rowHref.

export type ListFilter<T> = {
  key: string
  label: string // p. ej. "Estado"
  options: { value: string; label: string }[]
  getValue: (row: T) => string | null | undefined
}

/** Minúsculas y sin acentos: "José" ≡ "jose". */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

// "José" ≡ "jose" también al ordenar; numeric: "Tour 2" antes que "Tour 10".
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/** null/undefined SIEMPRE al final, sin importar la dirección. */
function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: 'asc' | 'desc'
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const base =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : collator.compare(String(a), String(b))
  return dir === 'asc' ? base : -base
}

// Mismo <select> nativo alineado al Input de shadcn que en abonos/nueva-venta:
// en móvil el picker del SO es mejor UX que un dropdown custom.
const selectClass =
  'h-11 md:h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export function FilterableList<T>({
  rows,
  columns,
  getRowKey,
  rowHref,
  searchText,
  searchPlaceholder = 'Buscar…',
  filters,
  empty,
}: {
  rows: T[]
  columns: DataColumn<T>[]
  getRowKey: (row: T) => string
  rowHref?: (row: T) => string
  /** Texto concatenado en el que se busca (nombre + teléfono + …). */
  searchText: (row: T) => string
  searchPlaceholder?: string
  filters?: ListFilter<T>[]
  /** Se muestra cuando NO hay datos en absoluto (rows vacío). */
  empty?: ReactNode
}) {
  const [query, setQuery] = useState('')
  // '' = "Todos" (filtro inactivo).
  const [selected, setSelected] = useState<Record<string, string>>({})
  // null = orden original. Ciclo por columna: asc → desc → null.
  const [sort, setSort] = useState<SortState | null>(null)

  const toggleSort = (index: number) => {
    setSort((prev) => {
      if (!prev || prev.index !== index) return { index, dir: 'asc' }
      if (prev.dir === 'asc') return { index, dir: 'desc' }
      return null
    })
  }

  const filtered = useMemo(() => {
    // Multi-token: "jose 656" exige que TODOS los tokens aparezcan.
    const tokens = normalize(query).split(/\s+/).filter(Boolean)
    return rows.filter((row) => {
      if (tokens.length > 0) {
        const haystack = normalize(searchText(row))
        if (!tokens.every((token) => haystack.includes(token))) return false
      }
      for (const filter of filters ?? []) {
        const value = selected[filter.key]
        if (value && String(filter.getValue(row) ?? '') !== value) return false
      }
      return true
    })
  }, [rows, query, selected, filters, searchText])

  // Orden ESTABLE sobre el resultado filtrado (decorate–sort–undecorate:
  // empates conservan el orden original, y sortValue se evalúa una sola vez).
  const sorted = useMemo(() => {
    const getValue = sort ? columns[sort.index]?.sortValue : undefined
    if (!sort || !getValue) return filtered
    return filtered
      .map((row, i) => ({ row, i, value: getValue(row) }))
      .sort(
        (a, b) => compareValues(a.value, b.value, sort.dir) || a.i - b.i
      )
      .map((d) => d.row)
  }, [filtered, sort, columns])

  // Sin datos en absoluto: el EmptyState (con su CTA) guía; la toolbar sobra.
  if (rows.length === 0) return <>{empty}</>

  const clear = () => {
    setQuery('')
    setSelected({})
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="filterable-list-search" className="sr-only">
          Buscar
        </label>
        <Input
          id="filterable-list-search"
          type="search"
          inputMode="search"
          aria-label="Buscar"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        {(filters ?? []).map((filter) => (
          <div key={filter.key} className="w-full sm:w-48">
            <NativeSelect
              aria-label={filter.label}
              value={selected[filter.key] ?? ''}
              onChange={(e) =>
                setSelected((prev) => ({
                  ...prev,
                  [filter.key]: e.target.value,
                }))
              }
            >
              <option value="">Todos — {filter.label.toLowerCase()}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length === 1 ? '1 resultado' : `${filtered.length} resultados`}
      </p>

      {filtered.length === 0 ? (
        // Hay datos pero la búsqueda no coincide: mensaje inline, sin CTA grande.
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sin resultados para tu búsqueda.
          </p>
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar
          </Button>
        </div>
      ) : (
        <DataList
          columns={columns}
          rows={sorted}
          getRowKey={getRowKey}
          rowHref={rowHref}
          sort={sort}
          onToggleSort={toggleSort}
        />
      )}
    </div>
  )
}
