'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { BrandMark } from '@/components/brand-mark'
import { subirLogo } from './subir-logo'
import { setLogo } from './actions'

export function LogoConfig({ initialLogo }: { initialLogo: string | null }) {
  const [logo, setLogo_] = useState(initialLogo)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    start(async () => {
      const up = await subirLogo(file)
      if ('error' in up) {
        toast.error(up.error)
        return
      }
      const res = await setLogo(up.url)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setLogo_(up.url)
      toast.success('Logo actualizado')
      router.refresh()
    })
  }

  function quitar() {
    start(async () => {
      const res = await setLogo(null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setLogo_(null)
      toast.success('Logo quitado')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo oficial</CardTitle>
        <CardDescription>
          Se muestra en el encabezado de la app y en el login. Usa PNG, SVG o
          WebP (idealmente con fondo transparente). Si no hay logo, se usa la
          marca por defecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-lg border bg-muted/40 p-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt="Logo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <BrandMark className="size-8 text-primary" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {logo ? 'Logo actual' : 'Sin logo — se usa la marca por defecto'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={elegir}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            {pending ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {logo && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={quitar}
            >
              Quitar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
