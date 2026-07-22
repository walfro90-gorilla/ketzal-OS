'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { UserPlusIcon, XIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { agregarPasajero, eliminarPasajero, type Pasajero } from './pasajeros-actions'

const TIPOS = ['adulto', 'niño', 'infante', 'adulto mayor']

export function PasajerosSection({
  bookingId,
  numPax,
  initial,
  canEdit,
}: {
  bookingId: string
  numPax: number
  initial: Pasajero[]
  canEdit: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('adulto')
  const [doc, setDoc] = useState('')

  const capturados = initial.length
  const completos = capturados >= numPax

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('Escribe el nombre del pasajero.')
      return
    }
    startTransition(async () => {
      const res = await agregarPasajero(bookingId, {
        full_name: nombre.trim(),
        passenger_type: tipo,
        doc_id: doc.trim() || null,
      })
      if ('error' in res) toast.error(res.error)
      else {
        toast.success('Pasajero agregado')
        setNombre('')
        setDoc('')
      }
    })
  }

  function onRemove(id: string, name: string) {
    if (!window.confirm(`¿Quitar a ${name} de la lista de pasajeros?`)) return
    startTransition(async () => {
      const res = await eliminarPasajero(id, bookingId)
      if ('error' in res) toast.error(res.error)
      else toast.success('Pasajero quitado')
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Pasajeros</CardTitle>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              completos
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
          >
            {capturados}/{numPax} capturados
          </span>
        </div>
        <CardDescription>
          Nombres para el manifiesto de la salida. Editable; no afecta el dinero.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {initial.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {initial.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{p.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.passenger_type ?? '—'}
                    {p.doc_id ? ` · ${p.doc_id}` : ''}
                  </span>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onRemove(p.id, p.full_name)}
                    aria-label={`Quitar a ${p.full_name}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no hay pasajeros capturados.
          </p>
        )}

        {canEdit && (
          <form onSubmit={onAdd} className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <Input
              aria-label="Nombre del pasajero"
              placeholder="Nombre del pasajero"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <NativeSelect
              aria-label="Tipo de pasajero"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Documento (opcional)"
              placeholder="Documento (opcional)"
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
            />
            <Button type="submit" disabled={isPending}>
              <UserPlusIcon className="size-4" />
              Agregar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
