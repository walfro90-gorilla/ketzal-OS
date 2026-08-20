'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlusIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { resolverSolicitud } from '../dashboard/unirse-actions'

// b065 — El otro lado del flujo: el admin resuelve las solicitudes para entrar
// a SU agencia. Es el espejo de "Invitar agentes": la agencia invita por correo,
// y aquí la persona pide entrar y el admin decide.
//
// Aceptar mete a la persona como AGENTE (`role='user'`), nunca como admin:
// delegar mando es un acto aparte, en la fila del miembro.

export type SolicitudEntrada = {
  id: string
  nombre: string | null
  email: string | null
  mensaje: string | null
  creada: string
}

const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

export function SolicitudesSection({ solicitudes }: { solicitudes: SolicitudEntrada[] }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()

  // Sin solicitudes no hay nada que decidir: la tarjeta no aparece.
  if (solicitudes.length === 0) return null

  const resolver = (id: string, aprobar: boolean, quien: string) => {
    startTransition(async () => {
      const r = await resolverSolicitud(id, aprobar)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(aprobar ? `${quien} ya es parte de tu equipo.` : 'Solicitud rechazada.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="size-4" />
          Piden entrar a tu agencia
        </CardTitle>
        <CardDescription>
          Agentes de Ketzal que solicitaron unirse. Al aceptar entran como agentes
          y verán las ventas y clientes de la agencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {solicitudes.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.nombre ?? s.email ?? 'Sin nombre'}</p>
              <p className="text-xs text-muted-foreground">
                {s.email}
                {s.creada && ` · ${fecha.format(new Date(s.creada))}`}
              </p>
              {s.mensaje && (
                <p className="mt-1 text-xs italic text-muted-foreground">“{s.mensaje}”</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={pendiente}
                onClick={() => resolver(s.id, true, s.nombre ?? s.email ?? 'La persona')}
              >
                Aceptar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pendiente}
                onClick={() => resolver(s.id, false, '')}
              >
                Rechazar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
