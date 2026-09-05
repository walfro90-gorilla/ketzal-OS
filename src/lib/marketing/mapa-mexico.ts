// Trazo de México y proyección para el mapa de destinos (ADR-0054).
//
// PROCEDENCIA Y LICENCIA: el contorno se derivó de **Natural Earth** (escala
// 1:110m, `ne_110m_admin_0_countries`), que es **dominio público** y no exige
// atribución ni contagia licencia — a diferencia de los SVG de Wikimedia
// (CC-BY-SA) o de bancos de imágenes. El polígono trae 170 puntos, que a este
// tamaño es de sobra, así que no hace falta simplificar ni cargar una librería
// de mapas: son ~2 KB de `path` servidos en el HTML.
//
// La proyección es equirectangular con corrección por la latitud media del país
// (México va de ~14.5° a ~32.7°). Suficiente y honesta para ubicar puntos; no
// pretende ser cartografía.

/** `viewBox` del SVG. */
export const MAPA_ANCHO = 1000
export const MAPA_ALTO = 655

/** Contorno de México, derivado de Natural Earth (dominio público). */
export const MEXICO_PATH =
  'M0.0 6.7 L37.5 3.9 L79.4 0.0 L76.3 7.0 L126.1 24.5 L201.4 49.9 L266.9 49.6 L293.1 49.6 L293.2 34.8 L350.3 34.8 L362.3 47.6 L379.2 58.9 L398.8 74.8 L409.8 93.6 L418.0 113.4 L435.0 124.2 L462.4 135.0 L483.2 106.6 L510.1 105.9 L533.4 120.3 L549.9 144.9 L561.3 166.0 L580.8 186.5 L588.1 211.7 L597.3 228.7 L623.0 239.8 L646.5 247.7 L659.3 246.7 L646.5 278.3 L640.7 304.2 L638.3 352.4 L635.2 370.0 L640.9 389.7 L651.1 407.2 L657.7 435.1 L679.6 461.9 L687.3 482.5 L700.2 500.2 L735.2 509.8 L748.9 524.8 L777.8 514.8 L802.9 511.1 L827.6 504.7 L848.4 498.5 L869.4 483.8 L877.2 462.8 L879.9 432.5 L885.6 422.0 L908.0 412.6 L942.9 404.2 L972.1 405.5 L992.1 402.4 L1000.0 410.1 L998.9 427.4 L981.2 448.8 L973.3 470.7 L979.4 477.0 L974.4 492.6 L966.2 520.7 L957.8 511.4 L950.9 512.0 L944.6 512.5 L932.8 534.2 L926.8 530.0 L922.8 531.6 L923.1 536.9 L892.6 536.5 L861.8 536.6 L861.8 556.9 L846.9 556.9 L859.2 569.0 L871.4 577.3 L875.0 585.1 L880.4 587.3 L879.5 599.5 L837.2 599.6 L821.3 629.0 L826.0 635.7 L822.2 644.2 L821.4 654.6 L784.0 615.9 L767.0 604.2 L740.1 594.8 L721.7 597.4 L695.2 611.0 L678.5 614.5 L655.2 605.0 L630.5 598.2 L599.7 581.7 L575.0 576.6 L537.6 559.9 L510.0 542.7 L501.7 533.0 L483.2 530.9 L449.5 519.5 L435.8 503.1 L400.3 482.6 L383.8 459.9 L375.9 442.4 L386.9 438.9 L383.5 428.6 L391.1 419.3 L391.3 406.8 L380.2 390.6 L377.2 376.3 L366.1 358.1 L337.0 322.4 L303.9 294.2 L287.8 271.8 L259.5 257.1 L253.5 248.3 L258.5 226.0 L241.7 217.6 L222.2 200.1 L214.0 175.0 L196.2 172.1 L177.1 153.1 L161.6 135.6 L160.2 124.4 L142.4 97.2 L130.8 69.6 L131.3 55.8 L107.4 41.5 L96.4 43.1 L77.6 33.2 L72.3 47.8 L77.7 65.1 L80.9 92.1 L92.3 106.9 L116.7 131.8 L122.2 140.2 L127.2 142.8 L131.5 155.2 L137.4 154.7 L144.0 177.9 L154.0 187.0 L161.1 199.8 L181.8 218.1 L192.7 251.6 L202.5 267.4 L211.7 284.3 L213.5 303.2 L229.4 304.4 L242.6 320.8 L254.6 336.9 L253.8 343.3 L239.9 356.5 L234.1 356.4 L225.4 334.5 L203.8 314.0 L180.0 296.6 L163.1 287.4 L164.2 261.1 L159.2 241.6 L143.5 230.4 L120.8 214.3 L116.5 219.0 L108.2 209.6 L87.8 200.9 L68.4 180.0 L70.8 177.2 L84.4 179.3 L96.6 165.8 L97.8 149.6 L72.4 123.9 L53.1 113.9 L40.9 91.5 L28.7 67.8 L13.4 39.1 L0.0 6.7 Z'

// Constantes de la proyección, calculadas del mismo polígono.
const LON0 = -117.127760
const LAT1 = 32.720830
const K = 0.91615417
const SX = 36.004992

/**
 * Lat/lng → coordenadas del `viewBox`. Devuelve `null` si el punto cae fuera
 * del lienzo: un destino de otro continente no se fuerza dentro del mapa, se
 * lista aparte.
 */
export function proyectar(lat: number, lng: number): { x: number; y: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const x = (lng - LON0) * K * SX
  const y = (LAT1 - lat) * SX
  if (x < 0 || y < 0 || x > MAPA_ANCHO || y > MAPA_ALTO) return null
  return { x, y }
}
