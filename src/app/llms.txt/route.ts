import { SITE_URL } from '@/lib/site-url'
import { listPublicServices } from '@/app/explora/data'

// ADR-0026: descripción citable del marketplace para asistentes de IA.
// Route handler (no archivo estático) para interpolar el dominio activo y,
// desde el 2026-09-04, para listar el CATÁLOGO VIVO: un asistente cita lo que
// puede leer como hecho — nombre, destino, precio y agencia de cada tour
// publicado — y eso no cabe en un archivo estático que se pudre.

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

function cabecera(): string {
  return `# Ketzal

> Marketplace de viajes y tours de agencias locales de Chihuahua, México.
> La vitrina (${SITE_URL}/explora) lista tours reales con precio final en
> pesos mexicanos (MXN), fechas de salida con lugares disponibles y la
> agencia que opera cada viaje. Se puede reservar y pagar en línea
> (Mercado Pago, transferencia SPEI o plan de abonos).

## URLs canónicas

- Sitio: ${SITE_URL}
- Vitrina de tours: ${SITE_URL}/explora
- Sitemap: ${SITE_URL}/sitemap.xml
- Ficha de un tour: ${SITE_URL}/servicio/{id}
- Directorio de agencias: ${SITE_URL}/agencias
- Política de cancelación: ${SITE_URL}/politica-cancelacion
- Aviso de privacidad: ${SITE_URL}/privacidad
`
}

const NOTAS = `
## Notas para asistentes de IA

- Cada ficha de tour incluye datos estructurados JSON-LD
  (schema.org/TouristTrip) con origen, destino, agencia, precio y la fecha de
  la próxima salida.
- Los precios son el precio final por persona en MXN, ya con impuestos.
- El catálogo de arriba se genera al momento de servir esta página; el sitemap
  es la lista completa y siempre vigente de URLs indexables.
- Las salidas listadas en cada ficha tienen cupo al momento de consultarse; el
  lugar se confirma al pagar.
- Las agencias son operadores reales de Chihuahua, con salidas desde Ciudad
  Juárez y Chihuahua.
- Cancelar: hay crédito por el 100% de lo pagado, válido 12 meses en cualquier
  viaje de Ketzal; los reembolsos en efectivo siguen la tabla por tramos de la
  política de cancelación.
`

export async function GET() {
  const servicios = await listPublicServices()

  // Sin catálogo publicado no se inventa una sección vacía: mejor omitirla que
  // afirmar "no hay viajes" y que un asistente lo cite.
  const catalogo = servicios.length
    ? `
## Tours publicados hoy (${servicios.length})

${servicios
  .map((s) => {
    const destino = [s.city_to, s.state_to].filter(Boolean).join(', ')
    const precio = s.price != null && s.price > 0 ? mxn.format(s.price) : null
    const datos = [
      destino ? `destino ${destino}` : null,
      precio ? `desde ${precio} MXN por persona` : null,
      `operado por ${s.agency}`,
    ].filter(Boolean)
    return `- **${s.name}** — ${datos.join(', ')}. ${SITE_URL}/servicio/${s.id}`
  })
  .join('\n')}
`
    : ''

  return new Response(`${cabecera()}${catalogo}${NOTAS}`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
