// Investigación de campo, no de laboratorio: el embajador es alguien que va a
// compartir viajes por WhatsApp desde su teléfono. Estos helpers arman lo que
// se le manda y lo que ve, para que no dependa de que alguien le explique.

export type TarifaEmbajador = {
  /** 'percent' | 'fijo_venta' | 'fijo_pax' | 'hibrido' (basis de commission_rules). */
  basis: string
  /** Porcentaje 0-100 (percent e hibrido). */
  rate: number | null
  /** Monto fijo en MXN (fijo_venta, fijo_pax e hibrido). */
  unit_amount: number | null
}

const mxn = (n: number): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

/**
 * La tarifa en una frase que el embajador entienda sin saber qué es una "basis".
 * Null si no hay tarifa configurada — el portal debe decirlo, no inventar un 0.
 */
export function explicarTarifa(t: TarifaEmbajador | null): string | null {
  if (!t) return null
  const pct = t.rate != null ? `${Number(t.rate)}%` : null
  const fijo = t.unit_amount != null ? mxn(Number(t.unit_amount)) : null
  switch (t.basis) {
    case 'percent':
      return pct && `Ganas ${pct} de cada viaje que vendas.`
    case 'fijo_venta':
      return fijo && `Ganas ${fijo} por cada venta que traigas.`
    case 'fijo_pax':
      return fijo && `Ganas ${fijo} por cada persona que viaje.`
    case 'hibrido':
      return pct && fijo
        ? `Ganas ${pct} de la venta más ${fijo} por cada persona que viaje.`
        : null
    default:
      return null
  }
}

/** Link de referido del embajador. Es la vitrina, no una ficha suelta: así puede
 *  compartir "los viajes" y cualquiera que compre le cuenta. */
export function linkReferido(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/explora?ref=${encodeURIComponent(code)}`
}

/** Mensaje que el admin le manda al embajador con su acceso. */
export function mensajeBienvenida(nombre: string, link: string): string {
  const quien = nombre.trim().split(/\s+/)[0] || 'Hola'
  return [
    `¡${quien}, ya eres embajador de Ketzal! 🎉`,
    '',
    'Entra con este enlace para ver tu panel, tu link de referido y lo que vas ganando:',
    link,
    '',
    'El enlace es de un solo uso y personal — no lo compartas.',
  ].join('\n')
}

/** Mensaje sugerido para que el embajador comparta viajes con su gente. */
export function mensajeParaCompartir(link: string): string {
  return [
    '¿Ya viste estos viajes? 🚌✨',
    'Salidas desde Juárez, apartas con el mínimo y pagas en abonos.',
    link,
  ].join('\n')
}

/** `https://wa.me/?text=…` — abre WhatsApp con el mensaje ya escrito. */
export function waCompartir(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/**
 * Motivos por los que un referido NO generó comisión (`referral_misses.reason`,
 * m008). Se traducen a algo accionable: el punto de la pantalla no es informar
 * que falló, es decir qué hacer para que no vuelva a fallar.
 */
export type MotivoMiss = {
  titulo: string
  queHacer: string
  /** true = lo arregla la agencia y va a seguir pasando hasta que lo haga. */
  accionable: boolean
}

const MOTIVOS: Record<string, MotivoMiss> = {
  sin_tarifa_de_la_agencia: {
    titulo: 'Tu agencia no tiene tarifa de embajadores',
    queHacer:
      'Configúrala arriba. Hasta entonces, ninguna venta que traigan tus embajadores les va a generar comisión.',
    accionable: true,
  },
  codigo_inexistente: {
    titulo: 'El código de referido no existe',
    queHacer:
      'Alguien compartió un código mal escrito o de un embajador que ya se dio de baja. Verifica que el embajador esté usando el link de su panel.',
    accionable: true,
  },
  tarifa_da_cero: {
    titulo: 'La tarifa calculó cero',
    queHacer:
      'La tarifa está en 0, o la venta no tiene pasajeros y la tarifa es por persona. Revisa la tarifa y la venta.',
    accionable: true,
  },
  comisiones_exceden_la_venta: {
    titulo: 'Las comisiones se pasaban del total de la venta',
    queHacer:
      'Entre plataforma, agencia, agente y embajador ya se repartía todo. El motor frenó el asiento para no dejar la venta en negativo: baja alguna tarifa.',
    accionable: true,
  },
}

export function explicarMiss(reason: string): MotivoMiss {
  return (
    MOTIVOS[reason] ?? {
      titulo: reason,
      queHacer: 'Motivo no reconocido; revísalo con soporte.',
      accionable: false,
    }
  )
}
