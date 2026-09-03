'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RegistroComprador } from '@/app/comprar/[serviceId]/comprador-forms'
import { reclamarCotizacion } from './guardar-actions'

// b091 (ADR-0039): la oferta de cuenta vive en la cotización que el prospecto ya
// tiene abierta. Sin sesión: alta de viajero (el mismo `RegistroComprador` del
// checkout) y al crearla se reclama; con sesión: un botón. El token de la URL
// es la llave — no se casa por correo ni teléfono.
export function GuardarCotizacion({
  token,
  conSesion,
  nombre,
  agencia,
}: {
  token: string
  conSesion: boolean
  /** Nombre que el agente capturó: prellena el alta. */
  nombre: string
  agencia: string
}) {
  const router = useRouter()
  const [abrirAlta, setAbrirAlta] = useState(false)
  const [pending, start] = useTransition()
  const volverAqui = `/cotizacion/${token}`

  function guardar() {
    start(async () => {
      const res = await reclamarCotizacion(token)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Cotización guardada en tus viajes.')
      router.push('/mis-compras')
    })
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base">Guarda esta cotización en tu cuenta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tenla siempre a la mano con su plan de pagos y descubre más viajes de{' '}
          {agencia}. Los pagos siguen con tu agente.
        </p>
        {conSesion ? (
          <Button type="button" size="touch" className="w-full" disabled={pending} onClick={guardar}>
            {pending ? 'Guardando…' : 'Guardar en Mis viajes'}
          </Button>
        ) : abrirAlta ? (
          <RegistroComprador
            nombreInicial={nombre}
            next={volverAqui}
            onCreada={guardar}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" size="touch" onClick={() => setAbrirAlta(true)}>
              Crear mi cuenta
            </Button>
            <Link
              href={`/entrar?next=${encodeURIComponent(volverAqui)}`}
              className={buttonVariants({ variant: 'outline', size: 'touch' })}
            >
              Ya tengo cuenta
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
