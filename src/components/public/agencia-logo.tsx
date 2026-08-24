import { cn } from '@/lib/utils'

// Logo de la agencia con caída a su inicial. Estaba copiado en el directorio y
// en el perfil; la ficha necesitaba una tercera medida (mini, junto a "Ofrecido
// por"), así que vive en un solo lugar.
//
// `object-contain` y no `cover`: un logo recortado deja de ser el logo.
//
// Es un <span> con inline-flex, no un <div>: en la ficha va DENTRO del párrafo
// "Ofrecido por", y un <div> ahí es HTML inválido — React lo convierte en error
// de hidratación y vuelve a renderizar el árbol en el cliente. El build no lo
// detecta; sólo se ve abriendo la página.

const TAMANOS = {
  mini: { caja: 'size-6 rounded-md', pad: 'p-0.5', letra: 'text-[0.65rem]' },
  md: { caja: 'size-16 rounded-xl', pad: 'p-1.5', letra: 'text-xl' },
  lg: { caja: 'size-20 rounded-2xl', pad: 'p-2', letra: 'text-2xl' },
} as const

export function AgenciaLogo({
  url,
  nombre,
  tamano = 'md',
  className,
}: {
  url: string | null
  nombre: string
  tamano?: keyof typeof TAMANOS
  className?: string
}) {
  const t = TAMANOS[tamano]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border bg-muted/40',
        t.caja,
        className
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={nombre}
          className={cn('max-h-full max-w-full object-contain', t.pad)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={cn('font-bold text-muted-foreground', t.letra)} aria-hidden>
          {nombre.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
