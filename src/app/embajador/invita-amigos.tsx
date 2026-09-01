'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { mxn } from '@/components/data/format'
import { waCompartir } from '@/lib/domain/embajador'

// Invitar a otro a ser embajador. El bono es ÚNICO y por persona: no se gana
// nada de las ventas del invitado. Eso no es un detalle de copy — es lo que
// separa un bono de referido de un esquema multinivel, con todo lo que eso trae
// (PROFECO, y la fama que lo acompaña).
//
// No hay auto-servicio ni tabla de candidatos: el embajador manda el mensaje, y
// quien administra da de alta al invitado eligiendo "¿quién lo invitó?". Menos
// piezas, y nadie queda en un limbo de "solicitud pendiente" que nadie revisa.

export function InvitaAmigos({
  nombre,
  monto,
  reclutas,
  bonosGanados,
}: {
  nombre: string | null
  /** Lo que gana por cada invitado que logre su primera venta. */
  monto: number
  /** Cuántos ha invitado ya. */
  reclutas: number
  /** Lo que lleva ganado en bonos. */
  bonosGanados: number
}) {
  const [copiado, setCopiado] = useState(false)
  const quien = nombre?.trim().split(/\s+/)[0]

  const mensaje = [
    '¿Te late ganar dinero compartiendo viajes? 🚌',
    '',
    'Soy embajador de Ketzal: comparto viajes con mi gente y gano por cada venta',
    'que traigo. No vendo yo — solo comparto el link, la agencia cierra y cobra.',
    '',
    quien
      ? `Si te interesa, dime y le paso tus datos a Ketzal para darte de alta. — ${quien}`
      : 'Si te interesa, dime y le paso tus datos a Ketzal para darte de alta.',
  ].join('\n')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      toast.success('Mensaje copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar; selecciona el texto a mano.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Invita a alguien a ser embajador y ganas{' '}
        <strong>{mxn.format(monto)} una sola vez</strong>, cuando esa persona
        logre su primera venta.{' '}
        <span className="text-muted-foreground">
          No ganas de sus ventas — solo ese bono.
        </span>
      </p>

      {reclutas > 0 && (
        <p className="text-sm text-muted-foreground">
          Ya invitaste a {reclutas === 1 ? '1 persona' : `${reclutas} personas`}
          {bonosGanados > 0
            ? ` y llevas ${mxn.format(bonosGanados)} en bonos.`
            : '. Cuando alguna venda por primera vez, el bono aparece aquí.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={waCompartir(mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'sm' })}
        >
          <MessageCircleIcon className="size-4" />
          Invitar por WhatsApp
        </a>
        <Button type="button" size="sm" variant="outline" onClick={copiar}>
          {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copiado ? 'Copiado' : 'Copiar mensaje'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Quien se anime te dice que sí y tú le pasas sus datos a Ketzal. Al darlo
        de alta se anota que tú lo invitaste, y de ahí sale tu bono.
      </p>
    </div>
  )
}
