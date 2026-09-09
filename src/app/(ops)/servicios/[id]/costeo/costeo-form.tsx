'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatTile } from '@/components/data/stat-tile'
import { formatTravelDate, mxn } from '@/components/data/format'
import { PACK_TYPES, type Pack, type PackKey } from '@/lib/domain/packs'
import type { AddOn } from '@/lib/domain/addons'
import { precioDePack } from '@/lib/domain/pricing'
import {
  UNIT_LABELS,
  limpiarCosteo,
  margenA,
  margenAddon,
  packReferencia,
  escalonesEntre,
  filasPrecio,
  resumen,
  totalLinea,
  unidades,
  UNITS,
  type CostLine,
  type Unit,
  type Costeo,
  type RateLine,
} from '@/lib/domain/costeo'
import { guardarCosteo, setServicioPacks, type Salida } from '../../actions'

// Hoja de costeo (ADR-0055). Todo el cálculo corre aquí con el módulo puro; el
// servidor solo guarda. Las líneas son SNAPSHOT de la tarifa al elegirla.

export type ProveedorConTarifas = {
  id: string
  name: string
  supplier_type: string | null
  rates: RateLine[]
}

type LineaUI = Omit<CostLine, 'qty'> & { uid: number; qty: string }
type AddonUI = { cost: string; supplier_id?: string; supplier_name?: string; rate_key?: string }

