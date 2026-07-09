'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
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

export type CustomerOption = { id: string; full_name: string }
export type ServiceOption = { id: string; name: string; price: number | null }

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

// Estilo de <select> nativo alineado al Input de shadcn (no hay Select en components/ui).
const selectClass =
  'h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

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
}: {
  customers: CustomerOption[]
  services: ServiceOption[]
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
      if (result?.error) setError(result.error)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submit('reserved')
  }

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
              size="sm"
              variant={newCustomerMode ? 'outline' : 'default'}
              onClick={() => setNewCustomerMode(false)}
              disabled={customers.length === 0}
            >
              Cliente existente
            </Button>
            <Button
              type="button"
              size="sm"
              variant={newCustomerMode ? 'default' : 'outline'}
              onClick={() => setNewCustomerMode(true)}
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
                <Input
                  id="new-customer-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Ej. 656 123 4567"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="customer-select">Cliente</Label>
              <select
                id="customer-select"
                className={selectClass}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Selecciona un cliente —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Servicio y fecha</CardTitle>
          <CardDescription>
            Al elegir un servicio se sugiere su precio en la primera línea de pasajero.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service-select">Servicio</Label>
            <select
              id="service-select"
              className={selectClass}
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
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="travel-date">Fecha de viaje</Label>
            <Input
              id="travel-date"
              type="date"
              value={travelDate}
              onChange={(e) => setTravelDate(e.target.value)}
            />
          </div>
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
          <div className="overflow-x-auto">
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
                    <TableCell>
                      <select
                        aria-label="Tipo de línea"
                        className={selectClass}
                        value={line.item_type}
                        onChange={(e) =>
                          updateLine(line.key, {
                            item_type: e.target.value as ItemType,
                          })
                        }
                      >
                        {ITEM_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {ITEM_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {line.item_type === 'passenger' ? (
                        <select
                          aria-label="Tipo de pasajero"
                          className={selectClass}
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
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Descripción"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.key, { description: e.target.value })
                        }
                        placeholder="Descripción"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Cantidad"
                        type="number"
                        min={1}
                        step={1}
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Precio unitario"
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) =>
                          updateLine(line.key, { unit_price: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mxn.format(
                        lineTotal({
                          qty: Number(line.qty) || 0,
                          unitPrice: Number(line.unit_price) || 0,
                        })
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Eliminar línea"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                      >
                        ×
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Agregar línea
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar venta'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => submit('draft')}
        >
          {isPending ? 'Guardando…' : 'Guardar como cotización'}
        </Button>
        <Link href="/ventas" className={buttonVariants({ variant: 'outline' })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
