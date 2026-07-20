import { ImageResponse } from 'next/og'
import { getBrandLogo } from '@/lib/brand'

// Tarjeta social 1200×630 para previews ricos al compartir links públicos por
// WhatsApp / Telegram / Twitter. Generada con next/og (Satori) — sin assets
// binarios ni dependencias. Reusa la marca (quetzal) de brand-icon.tsx.
//
// El pie muestra el logo oficial (wordmark) en una pastilla blanca —para que
// contraste sobre el fondo teal— si está configurado; si no se puede cargar,
// cae al texto "Powered by Ketzal". Satori exige dimensiones explícitas en
// <img>, así que se leen del header PNG (el logo se sube como PNG).

/** Carga el logo como data-URI + dimensiones (solo PNG raster; Satori no hace
 *  bien SVG). Devuelve null ante cualquier problema → el pie cae al texto. */
async function cargarLogo(): Promise<{ src: string; w: number; h: number } | null> {
  let url: string | null = null
  try {
    url = await getBrandLogo()
  } catch {
    return null
  }
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/') || ct.includes('svg')) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // Dimensiones del IHDR del PNG (bytes 16-24).
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
    const dv = new DataView(buf)
    const w = dv.getUint32(16)
    const h = dv.getUint32(20)
    if (!w || !h) return null
    const b64 = Buffer.from(buf).toString('base64')
    return { src: `data:${ct};base64,${b64}`, w, h }
  } catch {
    return null
  }
}

type OgCard = {
  eyebrow: string // "Cotización de viaje" — kicker en mayúsculas
  agency: string // nombre de la agencia (marca del documento)
  title: string // servicio / concepto — la línea grande
  subtitle?: string // "Para Juan · 4 pax · 30 jul 2026"
  figure: string // "$12,400 MXN" — la cifra focal
  figureLabel: string // "Total" / "Saldo" / "Monto recibido"
  accent?: string // color de acento (verde hoja por defecto)
}

// Satori no recorta texto por sí solo: acotamos longitudes para que nada
// desborde la tarjeta con nombres/servicios largos.
const clamp = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

export async function ogCardResponse(c: OgCard) {
  const accent = c.accent ?? '#3DDE1C' // verde hoja de marca
  const logo = await cargarLogo()
  const logoH = 40
  const logoW = logo ? Math.round(logoH * (logo.w / logo.h)) : 0
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background:
            'linear-gradient(135deg, #064e3b 0%, #0f766e 55%, #009e7e 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Encabezado: identidad de la agencia + marca Ketzal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span
              style={{
                fontSize: 26,
                letterSpacing: 6,
                textTransform: 'uppercase',
                color: accent,
              }}
            >
              {clamp(c.eyebrow, 40)}
            </span>
            <span style={{ fontSize: 52, fontWeight: 700 }}>
              {clamp(c.agency, 30)}
            </span>
          </div>
          <svg width={96} height={96} viewBox="0 0 100 100" fill="none">
            <path
              d="M50 6 C76 26 76 68 50 94 C24 68 24 26 50 6 Z"
              fill="#ffffff"
            />
            <path
              d="M50 22 L50 84"
              stroke="#0f766e"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M50 40 L66 31 M50 54 L67 46 M50 40 L34 31 M50 54 L33 46"
              stroke="#0f766e"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Cuerpo: título del documento + subtítulo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>
            {clamp(c.title, 44)}
          </span>
          {c.subtitle ? (
            <span style={{ fontSize: 32, color: 'rgba(255,255,255,0.82)' }}>
              {clamp(c.subtitle, 66)}
            </span>
          ) : null}
        </div>

        {/* Pie: cifra focal + firma de marca */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontSize: 24,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              {c.figureLabel}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 8,
                  height: 58,
                  borderRadius: 4,
                  background: accent,
                  display: 'flex',
                }}
              />
              <span style={{ fontSize: 74, fontWeight: 700 }}>{c.figure}</span>
            </div>
          </div>
          {logo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)' }}>
                Powered by
              </span>
              {/* Pastilla blanca: garantiza contraste del wordmark sobre el teal. */}
              <div
                style={{
                  display: 'flex',
                  background: '#ffffff',
                  borderRadius: 12,
                  padding: '12px 18px',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.src}
                  width={logoW}
                  height={logoH}
                  style={{ objectFit: 'contain' }}
                />
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>
              Powered by Ketzal
            </span>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
