/**
 * Fechas altas de México y de la frontera, como función pura (ADR-0058).
 *
 * El calendario es determinista: festivos de ley y sus puentes (LFT art. 74),
 * Semana Santa desde Pascua, vacaciones SEP, Día de Muertos, Navidad. Unas
 * quince filas por año que cambian en un diff, no en una tabla. Cada fila trae
 * su `porque`, que es el "por qué" determinista que ve la agencia; la IA solo
 * redacta el "qué ofrezco" al clic.
 *
 * Las fechas LOCALES (Santa Rita, Expogan, Fiestas de Octubre) no están aquí:
 * nadie del proyecto las puede mantener honestamente. "Agregar mi fecha" es v2.
 *
 * Módulo hoja (regla de oro 11): solo tipos y funciones sobre datos.
 */

export const ALCANCES = ['nacional', 'frontera'] as const
export type Alcance = (typeof ALCANCES)[number]

export const ETIQUETA_ALCANCE: Record<Alcance, string> = {
  nacional: 'Nacional (México)',
  frontera: 'Frontera (El Paso / EE. UU.)',
}

export type TipoTemporada = 'puente' | 'festivo' | 'vacaciones' | 'comercial'

export type Temporada = {
  /** Estable entre años ("puente-feb"); con el año forma el id de la oportunidad. */
  clave: string
  nombre: string
  /** YYYY-MM-DD, inclusivo. */
  inicio: string
  /** YYYY-MM-DD, inclusivo. */
  fin: string
  tipo: TipoTemporada
  alcance: Alcance
  /** Una oración: por qué esta fecha mueve gente. */
  porque: string
}

const DIA_MS = 86_400_000

/** YYYY-MM-DD sin pasar por la zona horaria del servidor. */
export function fechaIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function aUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Suma días a una fecha ISO (negativos restan). */
export function sumarDias(iso: string, dias: number): string {
  const t = new Date(aUtc(iso) + dias * DIA_MS)
  return fechaIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Días de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA_MS)
}

/** 0 = domingo … 6 = sábado. */
function diaSemana(iso: string): number {
  return new Date(aUtc(iso)).getUTCDay()
}

/** El n-ésimo `diaSemana` del mes (1 = primero). */
function enesimo(anio: number, mes: number, dia: number, n: number): string {
  const primero = fechaIso(anio, mes, 1)
  const corrimiento = (dia - diaSemana(primero) + 7) % 7
  return sumarDias(primero, corrimiento + (n - 1) * 7)
}

