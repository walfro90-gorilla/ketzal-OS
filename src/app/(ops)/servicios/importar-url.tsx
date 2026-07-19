'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { leerProductoWhatsApp } from './importar-actions'
import type { ServicioLeido } from '@/lib/ai/servicio-leido'

/**
 * Atajo para llenar el form desde un producto del catálogo de WhatsApp.
 * Solo pre-rellena: no guarda ni envía. El agente revisa y confirma.
 */
export function ImportarUrl({
  onDatos,
}: {
  onDatos: (datos: ServicioLeido) => void
}) {
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || isPending) return

    setError(null)
    setListo(false)

    startTransition(async () => {
      const resultado = await leerProductoWhatsApp(url)
      if ('error' in resultado) {
        setError(resultado.error)
        return
      }
      onDatos(resultado.datos)
      setListo(true)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Llenar desde WhatsApp</CardTitle>
        <CardDescription>
          Pega el link de un producto del catálogo (se ve así:{' '}
          <code className="text-xs">wa.me/p/…</code>) y se rellenan los campos de
          abajo. <strong>No se guarda nada</strong>: revisa y corrige antes de dar
          Guardar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Sin <form> anidado: este componente se monta dentro del form del
            servicio y anidarlos es HTML inválido. El submit va por el botón. */}
        <div className="space-y-3">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://wa.me/p/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit(e)
            }}
            disabled={isPending}
            aria-label="Link del producto de WhatsApp"
          />
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !url.trim()}
            onClick={handleSubmit}
          >
            {isPending ? 'Leyendo el link…' : 'Leer link'}
          </Button>

          {isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Puede tardar unos segundos.
            </p>
          )}
          {listo && (
            <p
              role="status"
              className="text-sm text-emerald-600 dark:text-emerald-400"
            >
              Listo: campos rellenados desde WhatsApp. Revísalos, la lectura puede
              equivocarse.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
