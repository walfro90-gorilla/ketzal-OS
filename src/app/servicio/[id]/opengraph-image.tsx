import { ImageResponse } from 'next/og'
import { getPublicService, type PublicService } from './data'
import { ogCardResponse } from '@/lib/og-card'
import { esBannerValido } from '@/lib/storage/banner-url'

// Preview social de la ficha de servicio. Antes el og:image dependía de que el
// servicio tuviera banner (generateMetadata) → sin banner no había preview al
// compartir por WhatsApp. Ahora SIEMPRE hay imagen: la foto del banner a sangre
// (con scrim + datos del viaje) si existe, o la tarjeta de marca si no.
//
// Estilos inline a propósito: next/og (Satori) NO soporta clases de Tailwind;
// solo un subconjunto de CSS vía `style`. Es el mismo patrón de todos los OG
// del repo (lib/og-card.tsx y los opengraph-image de cotización/estado/recibo).
export const alt = 'Viaje — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

const clamp = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

function destino(s: PublicService): string | null {
  const partes = [s.city_to, s.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : s.location
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
  const precio = s.price != null ? mxn.format(Number(s.price)) : 'Consultar'
  const banner = validBannerUrl(s.images?.imgBanner)

  // Sin banner válido: tarjeta de marca (mismo lenguaje que cotización/estado/
  // recibo) con los datos del viaje.
  if (!banner) {
    return ogCardResponse({
      eyebrow: lugar ? `Viaje · ${lugar}` : 'Viaje',
      agency: s.agency.name,
      title: s.name,
      subtitle: s.description ? clamp(s.description, 66) : undefined,
      figure: precio,
      figureLabel: 'Desde',
    })
  }

  // Con banner: la foto del viaje a sangre + scrim inferior con nombre, destino,
  // agencia, precio y firma de marca. La foto vende más que un card de texto.
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
