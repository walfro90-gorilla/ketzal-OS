'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { PACK_TYPES, type PackKey } from '@/lib/domain/packs'
import { UNITS, UNIT_LABELS, type RateInput, type RateLine, type Unit } from '@/lib/domain/costeo'
import { guardarTarifario } from '../actions'

// Tarifario del proveedor (ADR-0055): lo captura la agencia dueña. Renglones
// editables como strings (igual que packs/add-ons en el form de servicio); el
// server sella keys y números con `limpiarTarifario`.

type Fila = {
  uid: number
  label: string
  unit: Unit
  cost: string
  cap: string
  porPack: Record<PackKey, string>
}

let seq = 0
const vacia = (): Fila => ({
  uid: ++seq,
  label: '',
  unit: 'pax',
  cost: '',
  cap: '',
  porPack: { sencilla: '', doble: '', triple: '', cuadruple: '' },
})

function desdeGuardado(r: RateLine): Fila {
  const f = vacia()
  f.label = r.label
  f.unit = r.unit
  f.cost = r.cost != null ? String(r.cost) : ''
  f.cap = r.cap != null ? String(r.cap) : ''
  for (const t of PACK_TYPES) {
    const c = r.cost_by_pack?.[t.key]
    f.porPack[t.key] = c != null ? String(c) : ''
  }
  return f
}

export function TarifarioForm({ supplierId, initial }: { supplierId: string; initial: RateLine[] }) {
  const [filas, setFilas] = useState<Fila[]>(() => initial.map(desdeGuardado))
  const [isPending, startTransition] = useTransition()

  const editar = (uid: number, patch: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...patch } : f)))

  function guardar() {
    const rows: RateInput[] = filas.map((f) => ({
      label: f.label,
      unit: f.unit,
      cost: f.cost,
      cap: f.cap,
      cost_by_pack: f.porPack,
    }))
    startTransition(async () => {
      const res = await guardarTarifario(supplierId, rows)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      // Lo que quedó guardado (renglones inválidos fuera) es lo que se muestra.
      setFilas(res.rates.map(desdeGuardado))
      toast.success('Tarifario guardado')
    })
  }

  return (
    <div className="space-y-4">
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin tarifas. Agrega lo que este proveedor te cobra: por persona, por
          grupo, por día o por habitación y noche.
        </p>
      ) : (
        <ul className="space-y-3">
          {filas.map((f) => (
            <li key={f.uid} className="rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`t-${f.uid}-label`}>Concepto</Label>
                  <Input
                    id={`t-${f.uid}-label`}
                    value={f.label}
                    onChange={(e) => editar(f.uid, { label: e.target.value })}
                    placeholder="Sprinter 15 pax, Guía, Habitación…"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`t-${f.uid}-unit`}>Se cobra</Label>
                  <NativeSelect
                    id={`t-${f.uid}-unit`}
                    value={f.unit}
                    onChange={(e) => editar(f.uid, { unit: e.target.value as Unit })}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar tarifa"
                    onClick={() => setFilas((fs) => fs.filter((x) => x.uid !== f.uid))}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>

              {f.unit === 'habitacion' ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PACK_TYPES.map((t) => (
                    <div key={t.key} className="grid gap-1">
                      <Label htmlFor={`t-${f.uid}-${t.key}`} className="text-xs">
                        {t.label.split(' ')[0]} / noche
                      </Label>
                      <Input
                        id={`t-${f.uid}-${t.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={f.porPack[t.key]}
                        onChange={(e) =>
                          editar(f.uid, { porPack: { ...f.porPack, [t.key]: e.target.value } })
                        }
                        placeholder="no ofrece"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor={`t-${f.uid}-cost`} className="text-xs">
                      Costo (MXN)
                    </Label>
                    <Input
                      id={`t-${f.uid}-cost`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={f.cost}
                      onChange={(e) => editar(f.uid, { cost: e.target.value })}
                    />
                  </div>
                  {f.unit !== 'pax' && (
                    <div className="grid gap-1">
                      <Label htmlFor={`t-${f.uid}-cap`} className="text-xs">
                        Cupo por unidad (opcional)
                      </Label>
                      <Input
                        id={`t-${f.uid}-cap`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={f.cap}
                        onChange={(e) => editar(f.uid, { cap: e.target.value })}
                        placeholder="15 = una sprinter cada 15 pax"
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setFilas((fs) => [...fs, vacia()])}>
          <PlusIcon className="size-4" />
          Agregar tarifa
        </Button>
        <Button type="button" onClick={guardar} disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar tarifario'}
        </Button>
      </div>
    </div>
  )
}
