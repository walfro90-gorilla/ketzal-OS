import type { Metadata } from 'next'
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react'
import { inter } from '@/components/marketing/fonts'
import { CTA_PRIMARIO, CTA_SECUNDARIO, ENLACE } from '@/components/marketing/cta'
import { contraste, veredicto } from '@/lib/contraste'
import { cn } from '@/lib/utils'

// Referencia interna de la paleta de la home (ADR-0046). Protegida por el
// proxy (no está en `isPublic`): cualquier cuenta con sesión la ve; nadie la
// indexa. Server component sin cliente: los ratios se MIDEN en el render con
// `lib/contraste`, así la página es la prueba y no una tabla copiada.
export const metadata: Metadata = {
  title: 'Styleguide — Ketzal',
  robots: { index: false, follow: false },
}

const CANVAS = '#081512'
const BLANCO = '#FFFFFF'

const JADE = [
  ['50', '#F1FBF9'],
  ['100', '#DEF7F2'],
  ['200', '#BDF2E7'],
  ['300', '#98E1D2'],
  ['400', '#62DAC1'],
  ['500', '#24DBB4'],
  ['600', '#00C89D'],
  ['700', '#009F7D'],
  ['800', '#027B61'],
  ['900', '#035E4B'],
  ['950', '#033329'],
] as const

const NEUTROS = [
  ['canvas', '#081512', 'fondo de página (= theme-color dark)'],
  ['surface-1', '#0D1F1A', 'cards y paneles'],
  ['surface-2', '#122923', 'segundo nivel (código, inputs)'],
  ['hi', '#E6EDEA', 'texto principal'],
  ['mid', '#9BADA7', 'texto secundario'],
  ['low', '#6B7F79', 'terciario SOLO ≥18px (4.02 sobre surface-1: falla AA en chico)'],
] as const

const ACENTOS = [
  ['signal', '#05AE51', 'solo fill con texto negro o canvas'],
  ['alert', '#DC0419', 'solo saldo vencido; nunca <18px ni decorativo'],
] as const

// Pares que la home va a usar de verdad. Cada fila se mide al renderizar.
const PARES: [string, string, string, string][] = [
  ['texto hi', '#E6EDEA', CANVAS, 'párrafos'],
  ['texto mid', '#9BADA7', CANVAS, 'párrafos secundarios'],
  ['texto low', '#6B7F79', CANVAS, 'solo ≥18px'],
  ['jade-600', '#00C89D', CANVAS, 'acento, links, dato clave'],
  ['jade-700', '#009F7D', CANVAS, 'marca'],
  ['canvas sobre jade-600', CANVAS, '#00C89D', 'CTA primario'],
  ['negro sobre signal', '#000000', '#05AE51', 'fill signal'],
  ['canvas sobre signal', CANVAS, '#05AE51', 'fill signal (alternativa)'],
  ['alert', '#DC0419', CANVAS, 'saldo vencido ≥18px o icono'],
  ['jade-700 sobre blanco', '#009F7D', BLANCO, 'NO usar en texto normal'],
  ['jade-800 sobre blanco', '#027B61', BLANCO, 'texto jade en fondo claro'],
]

const ESCALA = [
  ['display-xl', 'text-display-xl font-display', '61 / 1.02 / -0.03em · Bricolage 700'],
  ['display-lg', 'text-display-lg font-display', '49 / 1.05 / -0.03em · Bricolage 700'],
  ['display-md', 'text-display-md font-display', '39 / 1.10 / -0.02em · Bricolage 700'],
  ['heading', 'text-heading font-display', '31 / 1.15 / -0.02em · Bricolage 600'],
  ['subheading', 'text-subheading', '25 / 1.25 / -0.01em · Inter 600'],
  ['lead', 'text-lead', '20 / 1.45 · Inter 400'],
  ['body', 'text-body', '16 / 1.55 · Inter 400'],
  ['small', 'text-small', '14 / 1.5 · Inter 400'],
  ['caption', 'text-caption', '12 / 1.4 / 0.01em · Inter 500'],
] as const

