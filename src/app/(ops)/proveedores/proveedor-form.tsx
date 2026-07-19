'use client'

import { useState, useTransition } from 'react'
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
import { PhoneInput } from '@/components/ui/phone-input'
import {
  actualizarProveedor,
  crearProveedor,
  type ProveedorInput,
} from './actions'

// Estilo de <textarea> nativo alineado al Input de shadcn (no hay Textarea en components/ui).
const textareaClass =
  'min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

// Estilo de <select> nativo alineado al Input de shadcn (no hay Select en components/ui).
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

type ProveedorTipo = 'agency' | 'transporte' | 'hotel' | 'otro'

/** Acota el supplier_type de la BD a las opciones del select. */
function normalizarTipo(tipo: string | null | undefined): ProveedorTipo {
  if (tipo === 'agency' || tipo === 'tour_operator') return 'agency'
  if (tipo === 'transporte' || tipo === 'hotel') return tipo
  return 'otro'
}

export type ProveedorFormInitial = {
  name: string
  contact_email: string
  phone_number: string
  address: string
  description: string
  supplier_type: string | null
  commission_rate: number
}

export function ProveedorForm({
  proveedorId,
  initial,
}: {
  /** Si viene, el formulario edita (actualizarProveedor); si no, crea (crearProveedor). */
  proveedorId?: string
  initial?: ProveedorFormInitial
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState(initial?.name ?? '')
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '')
  const [phoneNumber, setPhoneNumber] = useState(initial?.phone_number ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tipo, setTipo] = useState<ProveedorTipo>(
    initial ? normalizarTipo(initial.supplier_type) : 'agency'
  )
  const [commissionRate, setCommissionRate] = useState(
    String(initial?.commission_rate ?? 0)
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!name.trim()) {
      setError('Escribe el nombre del proveedor.')
      return
    }
    if (!contactEmail.trim()) {
      setError('Escribe el correo de contacto.')
      return
    }

    let rate = 0
    if (tipo === 'agency') {
      rate = Number(commissionRate)
      if (
        commissionRate.trim() === '' ||
        !Number.isFinite(rate) ||
        rate < 0 ||
        rate > 100
      ) {
        setError('El porcentaje de comisión debe estar entre 0 y 100.')
        return
      }
    }

    const input: ProveedorInput = {
      name: name.trim(),
      contact_email: contactEmail.trim(),
      phone_number: phoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      description: description.trim() || undefined,
      supplier_type: tipo,
      commission_rate: tipo === 'agency' ? rate : undefined,
    }

    startTransition(async () => {
      if (proveedorId) {
        const result = await actualizarProveedor(proveedorId, input)
        if ('error' in result) setError(result.error)
        else setSaved(true)
      } else {
        // En éxito la acción redirige a /proveedores/[id]; solo llega aquí con error.
        const result = await crearProveedor(input)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos del proveedor</CardTitle>
          <CardDescription>
            El nombre y el correo de contacto son obligatorios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-nombre">Nombre *</Label>
              <Input
                id="proveedor-nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Wanderlust Travels"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-email">Correo de contacto *</Label>
              <Input
                id="proveedor-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Ej. contacto@proveedor.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-telefono">Teléfono</Label>
              <PhoneInput
                id="proveedor-telefono"
                value={phoneNumber}
                onChange={setPhoneNumber}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-tipo">Tipo</Label>
              <select
                id="proveedor-tipo"
                className={selectClass}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ProveedorTipo)}
              >
                <option value="agency">Agencia</option>
                <option value="transporte">Transporte</option>
                <option value="hotel">Hotel</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            {tipo === 'agency' && (
              <div className="space-y-2">
                <Label htmlFor="proveedor-comision">Comisión %</Label>
                <Input
                  id="proveedor-comision"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.5"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="Ej. 10"
                />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-direccion">Dirección</Label>
              <Input
                id="proveedor-direccion"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, ciudad… (opcional)"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-descripcion">Descripción</Label>
              <textarea
                id="proveedor-descripcion"
                className={textareaClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notas internas del proveedor (opcional)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? 'Guardando…'
            : proveedorId
              ? 'Guardar cambios'
              : 'Guardar proveedor'}
        </Button>
        {saved && (
          <span
            role="status"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Guardado ✓
          </span>
        )}
      </div>
    </form>
  )
}
