import { ImageResponse } from 'next/og'

// Mark de marca de Ketzal, generado con next/og (sin dependencias ni assets binarios).
// Placeholder intencional: una hoja/pluma (guiño al quetzal) sobre degradado esmeralda.
// Swappable por el logo real cuando exista, sin tocar rutas ni manifest.
export function brandIconResponse(size: number, opts?: { maskable?: boolean }) {
  const maskable = opts?.maskable ?? false
  // Los íconos maskable se recortan; van a sangre y con el símbolo en la zona segura central.
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const mark = Math.round(size * (maskable ? 0.5 : 0.58))

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius,
          background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 100 100" fill="none">
          <path
            d="M50 6 C76 26 76 68 50 94 C24 68 24 26 50 6 Z"
            fill="#ffffff"
          />
          <path
            d="M50 22 L50 84"
            stroke="#0d9488"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M50 40 L66 31 M50 54 L67 46 M50 40 L34 31 M50 54 L33 46"
            stroke="#0d9488"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
