import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { verificarCert } from '@/lib/voucher-cert'
import { PageHeader } from '@/components/data/page-header'
import { PanelAbordaje, type PaxAbordaje } from './panel'

// b043: panel de check-in de un voucher escaneado. Guard staff-only en el RPC
// boarding_info (comprador/agencia ajena: error ⇒ pantalla de sin acceso).
// El ?c del QR se verifica server-side (certificado digital b042).

type BoardingInfo = {
  booking_id: string
  folio: number
  estado: string
  fecha_viaje: string | null
  num_pax: number | null
  cliente: string | null
  servicio: string | null
  pasajeros: PaxAbordaje[]
}

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

export default async function AbordajeVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ voucherId: string }>
  searchParams: Promise<{ c?: string | string[] }>
}) {
  const { voucherId } = await params
  const { c } = await searchParams

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('boarding_info' as never, {
    p_voucher_id: voucherId,
  } as never)
  const info = (data as unknown as BoardingInfo) ?? null
  const verificado = verificarCert(voucherId, c)

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <Link
        href="/abordaje"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Escanear otro
      </Link>

      {error || !info ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">
            Voucher no válido o sin acceso
          </p>
          <p className="mt-1 text-muted-foreground">
            El voucher no existe, la venta está cancelada, o no pertenece a tu
            agencia.
          </p>
        </div>
      ) : (
        <>
          <PageHeader
            title={`Voucher #${String(info.folio).padStart(4, '0')}`}
            description={[
              info.servicio,
              info.cliente,
              info.fecha_viaje
                ? fecha.format(new Date(`${info.fecha_viaje}T12:00:00`))
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />

          {/* Certificado digital del QR (b042). */}
          {verificado != null && (
            <div
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                verificado
                  ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-red-300 bg-red-500/10 text-red-700 dark:text-red-400'
              }`}
            >
              {verificado
                ? '✓ Certificado digital verificado — voucher auténtico.'
                : '⚠ Certificado inválido — NO permitas el abordaje sin confirmar con la agencia.'}
            </div>
          )}
          {verificado == null && (
            <p className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              Abierto sin certificado (entrada manual). El voucher existe y es
              de tu agencia; para verificar autenticidad escanea el QR impreso.
            </p>
          )}

          {/* Venta con saldo: abordar es decisión de la agencia — se avisa. */}
          {info.estado === 'reserved' && (
            <p className="rounded-lg border border-amber-300 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
              Esta venta está apartada (tiene saldo pendiente).
            </p>
          )}

          <PanelAbordaje voucherId={voucherId} pasajeros={info.pasajeros ?? []} />
        </>
      )}
    </div>
  )
}
