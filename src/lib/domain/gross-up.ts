// Gross-up del fee de Mercado Pago: cuánto hay que cobrarle al viajero para que,
// después de que MP descuente su comisión, quede el monto del viaje íntegro para
// repartir (agencia + comisión de Ketzal). Así el costo de procesamiento lo
// absorbe el viajero, no la agencia ni Ketzal (decisión del fundador, 2026-08).
//
// MP cobra pct% + un fijo, ambos con IVA. Despeje:
//   costoFinal - (costoFinal*pctIva + fijoIva) = monto
//   costoFinal = (monto + fijoIva) / (1 - pctIva)
//
// Puro y determinístico (patrón del repo: la ruta lo importa de vuelta). Las
// tasas vienen de app_settings (mp_fee_pct/mp_fee_fijo/mp_fee_iva), así que el
// número real se ajusta sin tocar código.

export type TasasMp = {
  /** % que cobra MP, antes de IVA (ej. 3.49). */
  pct: number
  /** Cargo fijo por operación, antes de IVA (ej. 4.00). */
  fijo: number
  /** IVA en % sobre pct y fijo (ej. 16). */
  iva: number
}

export type GrossUp = {
  /** Lo que se cobra en MP (monto del viaje + fee de procesamiento). */
  costoFinal: number
  /** El fee de procesamiento que absorbe el viajero (la leyenda visible). */
  cargoProcesamiento: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Dado el monto del viaje a cobrar por MP, devuelve el costo final (con el fee
 * de MP encima) y el cargo de procesamiento. Si las tasas son 0 o el monto no es
 * positivo, no hay gross-up (costoFinal = monto, cargo = 0).
 */
export function grossUpMp(monto: number, t: TasasMp): GrossUp {
  const m = Number(monto)
  if (!Number.isFinite(m) || m <= 0) return { costoFinal: 0, cargoProcesamiento: 0 }

  const factor = 1 + Number(t.iva) / 100
  const pctIva = (Number(t.pct) / 100) * factor
  const fijoIva = Number(t.fijo) * factor

  // pctIva >= 1 haría el denominador <= 0 (tasa imposible): degradar a sin fee
  // en vez de devolver un número negativo o infinito.
  if (!(pctIva < 1)) return { costoFinal: round2(m), cargoProcesamiento: 0 }

  const costoFinal = round2((m + fijoIva) / (1 - pctIva))
  return { costoFinal, cargoProcesamiento: round2(costoFinal - m) }
}
