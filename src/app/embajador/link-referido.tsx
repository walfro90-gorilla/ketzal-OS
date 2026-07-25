'use client'

import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Muestra el link de referido del embajador (`/explora?ref=CODE`) y lo copia.
 *  El link se arma en el cliente con el origin real; el ?ref se propaga a la
 *  ficha y sobrevive hasta /comprar (atribución de la venta). */
export function LinkReferido({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState(`/explora?ref=${encodeURIComponent(code)}`)

  // El origin absoluto solo existe en el cliente (el server no lo tiene sin headers).
  useEffect(() => {
    setUrl(`${window.location.origin}/explora?ref=${encodeURIComponent(code)}`)
  }, [code])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard bloqueado: el usuario puede seleccionar el texto a mano.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {url}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copiar}>
          {copied ? (
            <>
              <CheckIcon className="size-4" /> Copiado
            </>
          ) : (
            <>
              <CopyIcon className="size-4" /> Copiar
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tu código: <span className="font-medium">{code}</span>
      </p>
    </div>
  )
}
