import Image from 'next/image'
import { StarIcon } from 'lucide-react'
import { listPublicSuppliers, type PublicSupplierCard } from '@/app/agencias/data'
import { cn } from '@/lib/utils'

// Franja de agencias reales de la home. Lee el MISMO RPC anónimo que el
// directorio público (`list_public_suppliers`, SECURITY DEFINER, solo agencias
// con al menos un servicio publicado), así que nunca presume una agencia que
// el marketplace no muestre. Server component: cero JavaScript en el cliente.
//
// El desfile es CSS: la lista se pinta dos veces y `animate-desfile` la corre
// media vuelta en bucle sin costura. Se pausa al pasar el mouse y
// `prefers-reduced-motion` lo detiene por la regla global de globals.css.

/** Estrellas SOLO si hay reseñas: sin ellas se pintaría una calificación falsa. */
function Estrellas({ avg, count }: { avg: number; count: number }) {
  return (
    <p className="flex items-center gap-1 text-small" aria-label={`${avg} de 5 estrellas, ${count} reseñas`}>
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon
            key={n}
            className={cn('size-3.5', n <= Math.round(avg) ? 'fill-jade-500 text-jade-500' : 'text-mid/30')}
          />
        ))}
      </span>
      <span className="tabular-nums text-mid">
        {avg.toFixed(1)} <span className="text-caption">({count})</span>
      </span>
    </p>
  )
}

function Tarjeta({ a, copia = false }: { a: PublicSupplierCard; copia?: boolean }) {
  return (
    <li
      // La segunda vuelta es la MISMA lista repetida para cerrar el bucle: se
      // oculta a lectores de pantalla para no dictar cada agencia dos veces.
      aria-hidden={copia || undefined}
      className="flex w-[19rem] shrink-0 items-center gap-4 rounded-panel border border-hairline bg-surface-1 p-4"
    >
      {a.logo ? (
        <Image
          src={a.logo}
          alt={`Logo de ${a.name}`}
          width={56}
          height={56}
          quality={85}
          sizes="56px"
          className="size-14 shrink-0 rounded-card bg-white object-contain p-1"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-card border border-hairline font-display text-subheading text-jade-600"
        >
          {a.name.charAt(0)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{a.name}</p>
        {a.city_zone && <p className="truncate text-small text-mid">{a.city_zone}</p>}
        {/* Con reseñas, las estrellas. Sin ellas, el dato que SÍ existe. */}
        {a.rating.count > 0 ? (
          <Estrellas avg={a.rating.avg} count={a.rating.count} />
        ) : (
          <p className="truncate text-small text-mid">
            {a.active_trips === 1 ? '1 viaje publicado' : `${a.active_trips} viajes publicados`}
            {a.specialties.length > 0 && ` · ${a.specialties[0]}`}
          </p>
        )}
      </div>
    </li>
  )
}

export async function Credibilidad() {
  const agencias = await listPublicSuppliers()
  if (agencias.length === 0) return null

  // El bucle sin costura exige que UNA vuelta sea más ancha que la pantalla:
  // con dos agencias (2 × 19rem = 38rem) no lo es y al girar quedaba un hueco.
  // Se repite la lista hasta juntar al menos 6 tarjetas por vuelta.
  const porVuelta = Array.from(
    { length: Math.ceil(6 / agencias.length) },
    () => agencias,
  ).flat()
  // 6 segundos por tarjeta: legible con pocas, sin eternizarse con muchas.
  const duracion = `${porVuelta.length * 6}s`

  return (
    <section aria-labelledby="credibilidad" className="border-y border-hairline">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 id="credibilidad" className="text-small text-mid">
          Agencias que ya están en Ketzal
        </h2>
      </div>
      <div
        className="group relative overflow-hidden pb-10"
        style={{ '--desfile-duracion': duracion } as React.CSSProperties}
      >
        {/* Degradados en los extremos: las tarjetas entran y salen sin cortarse en seco. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-canvas to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-canvas to-transparent" />
        <ul className="animate-desfile flex w-max gap-4 group-hover:[animation-play-state:paused]">
          {porVuelta.map((a, i) => (
            <Tarjeta key={`v1-${i}`} a={a} copia={i >= agencias.length} />
          ))}
          {/* Segunda vuelta idéntica: al llegar a -50% el bucle reinicia sin salto. */}
          {porVuelta.map((a, i) => (
            <Tarjeta key={`v2-${i}`} a={a} copia />
          ))}
        </ul>
      </div>
    </section>
  )
}
