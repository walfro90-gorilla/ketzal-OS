import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

/**
 * Firma de plataforma para el pie de los documentos compartibles (recibo,
 * cotización, estado). El documento es de la AGENCIA (su logo va arriba); esto
 * es solo la co-marca "Powered by Ketzal": el logo oficial configurado (o el
 * SVG por defecto si no hay) + el texto. Hereda el tamaño de fuente del `<p>`
 * contenedor de cada documento.
 */
export function PoweredByKetzal({
  logoUrl,
  className,
}: {
  logoUrl: string | null
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center justify-center gap-1.5', className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="inline-block h-5 w-auto max-w-[120px] object-contain align-middle"
        />
      ) : (
        <BrandMark className="size-5 text-primary" />
      )}
      <span>Powered by Ketzal</span>
    </span>
  )
}
