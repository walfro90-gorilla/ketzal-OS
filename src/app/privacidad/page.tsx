import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Aviso de privacidad integral (LFPDPPP). Prerequisito 2 del stack de marketing
// (docs/MARKETING_STACK_HUELLA.md): el píxel de Meta y GA4 quedaron en vivo el
// 2026-09-03 y la ley pide informar al titular DONDE se recaban los datos — por
// eso además se enlaza desde el pie y desde el checkout.
//
// Página estática, misma forma que /politica-cancelacion. Los datos del
// responsable son los que el fundador confirmó; cambiarlos aquí actualiza el
// aviso completo.

const RESPONSABLE = 'Ketzal'
const DOMICILIO = 'Ciudad Juárez, Chihuahua, México'
const CORREO_ARCO = 'privacidad@ketzal.tours'
const ACTUALIZADO = '3 de septiembre de 2026'

export const metadata: Metadata = {
  title: 'Aviso de privacidad — Ketzal',
  alternates: { canonical: '/privacidad' },
  description:
    'Qué datos personales recaba Ketzal al cotizar, reservar y pagar un viaje, para qué se usan, con quién se comparten y cómo ejercer tus derechos ARCO.',
  openGraph: {
    title: 'Aviso de privacidad — Ketzal',
    description:
      'Qué datos recabamos, para qué, con quién se comparten y cómo ejercer tus derechos.',
    type: 'website',
  },
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function PrivacidadPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Aviso de privacidad</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última actualización: {ACTUALIZADO}. Aplica a{' '}
          <strong className="text-foreground">ketzal.tours</strong> y a las
          cotizaciones, reservas y pagos que haces a través de Ketzal con las agencias
          de viaje que operan en la plataforma.
        </p>

        <Seccion titulo="Quién es responsable de tus datos">
          <p>
            <strong className="text-foreground">{RESPONSABLE}</strong>, con domicilio en{' '}
            {DOMICILIO}, es responsable del tratamiento de tus datos personales conforme
            a la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares. Para cualquier asunto de privacidad escríbenos a{' '}
            <a
              href={`mailto:${CORREO_ARCO}`}
              className="text-foreground underline underline-offset-4"
            >
              {CORREO_ARCO}
            </a>
            .
          </p>
        </Seccion>

        <Seccion titulo="Qué datos recabamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Identificación y contacto</strong>:
              nombre, correo electrónico y teléfono de quien cotiza o reserva.
            </li>
            <li>
              <strong className="text-foreground">Datos de los viajeros</strong>: nombre
              de cada acompañante y, cuando la salida lo requiera (vuelos, hospedaje,
              seguros), fecha de nacimiento y número de identificación oficial o
              pasaporte. Son opcionales salvo que el servicio contratado los exija.
            </li>
            <li>
              <strong className="text-foreground">Datos de pago</strong>: los pagos con
              tarjeta los procesa Mercado Pago; Ketzal no recibe ni almacena números de
              tarjeta. Si pagas por transferencia o en efectivo, guardamos el comprobante
              que subes, en almacenamiento privado y accesible solo con tu sesión o la de
              tu agencia.
            </li>
            <li>
              <strong className="text-foreground">Datos de navegación</strong>: dirección
              IP, tipo de navegador, páginas que visitas y cookies o identificadores
              similares (ver <em>Cookies y medición</em>).
            </li>
          </ul>
          <p>No recabamos datos personales sensibles.</p>
        </Seccion>

        <Seccion titulo="Para qué los usamos">
          <p>
            <strong className="text-foreground">Finalidades necesarias</strong>: elaborar
            tu cotización; registrar y operar tu reserva (cupos, salidas, lista de
            viajeros); procesar y comprobar tus pagos; emitir recibos, vouchers y
            confirmaciones; avisarte de cambios en tu viaje; atender cancelaciones y
            créditos conforme a la{' '}
            <Link
              href="/politica-cancelacion"
              className="text-foreground underline underline-offset-4"
            >
              política de cancelación
            </Link>
            ; y cumplir obligaciones legales.
          </p>
          <p>
            <strong className="text-foreground">Finalidades secundarias</strong>: medir
            el uso del sitio, mostrarte anuncios relevantes en redes sociales y
            buscadores, y enviarte información sobre viajes. Puedes oponerte a estas
            finalidades cuando quieras escribiendo a {CORREO_ARCO}; tu reserva no se ve
            afectada.
          </p>
        </Seccion>

        <Seccion titulo="Con quién se comparten">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">La agencia que opera tu viaje</strong>{' '}
              — aparece en tu cotización y en tu reserva — y sus proveedores de
              transporte u hospedaje, solo con los datos necesarios para prestar el
              servicio.
            </li>
            <li>
              <strong className="text-foreground">Mercado Pago</strong>, para procesar
              pagos en línea; se rige por su propio aviso de privacidad.
            </li>
            <li>
              <strong className="text-foreground">Proveedores tecnológicos</strong> que
              alojan la plataforma y su base de datos, que actúan por cuenta de Ketzal y
              bajo obligaciones de confidencialidad.
            </li>
            <li>
              <strong className="text-foreground">Meta y Google</strong>, únicamente los
              datos de navegación descritos abajo, con fines de medición y publicidad.
            </li>
          </ul>
          <p>No vendemos tus datos personales.</p>
        </Seccion>

        <Seccion titulo="Cookies y medición">
          <p>
            En las páginas públicas del sitio usamos el{' '}
            <strong className="text-foreground">píxel de Meta</strong> y{' '}
            <strong className="text-foreground">Google Analytics</strong>. Registran las
            páginas que visitas, cuándo inicias una compra y cuándo la completas, junto
            con tu dirección IP, el navegador que usas e identificadores guardados en
            cookies. Sirven para saber qué funciona del sitio y para mostrarte anuncios
            relevantes. No se usan en las pantallas de trabajo de las agencias.
          </p>
          <p>
            Puedes bloquear o borrar estas cookies desde la configuración de tu
            navegador, y ajustar tus preferencias de anuncios en{' '}
            <a
              href="https://www.facebook.com/adpreferences"
              className="text-foreground underline underline-offset-4"
              rel="noreferrer"
            >
              Meta
            </a>{' '}
            y{' '}
            <a
              href="https://adssettings.google.com"
              className="text-foreground underline underline-offset-4"
              rel="noreferrer"
            >
              Google
            </a>
            . El sitio sigue funcionando sin ellas.
          </p>
        </Seccion>

        <Seccion titulo="Tus derechos ARCO">
          <p>
            Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su uso,
            así como revocar el consentimiento que nos hayas dado. Escríbenos a{' '}
            <a
              href={`mailto:${CORREO_ARCO}`}
              className="text-foreground underline underline-offset-4"
            >
              {CORREO_ARCO}
            </a>{' '}
            con tu nombre, el correo con el que reservaste y qué derecho quieres ejercer.
            Respondemos en un máximo de 20 días hábiles. Algunos datos deben conservarse
            mientras tu reserva esté vigente o por obligación legal.
          </p>
          <p>
            Si tienes cuenta de viajero, tus datos y tus compras están en{' '}
            <Link
              href="/mis-compras"
              className="text-foreground underline underline-offset-4"
            >
              Mis viajes
            </Link>
            .
          </p>
        </Seccion>

        <Seccion titulo="Cambios a este aviso">
          <p>
            Cualquier cambio se publica en esta página con su fecha de actualización. Si
            el cambio afecta el uso de datos que ya nos diste, te lo avisamos al correo
            con el que reservaste.
          </p>
        </Seccion>
      </main>
      <PublicFooter />
    </>
  )
}
