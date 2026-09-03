import type { Metadata } from 'next'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Política de cancelación pública (C0 del plan de cancelaciones). Página
// estática: el texto es la versión v1 con los números decididos por el
// fundador (docs/POLITICA_CANCELACION.md §8). Cuando exista el snapshot por
// venta (C1), cada venta mostrará SU política congelada; esta página es la
// vigente para reservas nuevas.

export const metadata: Metadata = {
  title: 'Política de cancelación — Ketzal',
  alternates: { canonical: '/politica-cancelacion' },
  description:
    'Cuándo y cuánto se devuelve al cancelar un viaje reservado con las agencias de Ketzal: crédito, plazos, penalizaciones y tus derechos.',
  openGraph: {
    title: 'Política de cancelación — Ketzal',
    description:
      'Cuándo y cuánto se devuelve al cancelar un viaje: crédito, plazos y penalizaciones.',
    type: 'website',
  },
}

// Tramos vigentes (v1, decididos 2026-08-04). La retención es el MAYOR entre
// el % del tramo y el anticipo pactado — con anticipo típico del 20%, la
// columna "retención efectiva" es la que el viajero vive.
const TRAMOS = [
  { cuando: '30 días o más antes de la salida', tramo: '10%', efectiva: '20%' },
  { cuando: 'Entre 15 y 29 días', tramo: '25%', efectiva: '25%' },
  { cuando: 'Entre 7 y 14 días', tramo: '50%', efectiva: '50%' },
  { cuando: 'Entre 2 y 6 días', tramo: '75%', efectiva: '75%' },
  { cuando: '48 horas o menos, o no presentarse', tramo: '100%', efectiva: '100%' },
]

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function PoliticaCancelacionPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Política de cancelación</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versión 1 · vigente desde agosto de 2026. Esta política forma parte de los
          términos de tu reserva: la versión vigente al momento de reservar es la que
          aplica a tu viaje, aunque después cambie.
        </p>

        <Seccion titulo="Cómo cancelar o cambiar tu reserva">
          <p>
            Avísanos por escrito por el mismo canal donde reservaste (WhatsApp de la
            agencia o la plataforma). La fecha de tu aviso es la que se usa para
            calcular los plazos de esta política.
          </p>
        </Seccion>

        <Seccion titulo="Tu primera opción: crédito por el 100%">
          <p>
            Si cancelas, tu mejor opción siempre será el crédito:{' '}
            <strong className="text-foreground">
              el 100% de lo que hayas pagado, sin penalización
            </strong>
            , para usarlo en{' '}
            <strong className="text-foreground">cualquier viaje de Ketzal</strong>{' '}
            (con cualquiera de nuestras agencias) durante los{' '}
            <strong className="text-foreground">12 meses</strong> siguientes.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>El crédito es personal y no puede canjearse por efectivo.</li>
            <li>
              Si tu siguiente viaje cuesta menos, el resto queda como crédito; si
              cuesta más, solo pagas la diferencia.
            </li>
            <li>Pasados los 12 meses sin usarse, el crédito expira y se pierde.</li>
          </ul>
          <p>
            El crédito es una opción que te ofrecemos, nunca una imposición: si
            prefieres la devolución en efectivo, aplican los plazos de la siguiente
            sección.
          </p>
        </Seccion>

        <Seccion titulo="Devolución en efectivo: plazos y penalizaciones">
          <p>
            La penalización se calcula sobre el precio total del viaje y es el{' '}
            <strong className="text-foreground">mayor</strong> entre el porcentaje del
            plazo y el anticipo pactado al reservar (el anticipo aparta tu lugar y no
            es reembolsable). Se te devuelve lo pagado menos esa penalización.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-105 border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-semibold text-foreground">
                    Si cancelas…
                  </th>
                  <th className="py-2 pr-4 font-semibold text-foreground">
                    Penalización del plazo
                  </th>
                  <th className="py-2 font-semibold text-foreground">
                    Retención típica*
                  </th>
                </tr>
              </thead>
              <tbody>
                {TRAMOS.map((t) => (
                  <tr key={t.cuando} className="border-b last:border-0">
                    <td className="py-2 pr-4">{t.cuando}</td>
                    <td className="py-2 pr-4 tabular-nums">{t.tramo}</td>
                    <td className="py-2 tabular-nums">{t.efectiva}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            *Con el anticipo típico del 20%. Si tu anticipo pactado fue distinto, la
            retención mínima es ese anticipo.
          </p>
          <p>
            Los costos ya pagados a terceros que no aceptan devolución (por ejemplo
            boletos de avión o depósitos de hotel no reembolsables), desglosados en tu
            reserva, se retienen íntegros en cualquier plazo.
          </p>
        </Seccion>

        <Seccion titulo="Cambios sin cancelar">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Cambio de fecha:</strong> el primero
              es gratis avisando con al menos{' '}
              <strong className="text-foreground">20 días</strong> de anticipación.
              Cambios posteriores, o con menos de 20 días, se resuelven como crédito o
              con los plazos de cancelación.
            </li>
            <li>
              <strong className="text-foreground">Cambio de viajero:</strong> puedes
              ceder tu lugar a otra persona sin costo avisando hasta 48 horas antes de
              la salida.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="Si pagas en abonos">
          <p>
            Tu plan de pagos forma parte de la reserva. Con más de{' '}
            <strong className="text-foreground">15 días de atraso</strong> en un abono
            (y después de recordártelo), la agencia puede cancelar la reserva por
            incumplimiento aplicando esta misma política, con los plazos contados a la
            fecha de esa cancelación.
          </p>
        </Seccion>

        <Seccion titulo="Si la agencia cancela el viaje">
          <p>Nuestra obligación es espejo de la tuya:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">
                Por no reunirse el mínimo de viajeros:
              </strong>{' '}
              te avisamos con al menos 7 días y eliges entre otra fecha, otro viaje o
              la <strong className="text-foreground">devolución del 100%</strong> de lo
              pagado.
            </li>
            <li>
              <strong className="text-foreground">Por fuerza mayor</strong> (clima,
              cierres de acceso, orden de autoridad): te ofrecemos primero
              reprogramar; si no te acomoda, devolución del 100%.
            </li>
            <li>
              <strong className="text-foreground">Por causa de la agencia:</strong>{' '}
              devolución del 100%, sin descuentos de ningún tipo.
            </li>
          </ul>
          <p>
            En estos casos la devolución es en efectivo si así lo eliges; el crédito
            nunca se te impone.
          </p>
        </Seccion>

        <Seccion titulo="Monedas y forma de devolución">
          <p>
            Todos los importes se administran en pesos mexicanos (MXN). Si tu viaje se
            pactó en dólares, la devolución se calcula sobre los pesos efectivamente
            registrados, no al tipo de cambio del día de la devolución.
          </p>
          <p>
            Las devoluciones se hacen por el mismo medio en que pagaste dentro de los
            15 días hábiles siguientes a confirmarse la cancelación.
          </p>
        </Seccion>

        <Seccion titulo="Dudas">
          <p>
            Escríbele a tu agencia por el canal donde reservaste. Esta política aplica
            a los viajes vendidos por las agencias que operan en Ketzal.
          </p>
        </Seccion>
      </main>
      <PublicFooter />
    </>
  )
}
