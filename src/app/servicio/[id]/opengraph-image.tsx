import { headers } from 'next/headers'
import { ImageResponse } from 'next/og'
import { getPublicService, type PublicService } from './data'
import { ogCardResponse } from '@/lib/og-card'
import { esBannerValido } from '@/lib/storage/banner-url'
import { formatTravelDate, mxnEntero } from '@/components/data/format'

// Preview social de la ficha de servicio. Antes el og:image dependía de que el
// servicio tuviera banner (generateMetadata) → sin banner no había preview al
// compartir por WhatsApp. Ahora SIEMPRE hay imagen: el banner tal cual si
// existe, o la tarjeta de marca compuesta si no.
//
// Con banner el content-type real es el del archivo en Storage (jpeg/png/webp),
// no siempre el declarado abajo — `contentType` aquí es solo el hint estático
// del <meta og:image:type>; los crawlers de verdad leen el header real de la
// respuesta, no este export (por eso no hace falta volverlo dinámico).
//
// Estilos inline a propósito: next/og (Satori) NO soporta clases de Tailwind;
// solo un subconjunto de CSS vía `style`. Es el mismo patrón de todos los OG
// del repo (lib/og-card.tsx y los opengraph-image de cotización/estado/recibo).
export const alt = 'Viaje — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const clamp = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

function destino(s: PublicService): string | null {
  const partes = [s.city_to, s.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : s.location
}

// Línea que vende: próxima salida + lugares (datos de la BD). Sin salida
// futura, el inicio de la descripción como antes.
function lineaVenta(s: PublicService): string | undefined {
  const d = s.departures?.[0]
  if (d) {
    return `Próxima salida ${formatTravelDate(d.departs_on)} · ${d.free > 0 ? `${d.free} lugares disponibles` : 'agotado'}`
  }
  return s.description ? clamp(s.description.replace(/\s+/g, ' '), 66) : undefined
}

// El banner solo se usa si es una URL pública de nuestro Storage: next/og lo
// fetchea server-side, así que restringir host+prefijo (no solo "es http(s)")
// evita un SSRF a destinos no confiables además de la imagen rota. Ante
// cualquier duda, se cae a la tarjeta de marca (defensa en profundidad: la
// escritura ya se valida igual en setServicioImagen).
function validBannerUrl(raw: string | undefined): string | null {
  return esBannerValido(raw) ? raw! : null
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const s = await getPublicService(id)

  // uuid inválido / no publicado: tarjeta de marca (nunca imagen rota).
  if (!s) {
    return ogCardResponse({
      eyebrow: 'Viaje',
      agency: 'Ketzal',
      title: 'Viaje no disponible',
      figure: '—',
      figureLabel: 'Ketzal',
    })
  }

  const lugar = destino(s)
  const precio = s.price != null ? mxnEntero.format(Number(s.price)) : 'Consultar'
  const banner = validBannerUrl(s.images?.imgBanner)

  // Sin banner válido: tarjeta de marca (mismo lenguaje que cotización/estado/
  // recibo) con los datos del viaje.
  if (!banner) {
    return ogCardResponse({
      eyebrow: lugar ? `Viaje · ${lugar}` : 'Viaje',
      agency: s.agency.name,
      title: s.name,
      subtitle: lineaVenta(s),
      figure: precio,
      figureLabel: 'Desde',
    })
  }

  // Con banner: se sirve la foto pasada por el optimizador de Next
  // (/_next/image), NO tal cual la subió la agencia ni compuesta con Satori.
  // Dos problemas reales, encontrados en vivo:
  // (a) next/og no soporta salida JPEG/con calidad — una foto compuesta ahí
  //     sale como PNG sin pérdida de ~2 MB en 2-4s.
  // (b) el archivo tal cual subido puede pesar varios MB (foto de celular sin
  //     comprimir) — servirlo "directo" también truena el crawler.
  // En ambos casos WhatsApp cachea "sin imagen" para siempre. El optimizador
  // redimensiona a 1200px y recomprime (~vía sharp en Vercel) sin depender de
  // una librería nueva — ya viene con Next.
  try {
    const h = await headers()
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`
    const optimizado = await fetch(
      `${origin}/_next/image?url=${encodeURIComponent(banner)}&w=1200&q=75`
    )
    if (optimizado.ok) {
      return new Response(optimizado.body, {
        headers: {
          'Content-Type': optimizado.headers.get('content-type') ?? 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      })
    }
    // Optimizador no disponible: mejor la foto pesada que nada.
    const foto = await fetch(banner)
    if (foto.ok) {
      return new Response(foto.body, {
        headers: {
          'Content-Type': foto.headers.get('content-type') ?? 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      })
    }
  } catch {
    /* cae a la tarjeta compuesta abajo */
  }

  // Fallback si el fetch del banner falla: la composición de siempre.
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={banner}
          width={1200}
          height={630}
          style={{ width: 1200, height: 630, objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 64,
            color: '#ffffff',
            background:
              'linear-gradient(to top, rgba(4,20,15,0.88) 0%, rgba(4,20,15,0.35) 48%, rgba(4,20,15,0) 100%)',
            fontFamily: 'sans-serif',
          }}
        >
          {lugar ? (
            <span
              style={{
                fontSize: 26,
                letterSpacing: 5,
                textTransform: 'uppercase',
                color: '#3DDE1C',
                marginBottom: 12,
              }}
            >
              {clamp(lugar, 40)}
            </span>
          ) : null}
          <span style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05 }}>
            {clamp(s.name, 42)}
          </span>
          {lineaVenta(s) ? (
            <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', marginTop: 10 }}>
              {lineaVenta(s)}
            </span>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginTop: 22,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.82)' }}>
                {clamp(s.agency.name, 30)}
              </span>
              <span style={{ fontSize: 40, fontWeight: 700 }}>
                Desde {precio}
              </span>
            </div>
            <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.72)' }}>
              Powered by Ketzal
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
