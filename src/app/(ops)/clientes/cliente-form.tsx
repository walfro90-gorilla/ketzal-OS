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
import { actualizarCliente, crearCliente, type ClienteInput } from './actions'

// Estilo de <textarea> nativo alineado al Input de shadcn (no hay Textarea en components/ui).
const textareaClass =
  'min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

export type ClienteFormInitial = {
  full_name: string
  phone: string
  email: string
  doc_id: string
  notes: string
}

export function ClienteForm({
  customerId,
  initial,
}: {
  /** Si viene, el formulario edita (actualizarCliente); si no, crea (crearCliente). */
  customerId?: string
  initial?: ClienteFormInitial
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [docId, setDocId] = useState(initial?.doc_id ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!fullName.trim()) {
      setError('Escribe el nombre completo del cliente.')
      return
    }

    const input: ClienteInput = {
      full_name: fullName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      doc_id: docId.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    startTransition(async () => {
      if (customerId) {
        const result = await actualizarCliente(customerId, input)
        if ('error' in result) setError(result.error)
        else setSaved(true)
      } else {
        // En éxito la acción redirige a /clientes/[id]; solo llega aquí con error.
        const result = await crearCliente(input)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos del cliente</CardTitle>
          <CardDescription>
            Solo el nombre completo es obligatorio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cliente-nombre">Nombre completo *</Label>
              <Input
                id="cliente-nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. María Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-telefono">Teléfono</Label>
              <PhoneInput
                id="cliente-telefono"
                value={phone}
                onChange={setPhone}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-email">Email</Label>
              <Input
                id="cliente-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej. maria@correo.com"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cliente-doc">Identificación</Label>
              <Input
                id="cliente-doc"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="INE, pasaporte… (opcional)"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cliente-notas">Notas</Label>
              <textarea
                id="cliente-notas"
                className={textareaClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas del cliente (opcional)"
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
            : customerId
              ? 'Guardar cambios'
              : 'Guardar cliente'}
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
