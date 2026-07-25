'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearAccesoProveedor } from './acceso-actions'

/** Da acceso (login) al proveedor: crea un profile type='proveedor' ligado a este
 *  supplier. Solo superadmin (la puerta vive también en la acción). */
export function CrearAcceso({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)
    setLink(null)
    startTransition(async () => {
      const res = await crearAccesoProveedor({
        supplierId,
        nombre,
        email: email.trim() || undefined,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setNombre('')
      setEmail('')
      setOk(true)
      setLink(res.link ?? null)
      router.refresh()
    })
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard bloqueado: seleccionar a mano.
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acc-nombre">Nombre del contacto</Label>
          <Input
            id="acc-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Persona que entrará"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-email">Correo (opcional)</Label>
          <Input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ok && !link && (
        <p className="text-sm text-emerald-600">
          Acceso creado (no se pudo generar el link; reintenta más tarde).
        </p>
      )}
      {link && (
        <div className="space-y-1.5">
          <p className="text-sm text-emerald-600">
            Acceso creado. Comparte este link por WhatsApp para que entre:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              {link}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copiar}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </div>
        </div>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Dar acceso'}
      </Button>
    </form>
  )
}
