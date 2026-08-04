'use client'

import { useTransition } from 'react'
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
  const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

  function liquidar() {
    const accion = saldo > 0 ? 'pagarle' : 'cobrarle'
    if (
      !window.confirm(
        `¿Registrar la liquidación de ${mxn.format(Math.abs(saldo))} (${accion} a ${nombre})? El dinero real ya debió moverse por fuera (SPEI/efectivo).`
      )
    )
      return
    startTransition(async () => {
      const res = await liquidarCuenta({ accountType, supplierId, profileId })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Liquidación registrada: la cuenta quedó en ceros.')
    })
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      loading={isPending}
      onClick={liquidar}
    >
      Liquidar
    </Button>
  )
}
