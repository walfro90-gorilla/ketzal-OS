import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/domain/phone'
import { buttonVariants } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { PublicFooter } from '@/components/public/public-footer'
import { inter } from './fonts'
import { CTA_NAV, CTA_PRIMARIO, CTA_SECUNDARIO, ENLACE } from './cta'
import capturaVenta from './capturas/venta-movil-hero.png'
import capturaPlan from './capturas/venta-escritorio-plan.png'
import capturaCobranza from './capturas/cobranza-panel.png'
import capturaVitrina from './capturas/vitrina-panel.jpg'

// Home de ketzal.tours (KETZAL_HOME_REDESIGN.md). Pitch del OS a la agencia,
// sobre canvas oscuro con la paleta jade (ADR-0046); no le habla al viajero
// (ADR-0047). Server component, cero cliente: la única animación es el
// momento del hero (reveal escalonado + estela trazada), neutralizado por el
// bloque global de prefers-reduced-motion.
//
// Etapa 3 de 6: nav, hero, credibilidad, problema y features son definitivos.
// "Cómo funciona" y el cierre son los anteriores puestos sobre el tema oscuro
// (clase `dark` en el wrapper) hasta que las etapas 4 y 5 los sustituyan.

// Lo que dice la spec, sin inflar: dos nombres reales, cero logos inventados.
const AGENCIAS = [
  { nombre: 'Wanderlust Travels', ciudad: 'Cd. Juárez' },
  { nombre: 'Border Travels', ciudad: 'Cd. Juárez' },
]
const HOY = [
  'Ventas en un cuaderno.',
  'Abonos en una hoja de cálculo que solo tú entiendes.',
  'Cobros que se te olvidan.',
  'Recibos hechos a mano.',
  'Ningún lugar donde ver cuánto te deben.',
]
const CON_KETZAL = [
  'Cada venta con su plan de abonos.',
  'Recordatorios que salen solos por WhatsApp.',
  'Recibo al instante.',
  'Una sola pantalla con todo lo que te deben.',
]

const reveal = 'animate-in fade-in slide-in-from-bottom-4 duration-700 [animation-fill-mode:both]'

// El contacto comercial lo pone el fundador en Vercel (WHATSAPP_VENTAS, 10 dígitos
// o E.164). Sin él no se inventa un botón: el primario pasa a ser "Entrar".
const WA = linkWhatsapp(process.env.WHATSAPP_VENTAS ?? null)
const waHref = WA && `${WA}?text=${encodeURIComponent('Hola, quiero ver Ketzal OS para mi agencia.')}`

