/** JSON-LD para SEO/AEO (ADR-0026). Serializa escapando `<` para que un valor
 *  con "</script>" no pueda cerrar el tag e inyectar HTML (XSS). */
export function serializeJsonLd(obj: object): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

/** schema.org/TouristTrip de una ficha pública publicada. Campos fácticos
 *  citables: nombre, descripción, origen/destino, agencia, precio MXN. */
export function touristTripJsonLd(s: {
  name: string
  description: string | null
  price: number | null
  city_from: string | null
  state_from: string | null
  city_to: string | null
  state_to: string | null
  images: { imgBanner?: string } | null
  agency: { name: string }
  departures: { departs_on: string }[]
  url: string
}) {
  // La pregunta que más se hace de un tour, después del precio, es "¿qué
  // fechas hay?". `departures` ya viene filtrado a las salidas vendibles, así
  // que la más próxima es una respuesta fáctica y citable.
  const proxima = [...s.departures]
    .map((d) => d.departs_on)
    .filter(Boolean)
    .sort()[0]
  const lugar = (ciudad: string | null, estado: string | null) =>
    [ciudad, estado].filter(Boolean).join(', ') || null
  const destino = lugar(s.city_to, s.state_to)
  const origen = lugar(s.city_from, s.state_from)
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: s.name,
    url: s.url,
    ...(s.description ? { description: s.description } : {}),
    ...(s.images?.imgBanner ? { image: s.images.imgBanner } : {}),
    ...(destino
      ? { touristType: 'Leisure', itinerary: { '@type': 'Place', name: destino } }
      : {}),
    ...(origen ? { departureLocation: { '@type': 'Place', name: origen } } : {}),
    ...(proxima ? { departureTime: proxima } : {}),
    provider: { '@type': 'TravelAgency', name: s.agency.name },
    ...(s.price != null && s.price > 0
      ? {
          offers: {
            '@type': 'Offer',
            price: s.price,
            priceCurrency: 'MXN',
            availability:
              s.departures.length > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/LimitedAvailability',
            ...(proxima ? { availabilityStarts: proxima } : {}),
            url: s.url,
          },
        }
      : {}),
  }
}

/** schema.org/Organization + WebSite de la marca, para la portada.
 *  Es lo que ata el nombre "Ketzal" al dominio, al logo y a las redes: sin
 *  esto un buscador (o un asistente) no tiene forma de saber que la marca y
 *  el sitio son la misma entidad. Se emite como @graph para no repetir
 *  `@context` en dos bloques. */
export function marcaJsonLd(siteUrl: string, logoUrl?: string | null) {
  const org = `${siteUrl}/#organizacion`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: 'Ketzal',
        url: siteUrl,
        description:
          'Marketplace de viajes y tours de agencias locales de Chihuahua, México. Precio final en pesos, salidas con lugares disponibles y reserva en línea.',
        areaServed: { '@type': 'Country', name: 'México' },
        ...(logoUrl ? { logo: logoUrl } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#sitio`,
        url: siteUrl,
        name: 'Ketzal',
        inLanguage: 'es-MX',
        publisher: { '@id': org },
      },
    ],
  }
}

/** schema.org/ItemList de la vitrina pública (/explora). */
export function itemListJsonLd(
  items: { id: string; name: string }[],
  siteUrl: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      url: `${siteUrl}/servicio/${s.id}`,
    })),
  }
}
