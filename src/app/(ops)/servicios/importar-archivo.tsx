'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { leerArchivoServicio } from './importar-actions'
import type { ServicioLeido } from '@/lib/ai/servicio-leido'

const ACEPTA = 'application/pdf,image/png,image/jpeg,image/webp'

/**
 * Atajo para llenar el form desde el volante del tour (PDF o foto).
 * Solo pre-rellena: no guarda ni envía. El agente revisa y confirma.
 */
export function ImportarArchivo({
  onDatos,
}: {
  onDatos: (datos: ServicioLeido) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)

  function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // Se limpia el input de inmediato para poder reintentar el MISMO archivo.
    e.target.value = ''
    if (!archivo) return

    setError(null)
    setListo(null)

    const formData = new FormData()
    formData.set('archivo', archivo)

    startTransition(async () => {
      const resultado = await leerArchivoServicio(formData)
      if ('error' in resultado) {
        setError(resultado.error)
        return
      }
      onDatos(resultado.datos)
      setListo(archivo.name)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Llenar desde un archivo</CardTitle>
        <CardDescription>
          Sube el volante del tour (PDF, JPG o PNG) y se rellenan los campos de
          abajo. <strong>No se guarda nada</strong>: revisa y corrige antes de
          dar Guardar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACEPTA}
          className="sr-only"
          onChange={handleArchivo}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          {isPending ? 'Leyendo el archivo…' : 'Subir PDF o imagen'}
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
            Listo: campos rellenados desde «{listo}». Revísalos, la lectura
            puede equivocarse.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
