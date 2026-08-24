'use client'

import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { nativeSelectClass } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import {
  banderaEmoji,
  componerTelefono,
  ladaDe,
  PAISES,
  partirTelefono,
} from '@/lib/domain/phone'

// Las ladas salen del catálogo de `lib/domain/phone.ts`: una sola lista para el
// selector y sus pruebas. Antes eran tres (MX/US/CA) escritas aquí; el negocio
// ya recibe viajeros de LATAM y España.
//
// Varios países comparten prefijo (+1 en EEUU, Canadá y Dominicana): van como
// opciones separadas para que se reconozca el país, aunque compongan lo mismo.
const LADAS = PAISES.map((p) => ({
  key: p.iso,
  dial: `+${p.lada}`,
  // Sólo bandera + lada: el <select> nativo muestra el texto de la opción
  // elegida, y el nombre del país lo cortaba a media palabra. El nombre va en
  // `title`, así que sigue estando al pasar el cursor y para un lector.
  label: `${banderaEmoji(p.iso)} +${p.lada}`,
  nombre: p.nombre,
}))

type LadaKey = string

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
  const { iso: isoLeido, local } = partirTelefono(value)
  const parsed = { key: isoLeido, local }
  const [lada, setLada] = useState<LadaKey>(parsed.key ?? 'MX')
  // Si el valor llega con una lada distinta a la seleccionada (p. ej. al abrir
  // un cliente que ya tenía +1), manda el valor; entre países del mismo
  // prefijo (US/CA) se respeta la selección del usuario.
  const effective =
    parsed.key && ladaDe(parsed.key) !== ladaDe(lada) ? parsed.key : lada

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
            onChange(componerTelefono(key, parsed.local))
          }}
        >
          {LADAS.map((l) => (
            <option key={l.key} value={l.key} title={l.nombre} aria-label={`${l.nombre} ${l.dial}`}>
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
        onChange={(e) => onChange(componerTelefono(effective, e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  )
}
