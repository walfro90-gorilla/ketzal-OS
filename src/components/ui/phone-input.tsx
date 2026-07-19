'use client'

import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { nativeSelectClass } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

// Ladas disponibles por ahora: México por default + EEUU/Canadá.
// EEUU y Canadá comparten +1; van como opciones separadas para que el agente
// reconozca el país, pero componen el mismo prefijo.
const LADAS = [
  { key: 'MX', dial: '+52', label: '🇲🇽 +52' },
  { key: 'US', dial: '+1', label: '🇺🇸 +1' },
  { key: 'CA', dial: '+1', label: '🇨🇦 +1' },
] as const

type LadaKey = (typeof LADAS)[number]['key']

const dialOf = (key: LadaKey) =>
  LADAS.find((l) => l.key === key)!.dial

// "+52 656…" → { key: 'MX', local: '656…' }. Un valor sin lada conocida
// (los teléfonos guardados antes de este componente) regresa key null y se
// muestra íntegro; solo se le antepone lada cuando el usuario lo edita.
// Se prueba la lada más larga primero por si algún día una es prefijo de otra.
function parse(value: string): { key: LadaKey | null; local: string } {
  const porLargo = [...LADAS].sort((a, b) => b.dial.length - a.dial.length)
  for (const { key, dial } of porLargo) {
    if (value.startsWith(dial)) {
      return { key, local: value.slice(dial.length).trimStart() }
    }
  }
  return { key: null, local: value }
}

/**
 * Input de teléfono con lada internacional. Compone un solo string
 * ("+52 656 123 4567") sobre el mismo campo que ya guardan los formularios,
 * compatible con los normalizadores de wa.me existentes (si el valor ya trae
 * lada lo usan tal cual; los legados de 10 dígitos siguen recibiendo 52).
 */
export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = 'Ej. 656 123 4567',
  disabled,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const parsed = parse(value)
  const [lada, setLada] = useState<LadaKey>(parsed.key ?? 'MX')
  // Si el valor llega con una lada distinta a la seleccionada (p. ej. al abrir
  // un cliente que ya tenía +1), manda el valor; entre países del mismo
  // prefijo (US/CA) se respeta la selección del usuario.
  const effective =
    parsed.key && dialOf(parsed.key) !== dialOf(lada) ? parsed.key : lada

  // Teléfono vacío queda vacío: la lada sola no es un dato.
  const compose = (key: LadaKey, local: string) =>
    local.trim() ? `${dialOf(key)} ${local}` : ''

  return (
    <div className={cn('flex gap-2', className)}>
      <div className="relative shrink-0">
        {/* Estilo base compartido + overrides propios: angosto (solo la lada)
            y padding ajustado a su chevron compacto. */}
        <select
          aria-label="Lada internacional"
          className={cn(
            nativeSelectClass,
            'w-24 pl-2.5 md:pl-2.5 pr-7 md:pr-7'
          )}
          value={effective}
          disabled={disabled}
          onChange={(e) => {
            const key = e.target.value as LadaKey
            setLada(key)
            onChange(compose(key, parsed.local))
          }}
        >
          {LADAS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        value={parsed.local}
        onChange={(e) => onChange(compose(effective, e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  )
}
