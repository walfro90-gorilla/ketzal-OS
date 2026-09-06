'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ESTADOS_MX, MEXICO, PAISES, esMexico } from '@/lib/domain/mexico'

// ADR-0057: capturar ubicación de forma agrupable. Cerrado donde el conjunto es
// cerrado, sugerido donde es abierto:
//   · País   → select. Cambian cada década; si falta uno se agrega al catálogo.
//   · Estado → select de las 32 entidades, SOLO si el país es México. Fuera de
//              México se oculta: "Antioquia" no le sirve a nadie aquí y era
//              justo donde antes se colaban los países.
//   · Ciudad → texto con sugerencias de las ya capturadas. Son infinitas, así
//              que se guía en vez de bloquear; la agrupación no depende de que
//              se teclee igual, se normaliza con `claveLugar()`.

export type Ubicacion = {
  ciudad: string
  estado: string
  pais: string
}

export function CamposUbicacion({
  valor,
  onChange,
  ciudadesSugeridas = [],
  etiquetaCiudad = 'Ciudad',
  requerido = false,
}: {
  valor: Ubicacion
  onChange: (v: Ubicacion) => void
  /** Ciudades ya capturadas, para que la gente reuse en vez de inventar. */
  ciudadesSugeridas?: string[]
  etiquetaCiudad?: string
  requerido?: boolean
}) {
  const id = useId()
  const enMexico = esMexico(valor.pais) || !valor.pais

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${id}-pais`}>País</Label>
        <NativeSelect
          id={`${id}-pais`}
          value={valor.pais || MEXICO}
          onChange={(e) => {
            const pais = e.target.value
            // Al salir de México el estado deja de aplicar: se limpia en vez de
            // quedarse pegado un estado mexicano en un destino extranjero.
            onChange({ ...valor, pais, estado: esMexico(pais) ? valor.estado : '' })
          }}
        >
          {PAISES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </div>

      {enMexico && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-estado`}>Estado</Label>
          <NativeSelect
            id={`${id}-estado`}
            value={valor.estado}
            onChange={(e) => onChange({ ...valor, estado: e.target.value })}
          >
            <option value="">Selecciona…</option>
            {ESTADOS_MX.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${id}-ciudad`}>
          {etiquetaCiudad}
          {requerido ? ' *' : ''}
        </Label>
        <Input
          id={`${id}-ciudad`}
          list={`${id}-ciudades`}
          value={valor.ciudad}
          onChange={(e) => onChange({ ...valor, ciudad: e.target.value })}
          placeholder="Ej. Ciudad Juárez"
        />
        {ciudadesSugeridas.length > 0 && (
          <datalist id={`${id}-ciudades`}>
            {ciudadesSugeridas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
      </div>
    </>
  )
}