/** El último `diaSemana` del mes. */
function ultimo(anio: number, mes: number, dia: number): string {
  const finMes = sumarDias(fechaIso(mes === 12 ? anio + 1 : anio, mes === 12 ? 1 : mes + 1, 1), -1)
  return sumarDias(finMes, -((diaSemana(finMes) - dia + 7) % 7))
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function pascua(anio: number): string {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return fechaIso(anio, mes, dia)
}

/** Fin de semana largo que termina en `lunes`: sábado, domingo y lunes. */
function puente(lunes: string): { inicio: string; fin: string } {
  return { inicio: sumarDias(lunes, -2), fin: lunes }
}

const LUNES = 1
const JUEVES = 4

/** Las temporadas de un año, ordenadas por inicio. */
export function temporadas(anio: number): Temporada[] {
  const pas = pascua(anio)
  const filas: Temporada[] = [
    {
      clave: 'puente-feb',
      nombre: 'Puente de febrero (Constitución)',
      ...puente(enesimo(anio, 2, LUNES, 1)),
      tipo: 'puente',
      alcance: 'nacional',
      porque: 'El 5 de febrero se recorre al primer lunes del mes (LFT art. 74): tres días sin trabajo ni escuela.',
    },
    {
      clave: 'san-valentin',
      nombre: 'Día del amor y la amistad',
      inicio: fechaIso(anio, 2, 14),
      fin: fechaIso(anio, 2, 14),
      tipo: 'comercial',
      alcance: 'nacional',
      porque: 'Escapadas en pareja: cabañas, cena y una noche fuera se venden solas.',
    },
    {
      clave: 'puente-mar',
      nombre: 'Puente de marzo (Benito Juárez)',
      ...puente(enesimo(anio, 3, LUNES, 3)),
      tipo: 'puente',
      alcance: 'nacional',
      porque: 'El 21 de marzo se recorre al tercer lunes del mes (LFT art. 74): fin de semana largo de primavera.',
    },
    {
      clave: 'semana-santa',
      nombre: 'Semana Santa y Pascua',
      inicio: sumarDias(pas, -7),
      fin: sumarDias(pas, 7),
      tipo: 'vacaciones',
      alcance: 'nacional',
      porque: 'Dos semanas de vacaciones escolares (SEP) y la salida familiar más grande del año.',
    },
    {
      clave: 'dia-trabajo',
      nombre: 'Día del Trabajo',
      inicio: fechaIso(anio, 5, 1),
      fin: fechaIso(anio, 5, 1),
      tipo: 'festivo',
      alcance: 'nacional',
      porque: 'Festivo de ley; si cae junto al fin de semana, la gente lo alarga.',
    },
    {
      clave: 'dia-madres',
      nombre: 'Día de las Madres',
      inicio: fechaIso(anio, 5, 10),
      fin: fechaIso(anio, 5, 10),
      tipo: 'comercial',
      alcance: 'nacional',
      porque: 'Regalo de experiencia: un día de campo o un tour corto para llevar a mamá.',
    },
    {
      // ponytail: la SEP publica el calendario cada año; estas fechas son el
      // rango habitual. Si un año se corre, se ajusta aquí.
      clave: 'verano',
      nombre: 'Vacaciones de verano',
      inicio: fechaIso(anio, 7, 15),
      fin: fechaIso(anio, 8, 24),
      tipo: 'vacaciones',
      alcance: 'nacional',
      porque: 'Seis semanas sin escuela: viajes largos y familias completas.',
    },
    {
      clave: 'independencia',
      nombre: 'Fiestas Patrias',
      inicio: fechaIso(anio, 9, 16),
      fin: fechaIso(anio, 9, 16),
      tipo: 'festivo',
      alcance: 'nacional',
      porque: 'El 16 de septiembre NO se recorre; cuando cae en martes o jueves la gente hace su propio puente.',
    },
    {
      clave: 'muertos',
      nombre: 'Día de Muertos',
      inicio: fechaIso(anio, 11, 1),
      fin: fechaIso(anio, 11, 2),
      tipo: 'festivo',
      alcance: 'nacional',
      porque: 'Fechas de identidad: pueblos mágicos, panteones y cocina tradicional se llenan.',
    },
    {
      clave: 'puente-nov',
      nombre: 'Puente de noviembre (Revolución)',
      ...puente(enesimo(anio, 11, LUNES, 3)),
      tipo: 'puente',
      alcance: 'nacional',
      porque: 'El 20 de noviembre se recorre al tercer lunes del mes (LFT art. 74): el último puente del año.',
    },
    {
      clave: 'guadalupe',
      nombre: 'Día de la Virgen de Guadalupe',
      inicio: fechaIso(anio, 12, 12),
      fin: fechaIso(anio, 12, 12),
      tipo: 'festivo',
      alcance: 'nacional',
      porque: 'Peregrinaciones y viajes religiosos; arranca el ánimo de fin de año.',
    },
    {
      clave: 'invierno',
      nombre: 'Vacaciones de invierno',
      inicio: fechaIso(anio, 12, 20),
      fin: fechaIso(anio + 1, 1, 6),
      tipo: 'vacaciones',
      alcance: 'nacional',
      porque: 'Navidad, Año Nuevo y Reyes sin escuela: familias que viajan y paisanos que regresan.',
    },
    // ── Frontera: Border vende a fronterizos; el calendario de El Paso manda ──
    {
      // ponytail: EPISD y UTEP suelen coincidir en la semana del tercer lunes
      // de marzo. Si un año difieren, se ajusta aquí.
      clave: 'spring-break',
      nombre: 'Spring Break (El Paso)',
      inicio: sumarDias(enesimo(anio, 3, LUNES, 3), -2),
      fin: sumarDias(enesimo(anio, 3, LUNES, 3), 6),
      tipo: 'vacaciones',
      alcance: 'frontera',
      porque: 'Una semana sin escuela en El Paso: familias fronterizas buscan qué hacer del otro lado.',
    },
    {
      clave: 'memorial-day',
      nombre: 'Memorial Day',
      ...puente(ultimo(anio, 5, LUNES)),
      tipo: 'puente',
      alcance: 'frontera',
      porque: 'Fin de semana largo en EE. UU. que abre el verano.',
    },
    {
      clave: 'july-4',
      nombre: 'Independence Day (4 de julio)',
      inicio: fechaIso(anio, 7, 4),
      fin: fechaIso(anio, 7, 4),
      tipo: 'festivo',
      alcance: 'frontera',
      porque: 'Festivo federal; pegado al fin de semana se vuelve puente para El Paso.',
    },
    {
      clave: 'labor-day',
      nombre: 'Labor Day',
      ...puente(enesimo(anio, 9, LUNES, 1)),
      tipo: 'puente',
      alcance: 'frontera',
      porque: 'Fin de semana largo en EE. UU. que cierra el verano.',
    },
    {
      clave: 'thanksgiving',
      nombre: 'Thanksgiving',
      inicio: enesimo(anio, 11, JUEVES, 4),
      fin: sumarDias(enesimo(anio, 11, JUEVES, 4), 3),
      tipo: 'festivo',
      alcance: 'frontera',
      porque: 'Cuatro días (jueves a domingo) en que El Paso viaja en familia.',
    },
  ]
  return filas.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
}
