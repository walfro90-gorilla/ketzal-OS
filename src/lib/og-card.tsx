import { ImageResponse } from 'next/og'

// Tarjeta social 1200×630 para previews ricos al compartir links públicos por
// WhatsApp / Telegram / Twitter. Generada con next/og (Satori) — sin assets
// binarios ni dependencias. Reusa la marca (quetzal) de brand-icon.tsx.
//
// ponytail: usa la fuente por defecto de next/og (sin pesos variables). Si se
// quiere tipografía más fina, embeber una fuente vía `fonts:` es el upgrade.

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

export function ogCardResponse(c: OgCard) {
  const accent = c.accent ?? '#3DDE1C' // verde hoja de marca
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
          <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>
            Powered by Ketzal
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
