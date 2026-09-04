import { cn } from '@/lib/utils'

// Hueco reservado para una foto que todavía no existe (la del fundador).
// No es un placeholder decorativo: dice QUÉ va aquí y reserva la caja exacta,
// así el layout no salta cuando llegue el archivo (CLS) y quien lo lea sabe
// qué falta. Se sustituye por <Image> el día que la foto entre al repo.
// ponytail: cuando llegue la foto, este componente se borra completo.
export function HuecoFoto({
  descripcion,
  className,
  ratio = 'aspect-[4/5]',
}: {
  /** Qué imagen va aquí, en una frase. Se lee en pantalla, no es un comentario. */
  descripcion: string
  className?: string
  ratio?: string
}) {
  return (
    <div
      role="img"
      aria-label={`Espacio reservado: ${descripcion}`}
      className={cn(
        ratio,
        'flex items-end rounded-panel border border-dashed border-hairline-strong bg-surface-1 p-5',
        className,
      )}
    >
      <p className="text-caption text-mid">{descripcion}</p>
    </div>
  )
}
