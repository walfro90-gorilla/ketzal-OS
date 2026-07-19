'use client'

import Link from 'next/link'
import {
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { ChevronDownIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  lineTotal,
  subtotal as calcSubtotal,
  total as calcTotal,
} from '@/lib/domain/pricing'
import {
  createBooking,
  type CreateBookingInput,
  type CreateBookingLine,
} from '../actions'
import { ITEM_TYPE_LABELS, PASSENGER_TYPE_LABELS, mxn } from '../ui'
import type { Pack } from '@/lib/domain/packs'

export type CustomerOption = { id: string; full_name: string }
// packs = precios por ocupación (sencilla/doble/triple/cuádruple). PRESET:
// al elegir un paquete, autollena el `unit_price` de las líneas de PASAJERO
// (no crear línea `room` suelta, o num_pax=0 y el cupo no baja). El precio
// sigue siendo editable a mano (válvula) tras aplicar el preset.
export type ServiceOption = {
  id: string
  name: string
  price: number | null
  packs?: Pack[]
}
// Una salida vendible: fecha + lugares restantes (0 = agotada).
export type DepartureOption = { id: string; departs_on: string; remaining: number }

/** YYYY-MM-DD → etiqueta corta es-MX para el selector de salida. */
function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type ItemType = CreateBookingLine['item_type']
type PassengerType = NonNullable<CreateBookingLine['passenger_type']>

type LineDraft = {
  key: number
  item_type: ItemType
  passenger_type: PassengerType
  description: string
  qty: string
  unit_price: string
}

// <select> nativo (en móvil el picker del SO es mejor UX que un dropdown custom).
// Táctil en móvil (44px), compacto en desktop; el `text-base` móvil evita el zoom de iOS.
const selectClass =
  'h-11 md:h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

// El <select> con appearance-none pierde la flecha nativa: la reponemos con un chevron.
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

// Campo con etiqueta visible (para las tarjetas móviles; los controles ya traen aria-label).
function LabeledField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const ITEM_TYPES: ItemType[] = ['passenger', 'room', 'addon', 'custom']
const PASSENGER_TYPES: PassengerType[] = ['adult', 'child', 'inapam']

function newLine(key: number): LineDraft {
  return {
    key,
    item_type: 'passenger',
    passenger_type: 'adult',
    description: '',
    qty: '1',
    unit_price: '',
  }
}

export function NuevaVentaForm({
  customers,
  services,
  departuresByService,
}: {
  customers: CustomerOption[]
  services: ServiceOption[]
  departuresByService: Record<string, DepartureOption[]>
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Cliente
  const [newCustomerMode, setNewCustomerMode] = useState(customers.length === 0)
  const [customerId, setCustomerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  // Servicio y fecha
  const [serviceId, setServiceId] = useState('')
  const [travelDate, setTravelDate] = useState('')
  const [packKey, setPackKey] = useState('')

  const selectedService = services.find((s) => s.id === serviceId)
  const salidas = departuresByService[serviceId] ?? []
  const packs = selectedService?.packs ?? []

  // Líneas
  const nextKey = useRef(1)
  const [lines, setLines] = useState<LineDraft[]>([newLine(0)])

  // Totales
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')

  const parsedLines = lines.map((l) => ({
    qty: Number(l.qty) || 0,
    unitPrice: Number(l.unit_price) || 0,
  }))
  const discountNum = Number(discount) || 0
  const subtotalNum = calcSubtotal(parsedLines)
  const totalNum = calcTotal(parsedLines, discountNum)

  function handleServiceChange(id: string) {
    setServiceId(id)
    // Salidas y paquetes son por servicio: al cambiar, se reinicia la selección.
    setTravelDate('')
    setPackKey('')
    if (!id) return
    const service = services.find((s) => s.id === id)
    if (!service || service.price == null) return
    // Prefill del precio unitario de la primera línea de pasajero (sigue editable).
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item_type === 'passenger')
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], unit_price: String(service.price) }
      return next
    })
  }

  // Preset de paquete: aplica el precio por persona a TODAS las líneas de
  // pasajero (sigue editable a mano). El paquete es precio, no cabezas: el cupo
  // baja por num_pax contra la salida.
  function aplicarPaquete(key: string) {
    setPackKey(key)
    if (!key) return
    const pack = packs.find((p) => p.key === key)
    if (!pack) return
    setLines((prev) =>
      prev.map((l) =>
        l.item_type === 'passenger' ? { ...l, unit_price: String(pack.price) } : l
      )
    )
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, newLine(nextKey.current++)])
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }

  // Un solo flujo de validación para ambos botones: venta ('reserved')
  // o cotización ('draft'); solo cambia el status enviado a createBooking.
  function submit(status: 'reserved' | 'draft') {
    setError(null)

    if (newCustomerMode) {
      if (!newName.trim()) {
        setError('Escribe el nombre del nuevo cliente.')
        return
      }
    } else if (!customerId) {
      setError('Selecciona un cliente o crea uno nuevo.')
      return
    }

    const lineInputs: CreateBookingLine[] = lines.map((l) => ({
      item_type: l.item_type,
      passenger_type: l.item_type === 'passenger' ? l.passenger_type : null,
      description: l.description.trim() || null,
      qty: Number(l.qty),
      unit_price: Number(l.unit_price) || 0,
    }))

    for (const l of lineInputs) {
      if (!Number.isInteger(l.qty) || l.qty < 1) {
        setError('Cada línea necesita una cantidad entera de al menos 1.')
        return
      }
      if (l.unit_price < 0) {
        setError('El precio unitario no puede ser negativo.')
        return
      }
    }
    if (discountNum < 0) {
      setError('El descuento no puede ser negativo.')
      return
    }
    if (totalNum < 0) {
      setError('El descuento no puede ser mayor que el subtotal.')
      return
    }

    const input: CreateBookingInput = {
      customerId: newCustomerMode ? undefined : customerId,
      newCustomer: newCustomerMode
        ? { full_name: newName.trim(), phone: newPhone.trim() || undefined }
        : undefined,
      serviceId: serviceId || undefined,
      travelDate: travelDate || undefined,
      discount: discountNum,
      notes: notes.trim() || undefined,
      lines: lineInputs,
      status,
    }

    startTransition(async () => {
      const result = await createBooking(input)
      // En éxito la acción redirige (/ventas/[id] o /cotizaciones); solo llega aquí con error.
      if (result?.error) {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submit('reserved')
  }

  // --- Render-helpers de campo: una sola fuente por control, reusada en
  //     la tabla (desktop) y en las tarjetas (móvil). ---
  const tipoSelect = (line: LineDraft) => (
    <NativeSelect
      aria-label="Tipo de línea"
      value={line.item_type}
      onChange={(e) =>
        updateLine(line.key, { item_type: e.target.value as ItemType })
      }
    >
      {ITEM_TYPES.map((t) => (
        <option key={t} value={t}>
          {ITEM_TYPE_LABELS[t]}
        </option>
      ))}
    </NativeSelect>
  )

  const subtipoSelect = (line: LineDraft) => (
    <NativeSelect
      aria-label="Tipo de pasajero"
      value={line.passenger_type}
      onChange={(e) =>
        updateLine(line.key, {
          passenger_type: e.target.value as PassengerType,
        })
      }
    >
      {PASSENGER_TYPES.map((t) => (
        <option key={t} value={t}>
          {PASSENGER_TYPE_LABELS[t]}
        </option>
      ))}
    </NativeSelect>
  )

  const descInput = (line: LineDraft) => (
    <Input
      aria-label="Descripción"
      value={line.description}
      onChange={(e) => updateLine(line.key, { description: e.target.value })}
      placeholder="Descripción"
    />
  )

  const qtyInput = (line: LineDraft) => (
    <Input
      aria-label="Cantidad"
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      value={line.qty}
      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
    />
  )

  const priceInput = (line: LineDraft) => (
    <Input
      aria-label="Precio unitario"
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={line.unit_price}
      onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
      placeholder="0.00"
    />
  )

  const importe = (line: LineDraft) =>
    mxn.format(
      lineTotal({
        qty: Number(line.qty) || 0,
        unitPrice: Number(line.unit_price) || 0,
      })
    )

  const deleteBtn = (line: LineDraft, size: 'icon-sm' | 'icon-touch') => (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label="Eliminar línea"
      onClick={() => removeLine(line.key)}
      disabled={lines.length === 1}
    >
      <Trash2Icon />
    </Button>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
          <CardDescription>
            Elige un cliente existente o da de alta uno nuevo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={newCustomerMode ? 'outline' : 'default'}
              onClick={() => setNewCustomerMode(false)}
              disabled={customers.length === 0}
              className="flex-1 sm:flex-none"
            >
              Cliente existente
            </Button>
            <Button
              type="button"
              variant={newCustomerMode ? 'default' : 'outline'}
              onClick={() => setNewCustomerMode(true)}
              className="flex-1 sm:flex-none"
            >
              Nuevo cliente
            </Button>
          </div>

          {newCustomerMode ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-customer-name">Nombre completo *</Label>
                <Input
                  id="new-customer-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. María Pérez"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-customer-phone">Teléfono</Label>
                <PhoneInput
                  id="new-customer-phone"
                  value={newPhone}
                  onChange={setNewPhone}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="customer-select">Cliente</Label>
              <NativeSelect
                id="customer-select"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Selecciona un cliente —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Servicio y fecha</CardTitle>
          <CardDescription>
            Al elegir un servicio se sugiere su precio en la primera línea de
            pasajero.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service-select">Servicio</Label>
            <NativeSelect
              id="service-select"
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
              <option value="">— A medida —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.price != null ? ` (${mxn.format(Number(s.price))})` : ''}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Con salidas dadas de alta → se elige una (con lugares libres) y de
              ahí sale la fecha. Sin salidas → fecha libre (venta sin tope). */}
          {salidas.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="salida-select">Salida</Label>
              <NativeSelect
                id="salida-select"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
              >
                <option value="">— Elige salida —</option>
                {salidas.map((s) => (
                  <option
                    key={s.id}
                    value={s.departs_on}
                    disabled={s.remaining <= 0}
                  >
                    {fechaCorta(s.departs_on)} ·{' '}
                    {s.remaining > 0 ? `${s.remaining} lugares` : 'Agotado'}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="travel-date">Fecha de viaje</Label>
              <Input
                id="travel-date"
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
              />
            </div>
          )}

          {packs.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pack-select">Paquete (ocupación)</Label>
              <NativeSelect
                id="pack-select"
                value={packKey}
                onChange={(e) => aplicarPaquete(e.target.value)}
              >
                <option value="">— Precio a medida —</option>
                {packs.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} · {mxn.format(p.price)} p/persona
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Aplica el precio por persona a las líneas de pasajero. Editable
                después.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Líneas de la venta</CardTitle>
          <CardDescription>
            Pasajeros, habitaciones, add-ons o conceptos personalizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Desktop (md+): tabla compacta */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Tipo</TableHead>
                  <TableHead className="min-w-28">Subtipo</TableHead>
                  <TableHead className="min-w-44">Descripción</TableHead>
                  <TableHead className="w-20">Cant.</TableHead>
                  <TableHead className="w-28">P. unitario</TableHead>
                  <TableHead className="min-w-24 text-right">Importe</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.key}>
                    <TableCell>{tipoSelect(line)}</TableCell>
                    <TableCell>
                      {line.item_type === 'passenger' ? (
                        subtipoSelect(line)
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{descInput(line)}</TableCell>
                    <TableCell>{qtyInput(line)}</TableCell>
                    <TableCell>{priceInput(line)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {importe(line)}
                    </TableCell>
                    <TableCell>{deleteBtn(line, 'icon-sm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Móvil (<md): una tarjeta por línea */}
          <ul className="flex flex-col gap-4 md:hidden">
            {lines.map((line, i) => (
              <li key={line.key} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Línea {i + 1}</span>
                  {deleteBtn(line, 'icon-touch')}
                </div>

                {line.item_type === 'passenger' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <LabeledField label="Tipo">{tipoSelect(line)}</LabeledField>
                    <LabeledField label="Subtipo">
                      {subtipoSelect(line)}
                    </LabeledField>
                  </div>
                ) : (
                  <LabeledField label="Tipo">{tipoSelect(line)}</LabeledField>
                )}

                <LabeledField label="Descripción">
                  {descInput(line)}
                </LabeledField>

                <div className="grid grid-cols-2 gap-3">
                  <LabeledField label="Cantidad">{qtyInput(line)}</LabeledField>
                  <LabeledField label="P. unitario">
                    {priceInput(line)}
                  </LabeledField>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">Importe</span>
                  <span className="font-semibold tabular-nums">
                    {importe(line)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            onClick={addLine}
            className="w-full md:w-auto"
          >
            <PlusIcon />
            Agregar línea
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="ml-auto w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{mxn.format(subtotalNum)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <Label htmlFor="discount" className="text-muted-foreground">
                Descuento
              </Label>
              <Input
                id="discount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="w-32 text-right"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{mxn.format(totalNum)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas de la venta (opcional)"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? 'Guardando…' : 'Guardar venta'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => submit('draft')}
          className="w-full sm:w-auto"
        >
          {isPending ? 'Guardando…' : 'Guardar como cotización'}
        </Button>
        <Link
          href="/ventas"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full sm:w-auto'
          )}
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
