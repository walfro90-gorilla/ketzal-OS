import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/domain/phone'
import { buttonVariants } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { PublicFooter } from '@/components/public/public-footer'
import { formatTravelDate, mxnEntero } from '@/components/data/format'
import { inter } from './fonts'
import { CTA_NAV, CTA_PRIMARIO, CTA_SECUNDARIO, ENLACE } from './cta'
import { inventarioHome } from './inventario'
import capturaVenta from './capturas/venta-movil-hero.png'
import capturaPlan from './capturas/venta-escritorio-plan.png'
import capturaCobranza from './capturas/cobranza-panel.png'
import capturaVitrina from './capturas/vitrina-panel.jpg'
import capturaRegistrar from './capturas/paso-registrar.png'
import capturaRecibo from './capturas/paso-recibo.png'

// Home de ketzal.tours (KETZAL_HOME_REDESIGN.md). Pitch del OS a la agencia,
// sobre canvas oscuro con la paleta jade (ADR-0046); no le habla al viajero
// (ADR-0047). Server component, cero cliente: la única animación es el
// momento del hero (reveal escalonado + estela trazada), neutralizado por el
// bloque global de prefers-reduced-motion.
//
// Etapa 4 de 6: todo es definitivo salvo el cierre (etapa 5), que sigue siendo
// el anterior puesto sobre el tema oscuro (clase `dark` en el wrapper).

// Los tres pasos son una secuencia real: aquí SÍ va numeración.
const PASOS = [
  { titulo: 'Registra la venta', cuerpo: 'Cliente, servicio y salida. Ketzal calcula el total y aparta el cupo.', captura: capturaRegistrar, alt: 'Formulario "Nueva venta" en el celular: elegir cliente existente o nuevo, servicio y fecha de viaje, con el total abajo.' },
  { titulo: 'Arma los abonos', cuerpo: 'Enganche, frecuencia y fecha límite. El calendario se arma solo.', captura: capturaVenta, alt: 'Plan de pagos de una venta en el celular: enganche y dos abonos quincenales con su fecha y saldo restante.' },
  { titulo: 'Cobra y da recibo', cuerpo: 'Registras el pago y el recibo sale al instante, con link para compartir por WhatsApp.', captura: capturaRecibo, alt: 'Recibo de pago #0001 en el celular: agencia, cliente, concepto, monto y saldo pendiente.' },
]

// Herramientas reales del MCP (mcp/src/tools): no prometer lo que no existe.
const HERRAMIENTAS_MCP = ['ketzal_cobranza', 'ketzal_registrar_abono', 'ketzal_ventas']

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

export async function Landing() {
  const inventario = await inventarioHome()
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

        {/* ---------------- CÓMO FUNCIONA: secuencia real, numerada, con mini-capturas ---------------- */}
        <section aria-labelledby="pasos" className="border-t border-hairline">
          <div className="mx-auto w-full max-w-6xl px-4 py-section lg:py-section-lg">
            <h2 id="pasos" className="font-display text-display-md max-w-[18ch] text-balance">
              Tres pasos, una tarde de trabajo menos.
            </h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className="flex flex-col">
                  <div className="overflow-hidden rounded-panel border border-hairline">
                    <Image
                      src={p.captura}
                      alt={p.alt}
                      quality={85}
                      sizes="(min-width: 640px) 33vw, 100vw"
                      placeholder="blur"
                      className="h-auto w-full"
                    />
                  </div>
                  <p className="mt-6 text-caption text-jade-600 tabular-nums">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-subheading">{p.titulo}</h3>
                  <p className="mt-2 max-w-[40ch] text-body text-mid">{p.cuerpo}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- INVENTARIO: salidas reales de la vitrina, en vivo ---------------- */}
        {inventario.length > 0 && (
          <section aria-labelledby="inventario" className="border-t border-hairline">
            <div className="mx-auto w-full max-w-6xl px-4 py-section lg:py-section-lg">
              <div className="max-w-[55ch]">
                <h2 id="inventario" className="font-display text-display-md text-balance">
                  Tu inventario, publicado.
                </h2>
                <p className="mt-5 text-lead text-mid">
                  Cada salida con su foto, fecha, cupo y precio. Lo que ves aquí
                  es lo que hoy tienen publicado agencias reales en Ketzal.
                </p>
              </div>
              <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {inventario.map((t) => (
                  <li key={t.id} className="overflow-hidden rounded-panel border border-hairline bg-surface-1">
                    <div className="relative aspect-[4/3]">
                      {t.imagen && (
                        <Image
                          src={t.imagen}
                          alt={`${t.nombre}: foto principal de la salida publicada por ${t.agencia}.`}
                          fill
                          quality={85}
                          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-caption text-low">{t.agencia}</p>
                      <h3 className="mt-1 font-display text-subheading">{t.nombre}</h3>
                      {t.destino && <p className="mt-1 text-small text-mid">{t.destino}</p>}
                      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-4 text-small">
                        <div>
                          <dt className="text-caption text-low">Próxima salida</dt>
                          <dd className="mt-1 text-hi">{formatTravelDate(t.proxima)}</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-low">Cupo</dt>
                          <dd className="mt-1 text-hi tabular-nums">
                            {t.libres <= 3 ? `Últimos ${t.libres}` : `${t.libres} lugares`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-caption text-low">Desde</dt>
                          <dd className="mt-1 font-semibold text-hi tabular-nums">
                            {t.precio != null ? mxnEntero.format(t.precio) : '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- CAPA DE IA: en lenguaje de negocio, con enlace verificable ---------------- */}
        <section aria-labelledby="ia" className="border-t border-hairline">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-section lg:grid-cols-12 lg:gap-12 lg:py-section-lg">
            <div className="lg:col-span-7">
              <h2 id="ia" className="font-display text-display-md text-balance">
                Tu agencia, operable en lenguaje natural.
              </h2>
              <p className="mt-5 max-w-[55ch] text-lead text-mid">
                Ketzal expone su inventario y su operación a través de MCP, el
                protocolo estándar para que agentes de IA usen herramientas. En
                la práctica: le pides a un asistente que te diga quién debe esta
                semana, y te contesta.
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-panel border border-hairline bg-surface-1 p-5">
                <pre className="overflow-x-auto rounded-card bg-surface-2 px-4 py-3 font-mono text-small text-hi"><code>npm i ketzal-mcp</code></pre>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Algunas herramientas del MCP">
                  {HERRAMIENTAS_MCP.map((h) => (
                    <li key={h} className="rounded-card border border-hairline px-2 py-1 font-mono text-caption text-mid">
                      {h}
                    </li>
                  ))}
                </ul>
                <a
                  href="https://www.npmjs.com/package/ketzal-mcp"
                  rel="noopener"
                  className={cn(ENLACE, 'mt-4 -ml-2 text-jade-600 hover:text-jade-500')}
                >
                  Ver el paquete en npm
                </a>
              </div>
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
