'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { liquidarCuenta } from './cuentas-actions'

// Botón de liquidación (superadmin): cierra el saldo de la cuenta contra la
// plataforma. El dinero real ya se movió por fuera; esto lo registra.
export function LiquidarBoton({
  accountType,
  supplierId,
  profileId,
  nombre,
  saldo,
}: {
  accountType: string
  supplierId: string | null
  profileId: string | null
  nombre: string
  saldo: number
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
  const accion = saldo > 0 ? 'pagarle a' : 'cobrarle a'

  function liquidar() {
    startTransition(async () => {
      const res = await liquidarCuenta({ accountType, supplierId, profileId })
      setConfirmando(false)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Liquidación registrada: la cuenta quedó en ceros.')
    })
  }

  if (confirmando) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          ¿{accion} {nombre} {mxn.format(Math.abs(saldo))}? El dinero ya debió
          moverse por fuera.
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConfirmando(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          loading={isPending}
          onClick={liquidar}
        >
          Confirmar
        </Button>
      </span>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setConfirmando(true)}
    >
      Liquidar
    </Button>
  )
}
