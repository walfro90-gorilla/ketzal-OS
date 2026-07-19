'use client'

import { useState } from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { CheckIcon, ChevronDownIcon, SearchIcon, UserPlusIcon, XIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type ComboOption = {
  value: string
  label: string
  /** Texto secundario (teléfono, folio…) — también entra a la búsqueda. */
  detail?: string | null
}

/** Búsqueda insensible a acentos y mayúsculas (mismo criterio que /explora). */
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Tope de filas renderizadas; escribir más afina la lista. */
const MAX_VISIBLE = 50

/**
 * Combobox con búsqueda en vivo sobre la primitiva de Base UI (la misma
 * familia que el dropdown-menu): portal + posicionador (no lo recorta el
 * overflow de las Cards), teclado y ARIA resueltos. Cuando la búsqueda no
 * encuentra nada puede ofrecer una fila de alta con lo escrito.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  emptyHint = 'Sin resultados.',
  emptyActionLabel,
  onEmptyAction,
}: {
  id?: string
  options: ComboOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Mensaje cuando la búsqueda no encuentra nada. */
  emptyHint?: string
  /** Si viene junto con onEmptyAction, muestra una fila de acción al no haber resultados. */
  emptyActionLabel?: (query: string) => string
  onEmptyAction?: (query: string) => void
}) {
  const [query, setQuery] = useState('')
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <ComboboxPrimitive.Root
      items={options}
      value={selected}
      onValueChange={(v) => onChange(v?.value ?? '')}
      onInputValueChange={(q) => setQuery(q)}
      filter={(item: ComboOption, q: string) => {
        const tokens = normalize(q).split(/\s+/).filter(Boolean)
        if (tokens.length === 0) return true
        const heno = normalize(`${item.label} ${item.detail ?? ''}`)
        return tokens.every((t) => heno.includes(t))
      }}
      limit={MAX_VISIBLE}
      openOnInputClick
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <ComboboxPrimitive.Input
          // px-9 también en md: el Input base trae md:px-2.5 y ganaría en desktop.
          render={
            <Input id={id} placeholder={placeholder} className="px-9 md:px-9" />
          }
        />
        {selected ? (
          <ComboboxPrimitive.Clear
            aria-label="Quitar selección"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </ComboboxPrimitive.Clear>
        ) : (
          <ComboboxPrimitive.Trigger
            tabIndex={-1}
            aria-label="Abrir lista"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground"
          >
            <ChevronDownIcon className="size-4" />
          </ComboboxPrimitive.Trigger>
        )}
      </div>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          sideOffset={6}
          className="isolate z-50 outline-none"
        >
          <ComboboxPrimitive.Popup className="max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <ComboboxPrimitive.Empty className="px-2.5 py-2 text-sm empty:hidden">
              {onEmptyAction && emptyActionLabel && query.trim() !== '' ? (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md text-left font-medium text-primary"
                  onClick={() => onEmptyAction(query.trim())}
                >
                  <UserPlusIcon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {emptyActionLabel(query.trim())}
                  </span>
                </button>
              ) : (
                <span className="text-muted-foreground">{emptyHint}</span>
              )}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(item: ComboOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-base outline-none select-none md:text-sm',
                    'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                  <ComboboxPrimitive.ItemIndicator>
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  </ComboboxPrimitive.ItemIndicator>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
