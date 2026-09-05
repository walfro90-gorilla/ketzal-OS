import Link from 'next/link'
import { MAPA_ALTO, MAPA_ANCHO, MEXICO_PATH, proyectar } from '@/lib/marketing/mapa-mexico'

// ADR-0054: mapa de destinos. SVG puro renderizado en el servidor — sin
// librería de mapas, sin lienzo, sin JavaScript. Cada punto es un enlace real,
// así que el mapa se navega con teclado, lo lee un lector de pantalla y lo
// rastrea un buscador; un `<canvas>` no hace nada de eso.
//
// Lo que no cae dentro de México no se fuerza: se lista aparte. El catálogo
// tiene Medellín, y meterlo con calzador en un mapa de México sería mentir.

export type PuntoDestino = {
  slug: string
  nombre: string
  pais: string
  lat: number | null
  lng: number | null
  /** Cuántos viajes publicados tiene; los que no tienen no se pintan. */
  viajes: number
}

export function MapaDestinos({ destinos }: { destinos: PuntoDestino[] }) {
  const conViajes = destinos.filter((d) => d.viajes > 0)

  const dentro = conViajes
    .map((d) => {
      const p = d.lat != null && d.lng != null ? proyectar(d.lat, d.lng) : null
      return p ? { ...d, ...p } : null
    })
    .filter((d): d is PuntoDestino & { x: number; y: number } => d !== null)

  const fuera = conViajes.filter(
    (d) => !dentro.some((x) => x.slug === d.slug)
  )

  if (dentro.length === 0 && fuera.length === 0) return null

  return (
    <section aria-labelledby="mapa-titulo" className="space-y-4">
      <h2 id="mapa-titulo" className="sr-only">
        Mapa de destinos
      </h2>

      {dentro.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-muted/30 p-2 sm:p-4">
          {/* Ancho tope: la relación del trazo es ~1.53, así que limitando el
              ancho la altura queda acotada sin deformar ni recortar. Sin esto
              el mapa empuja las tarjetas fuera de la primera pantalla. */}
          <svg
            viewBox={`0 0 ${MAPA_ANCHO} ${MAPA_ALTO}`}
            className="mx-auto block h-auto w-full max-w-[640px]"
            role="img"
            aria-label={`Mapa de México con ${dentro.length} destinos`}
          >
            <title>Destinos en México</title>
            <path
              d={MEXICO_PATH}
              className="fill-primary/10 stroke-primary/40"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {dentro.map((d) => (
              <Link key={d.slug} href={`/viajes/${d.slug}`}>
                <g className="group">
                  {/* Área de toque generosa e invisible: un círculo de 8px es
                      imposible de atinar con el dedo en un teléfono. */}
                  <circle cx={d.x} cy={d.y} r={26} fill="transparent" />
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={9}
                    className="fill-primary transition-all group-hover:r-[12]"
                  />
                  <circle cx={d.x} cy={d.y} r={16} className="fill-primary/25" />
                  <text
                    x={d.x}
                    y={d.y - 24}
                    textAnchor="middle"
                    className="fill-foreground text-[26px] font-semibold"
                    style={{ paintOrder: 'stroke' }}
                    stroke="var(--color-background)"
                    strokeWidth={6}
                  >
                    {d.nombre}
                  </text>
                </g>
              </Link>
            ))}
          </svg>
        </div>
      )}

      {fuera.length > 0 && (
        <div className="rounded-2xl border border-dashed p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Fuera de México
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {fuera.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/viajes/${d.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="font-medium">{d.nombre}</span>
                  <span className="text-muted-foreground">{d.pais}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
