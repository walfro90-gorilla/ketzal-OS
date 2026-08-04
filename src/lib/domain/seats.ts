// Layout digital de asientos (b041). La FORMA la da el tipo de transporte
// (preset por tipo, estilo aerolínea); el TOTAL viene del cupo de la salida
// (max_capacity). Generado, no dibujado: cada fila es una lista de números de
// asiento con `null` en el pasillo. La última fila puede quedar parcial.

export type TransportType = 'autobus' | 'sprinter' | 'van' | 'avion'

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  autobus: 'Autobús',
  sprinter: 'Sprinter',
  van: 'Van',
  avion: 'Avión',
}

/** Asientos por lado del pasillo, por tipo. [izquierda, derecha] */
const LADOS: Record<TransportType, [number, number]> = {
  autobus: [2, 2],
  sprinter: [1, 2],
  van: [1, 2],
  avion: [3, 3],
}

/**
 * Filas del layout: números 1..total, `null` = pasillo.
 * Ej. autobús total=6 → [[1,2,null,3,4],[5,6,null]]
 */
export function filasAsientos(
  tipo: TransportType,
  total: number
): (number | null)[][] {
  if (!Number.isInteger(total) || total < 1) return []
  const [izq, der] = LADOS[tipo]
  const porFila = izq + der
  const filas: (number | null)[][] = []
  let n = 1
  while (n <= total) {
    const fila: (number | null)[] = []
    for (let i = 0; i < izq && n <= total; i++) fila.push(n++)
    fila.push(null) // pasillo
    for (let i = 0; i < der && n <= total; i++) fila.push(n++)
    filas.push(fila)
  }
  return filas
}