let seq = 0

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)} %`)
const dinero = (n: number | null | undefined) => (n == null ? '—' : mxn.format(n))

function resumenCosto(l: { unit: CostLine['unit']; cost?: number; cost_by_pack?: CostLine['cost_by_pack']; cap?: number }) {
  if (l.unit === 'habitacion') {
    return PACK_TYPES.filter((t) => l.cost_by_pack?.[t.key] != null)
      .map((t) => `${t.label[0]} ${mxn.format(l.cost_by_pack![t.key]!)}`)
      .join(' · ')
  }
  return `${mxn.format(l.cost ?? 0)}${l.cap ? ` · cupo ${l.cap}` : ''}`
}

export function CosteoForm({
  serviceId,
  initial,
  packsIniciales,
  addOns,
  proveedores,
  salidas,
  maxN,
  preseleccion,
  agenciaId,
  comisionPortalPct,
}: {
  serviceId: string
  initial: Costeo
  packsIniciales: Pack[]
  addOns: AddOn[]
  proveedores: ProveedorConTarifas[]
  salidas: Salida[]
  /** Hasta dónde buscar el punto de equilibrio (cupo del servicio). */
  maxN: number
  /** Transporte y hotel ya ligados al servicio: el picker abre en ellos. */
  preseleccion: string[]
  /** Agencia dueña: los costos propios (gasolina, casetas) se cuelgan de ella. */
  agenciaId: string
  /** Comisión de Ketzal (%) que se descuenta si el costeo se marca "portal". */
  comisionPortalPct: number
}) {
  const [packs, setPacks] = useState<Pack[]>(packsIniciales)
  const [cab, setCab] = useState({
    plan_pax: String(initial.plan_pax),
    nights: String(initial.nights),
    days: String(initial.days),
    margin_pct: String(initial.margin_pct),
    precio_venta: initial.precio_venta != null ? String(initial.precio_venta) : '',
    imprevistos_pct: String(initial.imprevistos_pct),
  })
  const [portal, setPortal] = useState(initial.portal)
  // Qué ocupaciones se escriben al servicio al "crear/guardar opciones de precio".
  const [seleccion, setSeleccion] = useState<PackKey[]>(() =>
    packsIniciales.length ? packsIniciales.map((p) => p.key) : ['doble', 'triple', 'cuadruple']
  )
  const [propio, setPropio] = useState<{ label: string; unit: Unit; cost: string; cap: string }>({
    label: '',
    unit: 'grupo',
    cost: '',
    cap: '',
  })
  const [lineas, setLineas] = useState<LineaUI[]>(() =>
    initial.lines.map((l) => ({ ...l, uid: ++seq, qty: String(l.qty) }))
  )
  const [extras, setExtras] = useState<Record<string, AddonUI>>(() =>
    Object.fromEntries(
      Object.entries(initial.addon_costs).map(([k, v]) => [k, { ...v, cost: String(v.cost) }])
    )
  )
  const [provSel, setProvSel] = useState<string>(
    () => preseleccion.find((id) => proveedores.some((p) => p.id === id)) ?? proveedores[0]?.id ?? ''
  )
  const [confirmarAplicar, setConfirmarAplicar] = useState(false)
  const [isPending, startTransition] = useTransition()

  const addonKeys = useMemo(() => addOns.map((a) => a.key), [addOns])

  // La misma limpieza que hará el servidor: lo que se ve es lo que se guarda.
  const doc = useMemo(
    () =>
      limpiarCosteo(
        {
          ...cab,
          portal,
          lines: lineas,
          addon_costs: extras,
        },
        addonKeys
      ),
    [cab, portal, lineas, extras, addonKeys]
  )

  const ref = packReferencia(packs)
  const refKey: PackKey = ref?.key ?? 'doble'
  const n = doc.plan_pax
  // ADR-0061: el precio con que se evalúa es el tecleado o el sugerido, haya
  // packs o no; así equilibrio y utilidad salen desde el primer costo.
  const res = resumen(doc, refKey, maxN, comisionPortalPct)
  const filas = filasPrecio(doc, packs, comisionPortalPct)
  const hayHospedaje = doc.lines.some((l) => l.unit === 'habitacion')
  const paraGuardar = filas.filter((f) => seleccion.includes(f.key) && f.propuesto != null)
  // Por qué "lleno" puede perder cuando "plan" gana: a más pax, otra quinta u otra sprinter.
  const brincos = escalonesEntre(doc, n, maxN)

  const proveedor = proveedores.find((p) => p.id === provSel) ?? null
  const tarifasPax = proveedores.flatMap((p) =>
    p.rates.filter((r) => r.unit === 'pax').map((r) => ({ prov: p, rate: r }))
  )

  function agregar(p: ProveedorConTarifas, r: RateLine) {
    setLineas((ls) => [
      ...ls,
      {
        uid: ++seq,
        supplier_id: p.id,
        supplier_name: p.name,
        rate_key: r.key,
        label: r.label,
        unit: r.unit,
        cost: r.cost,
        cap: r.cap,
        cost_by_pack: r.cost_by_pack,
        // Por día / por noche: la cantidad son los días o las noches del viaje.
        qty: r.unit === 'dia' ? String(doc.days) : r.unit === 'noche' ? String(Math.max(1, doc.nights)) : '1',
      },
    ])
  }

  function guardar() {
    startTransition(async () => {
      const res = await guardarCosteo(serviceId, doc)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Costeo guardado')
    })
  }

  /** Escribe al servicio las ocupaciones elegidas con su precio propuesto: crea las opciones o las repone. */
  function guardarPrecios() {
    if (!confirmarAplicar) {
      setConfirmarAplicar(true)
      return
    }
    const nuevos = paraGuardar.map((f) => ({ key: f.key, price: f.propuesto! }))
    startTransition(async () => {
      const r = await setServicioPacks(serviceId, nuevos)
      setConfirmarAplicar(false)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setPacks(r.packs)
      toast.success(packs.length ? 'Precios guardados en el servicio' : 'Opciones de precio creadas')
    })
  }

  /** Costo que no viene de un proveedor (gasolina, casetas, propinas): se cuelga de la agencia. */
  function agregarPropio() {
    const label = propio.label.trim()
    const cost = Number(propio.cost)
    if (!label || !Number.isFinite(cost) || cost < 0) {
      toast.error('Ponle nombre y costo al concepto.')
      return
    }
    const cap = Number(propio.cap)
    setLineas((ls) => [
      ...ls,
      {
        uid: ++seq,
        supplier_id: agenciaId,
        supplier_name: 'Costo propio',
        rate_key: `propio-${label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '-')}`,
        label,
        unit: propio.unit,
        cost,
        cap: propio.unit !== 'pax' && Number.isInteger(cap) && cap > 0 ? cap : undefined,
        qty: propio.unit === 'dia' ? String(doc.days) : propio.unit === 'noche' ? String(Math.max(1, doc.nights)) : '1',
      },
    ])
    setPropio({ label: '', unit: 'grupo', cost: '', cap: '' })
  }

  const campo = (k: keyof typeof cab, label: string, extra?: Partial<ComponentProps<typeof Input>>) => (
    <div className="grid gap-1">
      <Label htmlFor={`cab-${k}`}>{label}</Label>
      <Input
        id={`cab-${k}`}
        type="number"
        inputMode="numeric"
        value={cab[k]}
        onChange={(e) => setCab((c) => ({ ...c, [k]: e.target.value }))}
        {...extra}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Parámetros</CardTitle>
          <CardDescription>
            Con cuántos pasajeros planeas el viaje y qué margen quieres. El margen
            es bruto, sobre el precio, antes de comisiones de agente o embajador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {campo('plan_pax', 'Pasajeros plan', { min: 1, step: 1 })}
            {campo('days', 'Días', { min: 1, step: 1 })}
            {campo('nights', 'Noches', { min: 0, step: 1 })}
            {campo('margin_pct', 'Margen %', { min: 0, max: 99, step: 0.5, inputMode: 'decimal' })}
            {campo('imprevistos_pct', 'Imprevistos %', { min: 0, max: 100, step: 0.5, inputMode: 'decimal' })}
            {campo('precio_venta', 'Precio de venta / pax', {
              min: 0,
              step: 1,
              inputMode: 'decimal',
              placeholder: res.sugerido != null ? `sugerido ${res.sugerido}` : 'vacío = el sugerido',
            })}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={portal} onCheckedChange={setPortal} aria-label="Se vende por el portal" />
            <span>
              Se vende por el portal: la utilidad neta descuenta la comisión de Ketzal ({comisionPortalPct} %).
              <span className="block text-xs text-muted-foreground">
                Las comisiones de agente o embajador no se descuentan aquí.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Costos del viaje</CardTitle>
          <CardDescription>
            Elige un proveedor y agrega sus tarifas. Cada línea copia la tarifa
            de hoy; si el tarifario cambia después, aquí no se mueve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tu agencia no tiene proveedores dados de alta.{' '}
              <Link href="/proveedores/nuevo" className="underline">
                Da de alta el primero
              </Link>{' '}
              y captúrale su tarifario.
            </p>
          ) : (
            <div className="rounded-lg border p-3">
              <div className="grid gap-1">
                <Label htmlFor="prov">Agregar del tarifario de</Label>
                <NativeSelect id="prov" value={provSel} onChange={(e) => setProvSel(e.target.value)}>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.rates.length === 0 ? ' (sin tarifario)' : ''}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {proveedor && proveedor.rates.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Este proveedor no tiene tarifas.{' '}
                  <Link href={`/proveedores/${proveedor.id}`} className="underline">
                    Captura su tarifario
                  </Link>
                  .
                </p>
              ) : proveedor ? (
                <ul className="mt-2 divide-y">
                  {proveedor.rates.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {UNIT_LABELS[r.unit]} · {resumenCosto(r)}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => agregar(proveedor, r)}>
                        <PlusIcon className="size-4" />
                        Agregar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Agregar un costo propio</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Lo que no viene de un proveedor: gasolina, casetas, propinas, seguro por pasajero, publicidad.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Input
                aria-label="Concepto del costo propio"
                placeholder="Concepto"
                value={propio.label}
                className="col-span-2 sm:col-span-2"
                onChange={(e) => setPropio((p) => ({ ...p, label: e.target.value }))}
              />
              <NativeSelect
                aria-label="Cómo se cobra el costo propio"
                value={propio.unit}
                onChange={(e) => setPropio((p) => ({ ...p, unit: e.target.value as Unit }))}
              >
                {UNITS.filter((u) => u !== 'habitacion').map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </NativeSelect>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                aria-label="Costo del concepto propio"
                placeholder="Costo MXN"
                value={propio.cost}
                onChange={(e) => setPropio((p) => ({ ...p, cost: e.target.value }))}
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-label="Cupo por unidad del costo propio"
                  placeholder="Cupo"
                  value={propio.cap}
                  disabled={propio.unit === 'pax'}
                  onChange={(e) => setPropio((p) => ({ ...p, cap: e.target.value }))}
                />
                <Button type="button" variant="outline" size="icon" aria-label="Agregar costo propio" onClick={agregarPropio}>
                  <PlusIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          {lineas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay costos en este viaje.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Se cobra</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Total a {n} pax</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l) => {
                    const limpio = doc.lines.find(
                      (x) => x.supplier_id === l.supplier_id && x.rate_key === l.rate_key && x.label === l.label
                    )
                    const borrado = !proveedores.some((p) => p.id === l.supplier_id)
                    return (
                      <TableRow key={l.uid}>
                        <TableCell>
                          <p className="font-medium">{l.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.supplier_name}
                            {borrado ? ' (proveedor eliminado)' : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{UNIT_LABELS[l.unit]}</TableCell>
                        <TableCell className="text-right">
                          {l.unit === 'habitacion' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="ml-auto flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.5"
                                className="w-20 text-right"
                                aria-label={
                                  l.unit === 'dia'
                                    ? `Días de ${l.label}`
                                    : l.unit === 'noche'
                                      ? `Noches de ${l.label}`
                                      : `Cantidad de ${l.label}`
                                }
                                value={l.qty}
                                onChange={(e) =>
                                  setLineas((ls) => ls.map((x) => (x.uid === l.uid ? { ...x, qty: e.target.value } : x)))
                                }
                              />
                              {(l.unit === 'dia' || l.unit === 'noche') && (
                                <span className="text-xs text-muted-foreground">{l.unit === 'dia' ? 'días' : 'noches'}</span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Campo deshabilitado a propósito: las unidades las decide
                              el cupo (2 sprinters de 20 para 40 pax), no la persona.
                              Mostrar el número y el porqué es lo que evita leer el
                              escalón como "se multiplicó por 2". */}
                          {l.unit === 'habitacion' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="ml-auto flex flex-col items-end gap-1">
                              <Input
                                readOnly
                                disabled
                                tabIndex={-1}
                                className="w-20 text-right"
                                aria-label={`Unidades de ${l.label}`}
                                value={l.unit === 'pax' ? n : limpio ? unidades(limpio, n) : 1}
                              />
                              <span className="text-xs text-muted-foreground">
                                {l.unit === 'pax'
                                  ? 'una por pasajero'
                                  : limpio?.cap
                                    ? `${n} pax ÷ cupo ${limpio.cap}`
                                    : 'sin cupo: siempre 1'}
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{resumenCosto(l)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.unit === 'habitacion'
                            ? 'por pax'
                            : limpio
                              ? mxn.format(totalLinea(limpio, n))
                              : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar ${l.label}`}
                            onClick={() => setLineas((ls) => ls.filter((x) => x.uid !== l.uid))}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {addOns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extras</CardTitle>
            <CardDescription>
              Lo que te cuesta cada extra que vendes, por persona. Así sabes a
              quién le debes y cuánto te queda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {addOns.map((a) => {
              const e = extras[a.key] ?? { cost: '' }
              const sel = e.supplier_id && e.rate_key ? `${e.supplier_id}|${e.rate_key}` : ''
              const costo = doc.addon_costs[a.key]
              return (
                <div key={a.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">Se vende en {mxn.format(a.price)}</p>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`ex-${a.key}-prov`} className="text-xs">
                      Tarifa del proveedor
                    </Label>
                    <NativeSelect
                      id={`ex-${a.key}-prov`}
                      value={sel}
                      onChange={(ev) => {
                        const [pid, rk] = ev.target.value.split('|')
                        const hit = tarifasPax.find((t) => t.prov.id === pid && t.rate.key === rk)
                        setExtras((x) => ({
                          ...x,
                          [a.key]: hit
                            ? { cost: String(hit.rate.cost ?? 0), supplier_id: hit.prov.id, supplier_name: hit.prov.name, rate_key: hit.rate.key }
                            : { cost: x[a.key]?.cost ?? '' },
                        }))
                      }}
                    >
                      <option value="">Costo manual</option>
                      {tarifasPax.map((t) => (
                        <option key={`${t.prov.id}|${t.rate.key}`} value={`${t.prov.id}|${t.rate.key}`}>
                          {t.prov.name} · {t.rate.label} ({mxn.format(t.rate.cost ?? 0)})
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`ex-${a.key}-cost`} className="text-xs">
                      Costo / persona
                    </Label>
                    <Input
                      id={`ex-${a.key}-cost`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="w-28"
                      value={e.cost}
                      onChange={(ev) => setExtras((x) => ({ ...x, [a.key]: { ...e, cost: ev.target.value } }))}
                    />
                  </div>
                  <p className={`text-sm tabular-nums ${margenAddon(a, costo) < 0 ? 'text-destructive' : ''}`}>
                    Te queda {mxn.format(margenAddon(a, costo))}
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resultado a {n} pasajeros</CardTitle>
          <CardDescription>
            {res.precio == null
              ? 'Agrega costos para ver el resultado.'
              : doc.precio_venta != null
                ? `Al precio que tecleaste: ${mxn.format(doc.precio_venta)} por pax.`
                : `Al precio sugerido por tu margen: ${mxn.format(res.precio)} por pax. Teclea otro arriba para probarlo.`}
            {portal ? ` Neto de la comisión del portal (${comisionPortalPct} %).` : ''}
            {!hayHospedaje ? ' Sin hospedaje, el costo es igual para todas las ocupaciones.' : ` Referencia: ${(ref?.label ?? 'doble').toLowerCase()}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Costo total"
              value={dinero(res.costoPax == null ? null : res.costoPax * n)}
              hint={doc.imprevistos_pct ? `incluye ${doc.imprevistos_pct} % de imprevistos` : undefined}
            />
            <StatTile label="Costo por pax" value={dinero(res.costoPax)} hint={hayHospedaje && ref ? ref.label : undefined} />
            <StatTile label="Precio sugerido" value={dinero(res.sugerido)} hint={`margen ${doc.margin_pct} %, redondeo comercial`} />
            <StatTile
              label="Punto de equilibrio"
              value={res.precio == null ? '—' : res.equilibrio == null ? 'nunca' : `${res.equilibrio} pax`}
              tone={res.precio == null ? 'neutral' : res.equilibrio == null ? 'bad' : res.equilibrio <= n ? 'good' : 'warn'}
              hint={res.precio != null ? `a ${mxn.format(res.precio)}, hasta ${maxN} pax` : undefined}
            />
            <StatTile
              label={portal ? 'Utilidad plan (neta)' : 'Utilidad plan'}
              value={dinero(res.plan?.utilidad)}
              tone={res.plan ? (res.plan.utilidad >= 0 ? 'good' : 'bad') : 'neutral'}
              hint={res.plan ? `${n} pax · margen ${pct(res.plan.pct)}` : undefined}
            />
            <StatTile
              label={portal ? 'Utilidad lleno (neta)' : 'Utilidad lleno'}
              value={dinero(res.lleno?.utilidad)}
              tone={res.lleno ? (res.lleno.utilidad >= 0 ? 'good' : 'bad') : 'neutral'}
              hint={
                res.lleno
                  ? brincos.length
                    ? `${maxN} pax · margen ${pct(res.lleno.pct)} · rebasa el cupo de ${brincos
                        .map((b) => `${b.label} (${b.de} → ${b.a})`)
                        .join(', ')}`
                    : `${maxN} pax · margen ${pct(res.lleno.pct)}`
                  : undefined
              }
            />
          </div>

          {/* ADR-0061: una fila por ocupación del catálogo. Sirve para CREAR las
              opciones de precio de un servicio que no las tiene (Dunas: precio 0,
              sin packs) o para reponer las que tiene. Lo que se escribe es el
              precio propuesto: el tecleado (sin hospedaje) o el sugerido. */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Opción de precio</TableHead>
                  <TableHead className="text-right">Costo / pax</TableHead>
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead className="text-right">Precio actual</TableHead>
                  <TableHead className="text-right">Propuesto</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => {
                  const marcado = seleccion.includes(f.key)
                  const sinCosto = f.propuesto == null
                  return (
                    <TableRow key={f.key} className={sinCosto ? 'opacity-60' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="accent-primary"
                          aria-label={`Incluir ${f.label}`}
                          checked={marcado && !sinCosto}
                          disabled={sinCosto}
                          onChange={() =>
                            setSeleccion((sel) => (marcado ? sel.filter((k) => k !== f.key) : [...sel, f.key]))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{f.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{dinero(f.costo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{dinero(f.sugerido)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {f.actual == null ? 'sin opción' : mxn.format(f.actual)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{dinero(f.propuesto)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${f.margen && f.margen.utilidad < 0 ? 'text-destructive' : ''}`}>
                        {sinCosto ? 'el hotel no la ofrece' : pct(f.margen?.pct)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={guardar} disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar costeo'}
            </Button>
            <Button
              type="button"
              variant={confirmarAplicar ? 'destructive' : 'outline'}
              onClick={guardarPrecios}
              disabled={isPending || paraGuardar.length === 0}
            >
              {confirmarAplicar
                ? 'Confirmar: cambiar precios públicos'
                : packs.length
                  ? 'Guardar precios en el servicio'
                  : 'Crear opciones de precio en el servicio'}
            </Button>
            {confirmarAplicar && (
              <>
                <span className="text-xs text-muted-foreground">
                  {paraGuardar.map((f) => `${f.label.split(' ')[0]} ${mxn.format(f.propuesto!)}`).join(' · ')}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarAplicar(false)}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {ref && salidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Salidas</CardTitle>
            <CardDescription>
              Margen estimado con los pasajeros que ya tiene cada salida, al
              precio de esa fecha (con su ajuste de temporada).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salida</TableHead>
                  <TableHead className="text-right">Pax</TableHead>
                  <TableHead className="text-right">Precio {ref.label.split(' ')[0].toLowerCase()}</TableHead>
                  <TableHead className="text-right">Utilidad hoy</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salidas.map((s) => {
                  const precio = precioDePack(ref.price, refKey, s.price_pct, s.pack_price_overrides)
                  const m = s.seats_taken > 0 ? margenA(doc, refKey, s.seats_taken, precio, comisionPortalPct) : null
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{formatTravelDate(s.departs_on)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.seats_taken}/{s.max_capacity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{mxn.format(precio)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${m && m.utilidad < 0 ? 'text-destructive' : ''}`}>
                        {m ? mxn.format(m.utilidad) : 'sin pax'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{pct(m?.pct)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
