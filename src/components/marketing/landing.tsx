import Link from 'next/link'
import {
  ReceiptTextIcon,
  BellRingIcon,
  SmartphoneIcon,
  StoreIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { PublicFooter } from '@/components/public/public-footer'

// Landing de marca (anónimos en `/`). Pitch del OS a la agencia (B2B), con
// puerta secundaria al marketplace. Sistema "La Estela": display Bricolage,
// neutros cálidos, firma estela. Server component — CTAs con buttonVariants
// sobre <Link> para no hidratar de más. Mobile-first.
export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header propio: ligero, orientado a "entrar" (no la nav del viajero). */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Ketzal — inicio" className="flex items-center gap-2">
            <BrandMark className="size-7 text-primary" />
            <span className="font-display text-lg font-semibold tracking-[-0.01em]">
              Ketzal
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/explora"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Ver viajes
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'default', size: 'default' }))}
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------- HERO ---------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="bg-estela absolute -top-24 right-[-10%] h-[420px] w-[420px] rounded-full opacity-[0.10] blur-3xl" />
            <div className="bg-estela absolute top-1/3 left-[-15%] h-[360px] w-[360px] rounded-full opacity-[0.07] blur-3xl" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              <span className="bg-estela h-[3px] w-6 rounded-full" aria-hidden />
              Sistema operativo de venta
            </p>
            <h1 className="font-display max-w-[16ch] text-4xl leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-6xl">
              Vende más viajes.{' '}
              <span className="text-estela">Cobra a tiempo.</span> Sin hojas de
              cálculo.
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg text-muted-foreground">
              Ketzal es la app donde tu agencia registra la venta, arma el plan
              de abonos, cobra por WhatsApp y emite el recibo — desde el celular,
              con el cliente enfrente.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'estela', size: 'touch' }),
                  'px-6 text-base'
                )}
              >
                Entrar a mi agencia
              </Link>
              <Link
                href="/explora"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'touch' }),
                  'px-6 text-base'
                )}
              >
                Ver viajes publicados
              </Link>
            </div>

            {/* Estela trazada: la firma como gesto del hero. */}
            <svg
              viewBox="0 0 900 120"
              className="mt-14 h-16 w-full max-w-3xl"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="estela-hero" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--ring)" />
                  <stop offset="1" stopColor="var(--success)" />
                </linearGradient>
              </defs>
              <path
                d="M6 96 C 240 96, 300 34, 470 30 S 760 52, 894 22"
                stroke="url(#estela-hero)"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <circle cx="894" cy="22" r="7" fill="var(--success)" />
            </svg>
          </div>
        </section>

        {/* ---------------- VALOR ---------------- */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
          <div className="grid gap-4 sm:grid-cols-2">
            <Feature
              icon={ReceiptTextIcon}
              title="Venta, abonos y recibo"
              body="Registra la venta, arma el plan de pagos y emite el recibo en segundos. Un solo flujo, sin cuadrar nada a mano."
            />
            <Feature
              icon={BellRingIcon}
              title="Cobranza que no se olvida"
              body="Clawbot vigila cada abono por vencer y manda el recordatorio por WhatsApp. Tú apruebas; él persigue."
            />
            <Feature
              icon={SmartphoneIcon}
              title="Hecho para el campo"
              body="El teléfono es el escritorio. Cierra la venta parado en el mostrador o en la terminal, con el cliente enfrente."
            />
            <Feature
              icon={StoreIcon}
              title="Tu marca, tu vitrina"
              body="Publica tus salidas en un marketplace con tu nombre y recibe reservas. La venta cae directo a tu operación."
            />
          </div>
        </section>

        {/* ---------------- CÓMO FUNCIONA (secuencia real → numeración legítima) --- */}
        <section className="border-y bg-secondary/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              <span className="bg-estela h-[3px] w-6 rounded-full" aria-hidden />
              De la venta al recibo
            </p>
            <h2 className="font-display max-w-[18ch] text-3xl font-semibold tracking-[-0.015em] text-balance sm:text-4xl">
              Tres pasos, una tarde de trabajo menos
            </h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              <Step
                n="01"
                title="Registra la venta"
                body="Elige cliente, servicio y salida. Ketzal calcula el total y reserva el cupo."
              />
              <Step
                n="02"
                title="Arma los abonos"
                body="Define el plan de pagos. Cada abono cae en la cobranza con su fecha."
              />
              <Step
                n="03"
                title="Cobra y da recibo"
                body="Registra el pago, emite el recibo y comparte el estado de cuenta por WhatsApp."
              />
            </ol>
          </div>
        </section>

        {/* ---------------- CTA FINAL ---------------- */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-[color:var(--foreground)] px-6 py-14 text-center sm:px-16">
            <div
              aria-hidden
              className="bg-estela pointer-events-none absolute inset-x-0 top-0 h-1"
            />
            <h2 className="font-display mx-auto max-w-[20ch] text-3xl font-semibold tracking-[-0.015em] text-balance text-[color:var(--background)] sm:text-4xl">
              Deja la hoja de cálculo. Empieza a cobrar a tiempo.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[color:var(--background)]/70">
              Entra con el correo de tu agencia y registra tu primera venta hoy.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'estela', size: 'touch' }),
                  'px-8 text-base'
                )}
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

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 transition-shadow hover:shadow-[0_2px_4px_rgba(14,36,29,.06),0_18px_40px_-16px_rgba(14,36,29,.28)]">
      <div className="bg-accent text-primary mb-4 flex size-11 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">
        {title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
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
