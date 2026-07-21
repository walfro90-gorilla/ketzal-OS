'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { crearPedido } from '../actions'

// Pedido de marketplace (B.1-1). El comprador elige tipo(s) de lugar (packs) y,
// si el viaje se vende por cupo, la fecha de salida. Al confirmar se crea un
// pedido 'draft' (no baja cupo; sin pago). El total es informativo: el servidor
// recalcula el precio desde los packs. Pago en línea llega en B.2.

export type Pack = { key: string; label: string; price: number }
export type Departure = { id: string; departs_on: string; free: number }

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function fechaLarga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}

/** Botón de handoff a WhatsApp; si la agencia no tiene número, cae a un aviso. */
function WaButton({ phone, text }: { phone: string | null; text: string }) {
  const digits = phone?.replace(/\D/g, '')
  if (!digits)
    return (
      <p className="text-sm text-muted-foreground">
        La agencia no tiene WhatsApp configurado; te contactará por correo.
      </p>
    )
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonVariants({ variant: 'default', size: 'touch' })} w-full`}
    >
      Coordinar por WhatsApp
    </a>
  )
}

export function PedidoForm({
  serviceId,
  serviceName,
  packs,
  departures,
  buyerName,
  agencyPhone,
}: {
  serviceId: string
  serviceName: string
  packs: Pack[]
  departures: Departure[]
  buyerName: string
  agencyPhone: string | null
}) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [depId, setDepId] = useState(departures[0]?.id ?? '')
  const [ref, setRef] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const total = useMemo(
    () => packs.reduce((s, p) => s + p.price * (qty[p.key] ?? 0), 0),
    [packs, qty],
  )
  const totalPax = packs.reduce((s, p) => s + (qty[p.key] ?? 0), 0)

  function bump(key: string, delta: number) {
    setQty((q) => ({ ...q, [key]: Math.max(0, (q[key] ?? 0) + delta) }))
  }

  function submit() {
    if (totalPax < 1) return toast.error('Elige al menos una opción.')
    if (departures.length > 0 && !depId)
      return toast.error('Elige una fecha de salida.')
    const items = packs
      .filter((p) => (qty[p.key] ?? 0) > 0)
      .map((p) => ({ pack_key: p.key, label: p.label, qty: qty[p.key] }))
    const dep = departures.find((d) => d.id === depId)
    start(async () => {
      const res = await crearPedido({
        serviceId,
        travelDate: dep?.departs_on ?? null,
        items,
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setRef(res.bookingId.slice(0, 8))
    })
  }

  // Servicio sin packs configurados: no hay pedido self-service; handoff directo.
  if (packs.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Este viaje todavía no tiene precios para comprar en línea. Coordina tu
          compra con la agencia.
        </p>
        <WaButton
          phone={agencyPhone}
          text={`Hola, soy ${buyerName}. Me interesa "${serviceName}".`}
        />
      </div>
    )
  }

  if (ref) {
    const msg =
      `Hola, soy ${buyerName}. Hice el pedido ${ref} de "${serviceName}" ` +
      `(${totalPax} ${totalPax === 1 ? 'persona' : 'personas'}, ${mxn.format(total)}). ` +
      `Quiero coordinar el pago.`
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">¡Pedido creado! Ref {ref}</p>
          <p className="mt-1 text-muted-foreground">
            Aún no es una compra pagada. El{' '}
            <strong>pago en línea llega muy pronto</strong>; por ahora coordina
            con la agencia para apartar tu lugar.
          </p>
        </div>
        <WaButton phone={agencyPhone} text={msg} />
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">Elige tus lugares</p>
        {packs.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{p.label}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {mxn.format(p.price)} c/u
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                onClick={() => bump(p.key, -1)}
                disabled={(qty[p.key] ?? 0) === 0}
                aria-label={`Quitar ${p.label}`}
              >
                −
              </Button>
              <span className="w-6 text-center tabular-nums">
                {qty[p.key] ?? 0}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                onClick={() => bump(p.key, 1)}
                aria-label={`Agregar ${p.label}`}
              >
                +
              </Button>
            </div>
          </div>
        ))}
      </div>

      {departures.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="dep" className="text-sm font-medium">
            Fecha de salida
          </label>
          <NativeSelect
            id="dep"
            value={depId}
            onChange={(e) => setDepId(e.target.value)}
          >
            {departures.map((d) => (
              <option key={d.id} value={d.id}>
                {fechaLarga(d.departs_on)} · {d.free} lugares
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-sm text-muted-foreground">
          {totalPax} {totalPax === 1 ? 'persona' : 'personas'}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {mxn.format(total)}
        </span>
      </div>

      <Button
        type="button"
        size="touch"
        className="w-full"
        disabled={pending || totalPax < 1}
        onClick={submit}
      >
        {pending ? 'Creando pedido…' : 'Crear pedido'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Sin pago aún: apartas y coordinas con la agencia.
      </p>
    </div>
  )
}
