import Link from 'next/link'
import type { CancellationPolicy } from '@/lib/public/doc-policy'

// Resumen legible de una política de cancelación (C2). Recibe el jsonb tal
// cual (snapshot congelado de la venta o la vigente) y lo vuelve texto: se
// genera desde los DATOS, no hardcodea los números — si una agencia tiene
// override, el cliente ve SU política. Server component, sin estado.

function rangoLabel(desde: number, hasta: number | null): string {
  if (hasta == null) return `${desde} días o más antes`
  if (desde === hasta) return desde === 1 ? '1 día antes' : `${desde} días antes`
  return `Entre ${desde} y ${hasta} días antes`
}

export function PoliticaResumen({ policy }: { policy: CancellationPolicy }) {
  const tramos = [...(policy.tramos ?? [])].sort((a, b) => b.dias_min - a.dias_min)
  const noShow = policy.no_show_pct ?? 100
  const credito = policy.credito?.pct ?? 100
  const vigencia = policy.credito?.vigencia_meses ?? 12
  const cambio = policy.cambio_fecha

  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">
          Antes de pedir devolución, considera el crédito:
        </span>{' '}
        al cancelar puedes optar por el {credito}% de lo pagado como crédito para
        otro viaje de la misma agencia, válido {vigencia} meses, sin penalización.
      </p>
      {tramos.length > 0 && (
        <div>
          <p className="font-medium text-foreground">
            Si prefieres devolución en efectivo, se retiene según la anticipación:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {tramos.map((t, i) => (
              <li key={t.dias_min}>
                {rangoLabel(t.dias_min, i === 0 ? null : tramos[i - 1].dias_min - 1)}:
                se retiene {t.retencion_pct}%
              </li>
            ))}
            <li>
              Menos de {tramos[tramos.length - 1].dias_min}{' '}
              {tramos[tramos.length - 1].dias_min === 1 ? 'día' : 'días'} o no
              presentarse: se retiene {noShow}%
            </li>
          </ul>
        </div>
      )}
      {policy.piso_enganche && (
        <p>El anticipo/enganche aparta tu lugar y es la retención mínima.</p>
      )}
      {cambio?.gratis_primero && (
        <p>
          Primer cambio de fecha gratis avisando con al menos{' '}
          {cambio.aviso_min_dias ?? 20} días.
        </p>
      )}
      <p>
        <Link
          href="/politica-cancelacion"
          className="underline underline-offset-2 hover:text-foreground"
          target="_blank"
        >
          Ver la política de cancelación completa
        </Link>
      </p>
    </div>
  )
}
