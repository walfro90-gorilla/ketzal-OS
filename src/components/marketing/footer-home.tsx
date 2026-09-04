import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'
import { linkWhatsapp } from '@/lib/domain/phone'
import { cn } from '@/lib/utils'
import { ENLACE } from './cta'

// Footer de la home del SaaS. Propio, no el de la vitrina (`PublicFooter`),
// porque aquel le habla al viajero ("viajes de agencias locales") y pone
// /explora y /agencias en primer plano. Aquí el marketplace es UNA puerta
// discreta, para quien cayó en la raíz buscando un viaje (ADR-0047).
export function FooterHome() {
  const wa = linkWhatsapp(process.env.WHATSAPP_VENTAS ?? null)
  const correo = process.env.CORREO_VENTAS ?? null
  const año = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-[36ch]">
            <p className="flex items-center gap-2">
              <BrandMark className="size-6 text-jade-600" />
              <span className="font-display text-body font-semibold">Ketzal OS</span>
            </p>
            <p className="mt-3 text-small text-mid">
              El sistema de venta y cobranza de las agencias de viajes
              independientes. Hecho en Ciudad Juárez, Chihuahua.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 sm:gap-12">
            <nav aria-labelledby="pie-producto">
              <h2 id="pie-producto" className="text-caption text-mid">Producto</h2>
              <ul className="mt-3 space-y-1">
                <li><a href="#producto" className={cn(ENLACE, '-ml-2')}>Qué hace</a></li>
                <li><a href="#precios" className={cn(ENLACE, '-ml-2')}>Precios</a></li>
                <li><Link href="/login" className={cn(ENLACE, '-ml-2')}>Entrar</Link></li>
              </ul>
            </nav>

            <nav aria-labelledby="pie-contacto">
              <h2 id="pie-contacto" className="text-caption text-mid">Contacto</h2>
              <ul className="mt-3 space-y-1">
                {wa && <li><a href={wa} className={cn(ENLACE, '-ml-2')}>WhatsApp</a></li>}
                {correo && <li><a href={`mailto:${correo}`} className={cn(ENLACE, '-ml-2')}>Correo</a></li>}
                {!wa && !correo && (
                  <li className="px-2 text-small text-mid">Pronto</li>
                )}
              </ul>
            </nav>

            <nav aria-labelledby="pie-legal">
              <h2 id="pie-legal" className="text-caption text-mid">Legal</h2>
              <ul className="mt-3 space-y-1">
                <li><Link href="/privacidad" className={cn(ENLACE, '-ml-2')}>Aviso de privacidad</Link></li>
                <li><Link href="/politica-cancelacion" className={cn(ENLACE, '-ml-2')}>Cancelaciones</Link></li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-caption text-mid sm:flex-row sm:items-center sm:justify-between">
          <p>© {año} Ketzal. Gorilla Labs, Ciudad Juárez.</p>
          {/* La única puerta al marketplace en toda la home (ADR-0047). */}
          <p>
            ¿Buscas un viaje?{' '}
            <Link
              href="/explora"
              className="rounded-card text-mid underline underline-offset-4 outline-none hover:text-hi focus-visible:ring-2 focus-visible:ring-jade-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Ver salidas publicadas
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