export function Landing() {
  return (
    <div className={cn(inter.variable, 'dark font-body scheme-dark flex min-h-screen flex-col bg-canvas text-hi')}>
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Ketzal — inicio" className={cn('flex items-center gap-2 rounded-card', ENLACE, 'px-0 text-hi hover:text-hi')}>
            <BrandMark className="size-7 text-jade-600" />
            <span className="font-display text-lg font-semibold tracking-[-0.01em]">Ketzal</span>
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-4">
            <a href="#producto" className={cn(ENLACE, 'hidden sm:inline-flex')}>
              Producto
            </a>
            <Link href="/login" className={ENLACE}>
              Entrar
            </Link>
            {waHref && (
              <a href={waHref} className={CTA_NAV}>
                Escríbenos
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------- HERO: 7 columnas de texto, 5 de producto ---------------- */}
        <section className="relative">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pt-14 pb-12 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pt-24 lg:pb-16">
            <div className="lg:col-span-7">
              <h1 className={cn(reveal, 'font-display text-display-lg max-w-[18ch] text-balance lg:text-display-xl')}>
                Vende más viajes. Cobra a tiempo. Sin hojas de cálculo.
              </h1>
              <p className={cn(reveal, 'mt-6 max-w-[55ch] text-lead text-mid [animation-delay:80ms]')}>
                Registra la venta, arma el plan de abonos, cobra por WhatsApp y
                emite el recibo. Desde el celular, con el cliente enfrente.
              </p>
              <div className={cn(reveal, 'mt-8 flex flex-wrap items-center gap-3 [animation-delay:160ms]')}>
                {waHref ? (
                  <>
                    <a href={waHref} className={CTA_PRIMARIO}>
                      Escríbenos por WhatsApp
                    </a>
                    <Link href="/login" className={CTA_SECUNDARIO}>
                      Entrar a mi agencia
                    </Link>
                  </>
                ) : (
                  <Link href="/login" className={CTA_PRIMARIO}>
                    Entrar a mi agencia
                  </Link>
                )}
              </div>
              <p className={cn(reveal, 'mt-6 text-small text-low [animation-delay:240ms]')}>
                Hecho en Ciudad Juárez por gente que operó una agencia seis años.
              </p>
            </div>

            {/* Captura real del producto: la venta con su plan de abonos, en el
                celular. Es la imagen LCP: la única con priority en toda la home.
                En Next 16 `priority` solo quita el lazy y emite el <link preload>;
                el hint al navegador va aparte (`fetchPriority`). Ancho fijo
                (390 css px máx.) ⇒ sin `sizes`: el srcset sale 1x/2x del width. */}
            <div className={cn(reveal, 'lg:col-span-5 [animation-delay:200ms]')}>
              <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-panel border border-hairline-strong bg-surface-1">
                <Image
                  src={capturaVenta}
                  alt="Pantalla de una venta en Ketzal OS en el celular: plan de pagos con enganche y dos abonos quincenales, y debajo el resumen de total, pagado y saldo."
                  priority
                  fetchPriority="high"
                  quality={85}
                  placeholder="blur"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>

          {/* La estela: firma de marca trazada una vez al cargar. Único gradiente del sitio. */}
          <div className="mx-auto w-full max-w-6xl px-4 pb-4">
            <svg viewBox="0 0 900 90" className="h-12 w-full max-w-2xl" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="estela-hero" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#00C89D" />
                  <stop offset="1" stopColor="#05AE51" />
                </linearGradient>
              </defs>
              <path
                className="animate-estela-draw"
                d="M6 74 C 240 74, 300 22, 470 18 S 760 40, 890 14"
                stroke="url(#estela-hero)"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <circle cx="890" cy="14" r="6" fill="#05AE51" />
            </svg>
          </div>
        </section>

        {/* ---------------- CREDIBILIDAD: franja delgada, dos nombres reales ---------------- */}
        <section aria-labelledby="credibilidad" className="border-y border-hairline">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="credibilidad" className="text-small text-mid">
                Agencias que ya están en Ketzal
              </h2>
              <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                {AGENCIAS.map((a) => (
                  <li key={a.nombre} className="text-body font-semibold">
                    {a.nombre} <span className="font-normal text-low">({a.ciudad})</span>
                  </li>
                ))}
              </ul>
            </div>
            <ul aria-label="Construido con" className="flex gap-6 text-caption text-low">
              <li>Next.js</li>
              <li>Supabase</li>
              <li>MCP</li>
            </ul>
          </div>
        </section>

        {/* ---------------- EL PROBLEMA: dos columnas, sin iconos ---------------- */}
        <section aria-labelledby="problema" className="mx-auto w-full max-w-6xl px-4 py-section lg:py-section-lg">
          <h2 id="problema" className="sr-only">
            Cómo opera una agencia hoy y cómo opera con Ketzal
          </h2>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="font-display text-heading text-mid">Así opera hoy tu agencia</h3>
              <ul className="mt-6 max-w-[40ch]">
                {HOY.map((t) => (
                  <li key={t} className="border-t border-hairline py-4 text-lead text-mid">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-heading">Así opera con Ketzal</h3>
              <ul className="mt-6 max-w-[40ch]">
                {CON_KETZAL.map((t, i) => (
                  <li
                    key={t}
                    className={cn(
                      'border-t border-hairline-strong py-4 text-lead',
                      // El dato clave de la sección: uno solo, en jade.
                      i === CON_KETZAL.length - 1 ? 'font-semibold text-jade-600' : 'text-hi',
                    )}
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- FEATURES: uno héroe ancho, dos secundarios ---------------- */}
        <section id="producto" aria-labelledby="producto-titulo" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto w-full max-w-6xl px-4 py-section lg:py-section-lg">
            <article className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
              <div className="lg:col-span-5">
                <h2 id="producto-titulo" className="font-display text-display-md text-balance">
                  Venta, abonos y recibo en un solo flujo.
                </h2>
                <p className="mt-5 max-w-[50ch] text-lead text-mid">
                  Registras la venta, defines el enganche y las parcialidades, y
                  el sistema arma el calendario. Cada abono que entra actualiza
                  el saldo y genera su recibo.
                </p>
              </div>
              <div className="lg:col-span-7">
                <Image
                  src={capturaPlan}
                  alt="Ketzal OS en escritorio: la venta V-000042 con su plan de pagos (enganche y dos abonos quincenales) y, debajo, el resumen de total, pagado y saldo."
                  quality={85}
                  sizes="(min-width: 1024px) 640px, 100vw"
                  placeholder="blur"
                  className="h-auto w-full rounded-panel border border-hairline-strong"
                />
              </div>
            </article>

            <div className="mt-16 grid gap-10 md:grid-cols-2 md:gap-8 lg:mt-24">
              <article>
                <Image
                  src={capturaCobranza}
                  alt="Pantalla de Cobranza en Ketzal OS: cuánto hay por cobrar, cuánto va atrasado y la lista de ventas con saldo ordenadas por urgencia."
                  quality={85}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  placeholder="blur"
                  className="h-auto w-full rounded-panel border border-hairline"
                />
                <h3 className="mt-6 text-subheading">Cobranza que no se te olvida.</h3>
                <p className="mt-2 max-w-[50ch] text-body text-mid">
                  Clawbot manda el recordatorio por WhatsApp cuando toca. Tú te
                  enteras cuando el cliente ya pagó.
                </p>
              </article>
              <article>
                <Image
                  src={capturaVitrina}
                  alt="Ficha pública del viaje Huasteca Potosina en Avión de Border Travels: fotos, precio, salidas y botón para reservar."
                  quality={85}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  placeholder="blur"
                  className="h-auto w-full rounded-panel border border-hairline"
                />
                <h3 className="mt-6 text-subheading">Tu marca, tu vitrina.</h3>
                <p className="mt-2 max-w-[50ch] text-body text-mid">
                  Publica tus salidas con tus fotos y tus precios. El cliente
                  reserva desde ahí y la venta cae en tu sistema.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- CÓMO FUNCIONA (etapa 4 la sustituye) ---------------- */}
        <section className="border-y bg-secondary/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
            <h2 className="font-display max-w-[18ch] text-3xl font-semibold tracking-[-0.015em] text-balance sm:text-4xl">
              Tres pasos, una tarde de trabajo menos
            </h2>
            <div className="relative mt-10">
              <div
                aria-hidden
                className="bg-estela absolute top-0 right-[16%] left-[16%] hidden h-[3px] rounded-full opacity-50 sm:block"
              />
              <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6 sm:pt-7">
                <Step n="01" title="Registra la venta" body="Elige cliente, servicio y salida. Ketzal calcula el total y reserva el cupo." />
                <Step n="02" title="Arma los abonos" body="Define el plan de pagos. Cada abono cae en la cobranza con su fecha." />
                <Step n="03" title="Cobra y da recibo" body="Registra el pago, emite el recibo y comparte el estado de cuenta por WhatsApp." />
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------- CIERRE (etapa 5 la sustituye) ---------------- */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-[color:var(--foreground)] px-6 py-14 text-center sm:px-16">
            <div aria-hidden className="bg-estela pointer-events-none absolute inset-x-0 top-0 h-1" />
            <h2 className="font-display mx-auto max-w-[20ch] text-3xl font-semibold tracking-[-0.015em] text-balance text-[color:var(--background)] sm:text-4xl">
              Deja la hoja de cálculo. Empieza a cobrar a tiempo.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[color:var(--background)]/70">
              Entra con el correo de tu agencia y registra tu primera venta hoy.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'estela', size: 'touch' }), 'px-8 text-base')}
              >
                Entrar a mi agencia
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="relative">
      <span className="text-estela font-mono text-2xl font-bold tabular-nums">
        {n}
      </span>
      <h3 className="font-display mt-2 text-lg font-semibold tracking-[-0.01em]">
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </li>
  )
}
