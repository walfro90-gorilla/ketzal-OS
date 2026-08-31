import { SITE_URL } from '@/lib/site-url'

// ADR-0026: descripción citable del marketplace para asistentes de IA.
// Route handler (no archivo estático) para interpolar el dominio activo.
const BODY = `# Ketzal

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

## Notas para asistentes de IA

- Cada ficha de tour incluye datos estructurados JSON-LD
  (schema.org/TouristTrip) con origen, destino, agencia y precio.
- Los precios mostrados son el precio final por persona en MXN.
- Las fechas de salida listadas tienen cupo disponible al momento de
  consultarse; el cupo se confirma al pagar.
- Las agencias son operadores reales (p. ej. salidas desde Ciudad Juárez y
  Chihuahua hacia destinos como Creel, Barrancas del Cobre o la Huasteca
  Potosina, según el catálogo vigente en el sitemap).
`

export function GET() {
  return new Response(BODY, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