export default function Styleguide() {
  return (
    <div className={cn(inter.variable, 'font-body scheme-dark min-h-screen bg-canvas text-hi')}>
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-8">
        <header className="border-b border-hairline pb-8">
          <h1 className="font-display text-display-md">Styleguide de la home</h1>
          <p className="mt-3 max-w-[65ch] text-lead text-mid">
            Tokens aditivos de <code className="rounded-card bg-surface-2 px-1.5 py-0.5 text-small">globals.css</code>.
            Ningún token del OS cambia. Los ratios de esta página se calculan al renderizar.
          </p>
        </header>

        {/* ---------------- COLOR ---------------- */}
        <Seccion titulo="Color" nota="El verde ocupa CTA, marca, focus y un dato por sección. Lo demás es neutro.">
          <h3 className="text-subheading">Jade</h3>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {JADE.map(([paso, hex]) => (
              <li key={paso} className="rounded-card border border-hairline bg-surface-1 p-2">
                <div className="h-14 rounded-card" style={{ backgroundColor: hex }} />
                <p className="mt-2 flex items-baseline justify-between text-small">
                  <span className={paso === '700' ? 'font-semibold text-jade-600' : ''}>jade-{paso}</span>
                  <code className="text-caption text-low">{hex}</code>
                </p>
                <p className="text-caption text-low tabular-nums">
                  {contraste(hex, CANVAS)} canvas · {contraste(hex, BLANCO)} blanco
                </p>
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-subheading">Neutros</h3>
          <Swatches filas={NEUTROS} />

          <h3 className="mt-10 text-subheading">Acentos</h3>
          <Swatches filas={ACENTOS} />
        </Seccion>

        {/* ---------------- TIPOGRAFÍA ---------------- */}
        <Seccion
          titulo="Tipografía"
          nota="Bricolage Grotesque en display y heading; Inter (cv01, ss03) en el resto. Tracking negativo solo en display y heading. Párrafos a 65ch."
        >
          <ul className="space-y-8">
            {ESCALA.map(([nombre, clase, ficha]) => (
              <li key={nombre} className="grid gap-2 border-b border-hairline pb-6 sm:grid-cols-[10rem_1fr]">
                <div className="text-caption text-low">
                  <p className="text-small text-mid">{nombre}</p>
                  <p className="mt-1">{ficha}</p>
                </div>
                <p className={cn(clase, 'max-w-[65ch] break-words text-balance')}>
                  Añade la salida a Chihuahua: 14 pasajeros, $9,600 abonados.
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-lead tabular-nums">
            1234567890 · Ilegal · ¿Cuánto debe María? · Ñandú · a r g
            <span className="ml-3 text-small text-low">← el 1 con base y la a redondeada confirman cv01/ss03</span>
          </p>
        </Seccion>

        {/* ---------------- ESPACIADO Y RADIOS ---------------- */}
        <Seccion
          titulo="Espaciado, radios, elevación"
          nota="Grid de 8 px. Secciones a 96 / 160 px. Elevación por hairline de 1 px, sin sombras."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Radio nombre="card" clase="rounded-card" uso="cards e inputs · 8 px" />
            <Radio nombre="panel" clase="rounded-panel" uso="contenedores grandes · 12 px" />
            <Radio nombre="pill" clase="rounded-pill" uso="SOLO el CTA primario" />
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-3 text-caption text-low">
            {[8, 16, 24, 32, 48, 64, 96].map((px) => (
              <div key={px} className="flex flex-col items-center gap-1">
                <div className="w-3 bg-jade-700" style={{ height: px }} />
                <span className="tabular-nums">{px}</span>
              </div>
            ))}
            <span className="ml-2 pb-4">px · múltiplos de 8</span>
          </div>
        </Seccion>

        {/* ---------------- COMPONENTES ---------------- */}
        <Seccion titulo="Componentes" nota="Un CTA primario por vista. Estados siempre con icono o etiqueta además del color.">
          <div className="flex flex-wrap items-center gap-3">
            <a href="#" className={CTA_PRIMARIO}>
              Escríbenos por WhatsApp
            </a>
            <a href="#" className={CTA_SECUNDARIO}>
              Entrar a mi agencia
            </a>
            <a href="#" className={ENLACE}>
              Entrar
            </a>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-panel border border-hairline bg-surface-1 p-6">
              <p className="text-small text-mid">Huasteca Potosina en Avión</p>
              <p className="mt-1 font-display text-heading">$7,999</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-card bg-signal px-2.5 py-1 text-small font-semibold text-black">
                <CheckCircle2Icon className="size-4" aria-hidden />
                Al corriente
              </p>
            </div>
            <div className="rounded-panel border border-hairline bg-surface-1 p-6">
              <p className="text-small text-mid">Saldo pendiente</p>
              <p className="mt-1 font-display text-heading">$6,400</p>
              <p className="mt-4 inline-flex items-center gap-2 text-lead font-semibold text-alert">
                <AlertCircleIcon className="size-5" aria-hidden />
                Vencido hace 3 días
              </p>
            </div>
          </div>
        </Seccion>

        {/* ---------------- CONTRASTE ---------------- */}
        <Seccion titulo="Contraste (medido)" nota="WCAG 2.1: AAA ≥ 7 · AA ≥ 4.5 · AA grande ≥ 3 (solo ≥18px o UI).">
          <div className="overflow-x-auto rounded-panel border border-hairline">
            <table className="w-full text-small">
              <thead className="bg-surface-1 text-left text-caption text-mid">
                <tr>
                  <th className="px-4 py-3 font-medium">Par</th>
                  <th className="px-4 py-3 font-medium">Muestra</th>
                  <th className="px-4 py-3 font-medium">Ratio</th>
                  <th className="px-4 py-3 font-medium">Veredicto</th>
                  <th className="px-4 py-3 font-medium">Uso</th>
                </tr>
              </thead>
              <tbody>
                {PARES.map(([nombre, fg, bg, uso]) => {
                  const r = contraste(fg, bg)
                  const v = veredicto(r)
                  return (
                    <tr key={nombre} className="border-t border-hairline">
                      <td className="px-4 py-3">{nombre}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block rounded-card border border-hairline px-2 py-0.5 text-small font-semibold"
                          style={{ color: fg, backgroundColor: bg }}
                        >
                          Abc 123
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.toFixed(2)}:1</td>
                      <td className={cn('px-4 py-3 font-semibold', v === 'falla' && 'text-alert', v === 'AAA' && 'text-jade-600')}>
                        {v}
                      </td>
                      <td className="px-4 py-3 text-mid">{uso}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Seccion>
      </div>
    </div>
  )
}

function Seccion({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline py-12">
      <h2 className="font-display text-heading">{titulo}</h2>
      <p className="mt-2 max-w-[65ch] text-body text-mid">{nota}</p>
      <div className="mt-8">{children}</div>
    </section>
  )
}

function Swatches({ filas }: { filas: readonly (readonly [string, string, string])[] }) {
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {filas.map(([nombre, hex, uso]) => (
        <li key={nombre} className="flex items-center gap-3 rounded-card border border-hairline bg-surface-1 p-2">
          <div className="size-12 shrink-0 rounded-card border border-hairline" style={{ backgroundColor: hex }} />
          <div className="min-w-0">
            <p className="flex items-baseline gap-2 text-small">
              <span>{nombre}</span>
              <code className="text-caption text-low">{hex}</code>
            </p>
            <p className="text-caption text-low">{uso}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Radio({ nombre, clase, uso }: { nombre: string; clase: string; uso: string }) {
  return (
    <div className={cn(clase, 'border border-hairline-strong bg-surface-1 p-4')}>
      <p className="text-small">rounded-{nombre}</p>
      <p className="text-caption text-low">{uso}</p>
    </div>
  )
}
