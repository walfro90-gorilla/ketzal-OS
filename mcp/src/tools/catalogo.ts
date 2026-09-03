/** Catálogo: servicios, sus salidas, y búsqueda global. */
import { KetzalError } from '../errors.js'
import { insert, q, rpc, select, update } from '../rest.js'
import { getAuthUser } from '../session.js'
import { verificarVideo, videoEmbedUrl, type VideoInfo } from '../video.js'
import type { ToolDef } from './tipos.js'
import { z } from 'zod'

// ── Búsqueda global ──────────────────────────────────────────────────
// Mismo RPC que la paleta ⌘K de la app (`src/app/(ops)/buscar-actions.ts`).
// Es SECURITY INVOKER: la RLS decide qué ve esta sesión, aquí no se filtra nada.

type Resultado = {
  type: 'cliente' | 'venta' | 'cotizacion' | 'servicio' | 'proveedor'
  id: string
  label: string
  sublabel: string
  href: string
}

async function buscar(a: Record<string, unknown>) {
  const texto = String(a.q ?? '').trim()
  if (texto.length < 2) {
    throw new KetzalError('Escribe al menos 2 caracteres para buscar.')
  }
  const filas = await rpc<Resultado[] | null>('global_search', { p_q: texto })
  const resultados = filas ?? []
  return {
    consulta: texto,
    num: resultados.length,
    resultados,
    nota: resultados.length
      ? 'El campo `id` de cada resultado es el que piden las demás herramientas (venta, cliente, servicio).'
      : 'Sin coincidencias. Puede ser que no exista, o que pertenezca a otra agencia (la RLS no la muestra).',
  }
}

// ── Servicios ────────────────────────────────────────────────────────
// Lectura directa de tabla: la RLS acota a la agencia dueña (el superadmin ve
// todo el catálogo). Mismas columnas que `/servicios`.

const CAMPOS_LISTA =
  'id,name,price,service_type,state_to,city_to,max_capacity,transport_type,published,supplier_id'
// El detalle trae TODO lo que `ketzal_editar_servicio` puede escribir. No es
// exhaustividad: `itinerary`/`faqs`/`packs` se reemplazan enteros al editar, así
// que sin poder leerlos primero una edición parcial los borra. `faqs` es el caso
// terminal — la app web no tiene editor de FAQs, el MCP es el único que las
// escribe. `images` va para poder ver si un servicio tiene banner antes de
// publicarlo (un publicado sin foto ya pasó dos veces).
const CAMPOS_DETALLE =
  `${CAMPOS_LISTA},description,packs,includes,excludes,available_from,available_to,` +
  'state_from,city_from,itinerary,faqs,add_ons,yt_link,images'

type SalidaRow = {
  id: string
  departs_on: string
  max_capacity: number
  seats_taken: number
  note: string | null
  price_pct: number | null
  pack_price_overrides: Record<string, number> | null
}

/**
 * Nombre de cada agencia por id. Una sola llamada, no una por servicio: con un
 * superadmin multi-agencia la lista de catálogo mezcla dueños y "el tour de
 * Creel" es ambiguo. NO se resuelve con embed de PostgREST: `services` tiene 3
 * FKs a `suppliers` (PGRST201) y `suppliers_read` no deja ver agencias ajenas.
 * Mismo camino que `servicios/page.tsx`.
 */
async function nombresDeAgencia(): Promise<Map<string, string>> {
  const filas = await rpc<{ id: string; name: string }[]>('list_agency_names').catch(() => null)
  return new Map((filas ?? []).map((f) => [f.id, f.name]))
}

async function servicios(a: Record<string, unknown>) {
  const id = typeof a.servicio_id === 'string' ? a.servicio_id.trim() : ''

  if (id) {
    const [filas, salidas, agencias] = await Promise.all([
      select<Record<string, unknown>[]>('services', `select=${CAMPOS_DETALLE}&id=eq.${q(id)}`),
      select<SalidaRow[]>(
        'service_departures',
        `select=id,departs_on,max_capacity,seats_taken,note,price_pct,pack_price_overrides` +
          `&service_id=eq.${q(id)}&order=departs_on`,
      ),
      nombresDeAgencia(),
    ])
    const servicio = filas[0]
    if (!servicio) {
      throw new KetzalError(
        'No existe ese servicio, o es de otra agencia y la RLS no te lo muestra.',
      )
    }
    const imgs = (servicio.images ?? {}) as { imgBanner?: unknown; imgAlbum?: unknown }
    return {
      servicio: {
        ...servicio,
        agencia: agencias.get(String(servicio.supplier_id)) ?? null,
        // `images` cruda es ruido (URLs largas); lo accionable es si hay foto.
        images: undefined,
        fotos: {
          banner: typeof imgs.imgBanner === 'string' ? imgs.imgBanner : null,
          galeria: Array.isArray(imgs.imgAlbum) ? imgs.imgAlbum.length : 0,
        },
      },
      salidas: salidas.map((s) => ({
        ...s,
        // Lugares libres: misma derivación que `listarSalidas` en la app.
        lugares_libres: Math.max(0, s.max_capacity - s.seats_taken),
        price_pct: Number(s.price_pct ?? 0),
      })),
      nota:
        'El precio del servicio es el "desde" (pack más barato). `price_pct` es el ajuste ' +
        'de temporada de esa salida en %: 0 = precio normal. OJO al editar: `paquetes`, ' +
        '`incluye`, `no_incluye`, `itinerario` y `preguntas` se REEMPLAZAN enteros — ' +
        'manda de vuelta lo que ves aquí más tus cambios, o se pierde lo que omitas.',
    }
  }

  const limite = Math.min(200, Math.max(1, Number(a.limite ?? 50)))
  const filtros = [`select=${CAMPOS_LISTA}`, 'order=name', `limit=${limite}`]
  const texto = typeof a.texto === 'string' ? a.texto.trim() : ''
  if (texto) filtros.push(`name=ilike.${q(`*${texto}*`)}`)
  if (typeof a.publicado === 'boolean') {
    // `published` es null en servicios viejos y el catálogo público sólo sirve
    // `= true`, así que "no publicado" es el complemento, no `is.false`.
    filtros.push(a.publicado ? 'published=is.true' : 'published=not.is.true')
  }
  const agenciaId = typeof a.agencia_id === 'string' ? a.agencia_id.trim() : ''
  if (agenciaId) filtros.push(`supplier_id=eq.${q(agenciaId)}`)

  const [lista, agencias] = await Promise.all([
    select<Record<string, unknown>[]>('services', filtros.join('&')),
    nombresDeAgencia(),
  ])
  return {
    num: lista.length,
    servicios: lista.map((s) => ({
      ...s,
      agencia: agencias.get(String(s.supplier_id)) ?? null,
    })),
    nota:
      lista.length === limite
        ? `Se cortó en el límite de ${limite}. Acota con \`texto\` o sube \`limite\`.`
        : 'Pasa `servicio_id` para ver el detalle y las salidas (fechas y cupo) de uno.',
  }
}

async function publicar(a: Record<string, unknown>) {
  const id = String(a.servicio_id ?? '').trim()
  if (!id) throw new KetzalError('Falta `servicio_id`.')
  const publicado = a.publicado === true

  // RLS: sólo la agencia dueña (o superadmin). Sin filas devueltas = bloqueado,
  // igual que el `.select('id').single()` de `setServicioPublicado` en la app.
  const filas = await update<{ id: string; name: string; published: boolean }>(
    'services',
    `id=eq.${q(id)}&select=id,name,published`,
    { published: publicado },
  )
  if (!filas.length) {
    throw new KetzalError(
      'No se pudo cambiar la publicación: el servicio no existe o es de otra agencia.',
    )
  }
  return {
    ...filas[0],
    nota: publicado
      ? 'Publicado: ya aparece en /explora y en su ficha pública, visible para cualquiera.'
      : 'Despublicado: sale del catálogo público. Las ventas ya hechas no se tocan.',
  }
}

// ── Alta y edición de servicios ──────────────────────────────────────
//
// Réplica mínima de `normalizarCampos` / `normalizarSalida` de
// `src/app/(ops)/servicios/actions.ts` y de `src/lib/domain/packs.ts`. La fuente
// de verdad vive en la app; aquí se copia porque este paquete se publica a npm y
// no puede importar del árbol de Next (mismo criterio que `errors.ts`, que es
// calco de `src/lib/errors.ts`).
//
// A diferencia de la app, la edición es PARCIAL: sólo viajan los campos que el
// agente mandó. Un LLM que manda medio formulario no borra la descripción, el
// itinerario ni los paquetes del resto.

const PACKS = [
  { key: 'sencilla', label: 'Sencilla (1 persona)' },
  { key: 'doble', label: 'Doble (2 personas)' },
  { key: 'triple', label: 'Triple (3 personas)' },
  { key: 'cuadruple', label: 'Cuádruple (4 personas)' },
] as const

type PackKey = (typeof PACKS)[number]['key']
type Pack = { key: PackKey; label: string; price: number }

const TIPOS = ['tour', 'paquete', 'transporte', 'hospedaje', 'actividad'] as const
const TRANSPORTES = ['autobus', 'sprinter', 'van', 'avion'] as const

/** Valida tipo y precio, deduplica y devuelve en orden canónico. El label lo sella aquí. */
export function limpiarPacks(entrada?: { tipo: string; precio: number }[]): Pack[] {
  const porTipo = new Map<PackKey, Pack>()
  for (const p of entrada ?? []) {
    const def = PACKS.find((t) => t.key === p?.tipo)
    if (!def) continue
    const precio = Number(p?.precio)
    if (!Number.isFinite(precio) || precio < 0) continue
    porTipo.set(def.key, { key: def.key, label: def.label, price: Math.round(precio * 100) / 100 })
  }
  return PACKS.map((t) => porTipo.get(t.key)).filter((p): p is Pack => p != null)
}

const txt = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s || null
}

const lineas = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean)

/** Fecha AAAA-MM-DD → ISO anclado al mediodía local (evita el corrimiento de día por TZ). */
function fechaAIso(fecha: unknown): string | null {
  const f = txt(fecha)
  if (!f) return null
  const d = new Date(`${f}T12:00:00`)
  if (Number.isNaN(d.getTime())) {
    throw new KetzalError(`Fecha inválida: ${f}. Usa el formato AAAA-MM-DD.`)
  }
  return d.toISOString()
}

/** Valida una fecha de calendario real (rechaza 2026-02-31), sin depender de la TZ. */
export function fechaSolo(fecha: unknown): string {
  const f = txt(fecha) ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    throw new KetzalError(`Fecha inválida: ${f || '(vacía)'}. Usa el formato AAAA-MM-DD.`)
  }
  const d = new Date(`${f}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) {
    throw new KetzalError(`Esa fecha no existe: ${f}.`)
  }
  return f
}

/** Hoy en local (AAAA-MM-DD): una salida nueva no puede nacer en el pasado. */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Sólo los campos que el agente mandó. `undefined` = no lo toques. */
export function patchServicio(a: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if (a.nombre !== undefined) {
    const n = String(a.nombre).trim()
    if (!n) throw new KetzalError('El nombre del servicio no puede quedar vacío.')
    p.name = n
  }
  if (a.descripcion !== undefined) p.description = txt(a.descripcion)
  if (a.video !== undefined) {
    const v = txt(a.video)
    if (v && !videoEmbedUrl(v)) {
      throw new KetzalError(
        `No es un video de YouTube ni de Vimeo: ${v}. Usa la liga normal ` +
          '(youtube.com/watch?v=…, youtu.be/… o vimeo.com/…).',
      )
    }
    p.yt_link = v
  }
  if (a.tipo !== undefined) p.service_type = txt(a.tipo)
  if (a.origen_estado !== undefined) p.state_from = txt(a.origen_estado)
  if (a.origen_ciudad !== undefined) p.city_from = txt(a.origen_ciudad)
  if (a.destino_estado !== undefined) p.state_to = txt(a.destino_estado)
  if (a.destino_ciudad !== undefined) p.city_to = txt(a.destino_ciudad)
  if (a.cupo !== undefined) {
    const c = Number(a.cupo)
    if (!Number.isInteger(c) || c < 1) {
      throw new KetzalError('El cupo debe ser un entero mayor a 0.')
    }
    p.max_capacity = c
  }
  // Sólo los 4 tipos con preset habilitan el mapa de asientos; null = sin mapa.
  if (a.transporte !== undefined) p.transport_type = a.transporte ?? null
  if (a.disponible_desde !== undefined) p.available_from = fechaAIso(a.disponible_desde)
  if (a.disponible_hasta !== undefined) p.available_to = fechaAIso(a.disponible_hasta)
  if (a.incluye !== undefined) p.includes = lineas(a.incluye)
  if (a.no_incluye !== undefined) p.excludes = lineas(a.no_incluye)
  if (a.itinerario !== undefined) {
    p.itinerary = (Array.isArray(a.itinerario) ? a.itinerario : [])
      .map((d) => ({
        title: String((d as { titulo?: unknown })?.titulo ?? '').trim(),
        description: String((d as { descripcion?: unknown })?.descripcion ?? '').trim(),
      }))
      .filter((d) => d.title !== '')
  }
  if (a.preguntas !== undefined) {
    p.faqs = (Array.isArray(a.preguntas) ? a.preguntas : [])
      .map((f) => ({
        question: String((f as { pregunta?: unknown })?.pregunta ?? '').trim(),
        answer: String((f as { respuesta?: unknown })?.respuesta ?? '').trim(),
      }))
      .filter((f) => f.question !== '')
  }
  if (a.paquetes !== undefined) {
    const packs = limpiarPacks(a.paquetes as { tipo: string; precio: number }[])
    p.packs = packs
    // b046: el precio público ("desde") se DERIVA del pack más barato. No hay
    // campo manual que se desincronice.
    p.price = packs.length ? Math.min(...packs.map((x) => x.price)) : 0
  }
  return p
}

/** b057: precios especiales por paquete en una salida. `null` = ninguno (usa sólo el %). */
export function normalizarOverrides(input: unknown): Record<string, number> | null {
  if (input == null) return null
  const limpio: Record<string, number> = {}
  for (const [key, valor] of Object.entries(input as Record<string, unknown>)) {
    if (valor == null || valor === '') continue
    if (!PACKS.some((t) => t.key === key)) {
      throw new KetzalError(`Paquete inválido: ${key}. Son sencilla, doble, triple o cuadruple.`)
    }
    const n = Number(valor)
    if (!Number.isFinite(n) || n <= 0) {
      throw new KetzalError('El precio especial debe ser un número mayor a 0.')
    }
    limpio[key] = Math.round(n * 100) / 100
  }
  return Object.keys(limpio).length ? limpio : null
}

export function patchSalida(a: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if (a.fecha !== undefined) p.departs_on = fechaSolo(a.fecha)
  if (a.cupo !== undefined) {
    const c = Number(a.cupo)
    if (!Number.isInteger(c) || c < 1) {
      throw new KetzalError('El cupo debe ser un entero mayor a 0.')
    }
    p.max_capacity = c
  }
  if (a.nota !== undefined) p.note = txt(a.nota)
  if (a.ajuste_pct !== undefined) {
    const pct = Number(a.ajuste_pct ?? 0)
    if (!Number.isFinite(pct) || pct <= -100 || pct > 500) {
      throw new KetzalError('El ajuste de precio debe estar entre -99% y 500%.')
    }
    p.price_pct = Math.round(pct * 100) / 100
  }
  if (a.precios_por_paquete !== undefined) {
    p.pack_price_overrides = normalizarOverrides(a.precios_por_paquete)
  }
  return p
}

const CAMPOS_SALIDA =
  'id,service_id,departs_on,max_capacity,seats_taken,note,price_pct,pack_price_overrides'

/** La unique (service_id, departs_on) llega como 23505 genérico: se chequea antes. */
async function chocaFecha(serviceId: string, fecha: string, exceptoId?: string) {
  const filtro =
    `select=id&service_id=eq.${q(serviceId)}&departs_on=eq.${q(fecha)}` +
    (exceptoId ? `&id=neq.${q(exceptoId)}` : '')
  const filas = await select<{ id: string }[]>('service_departures', filtro)
  if (filas.length) {
    throw new KetzalError(`Ya existe una salida el ${fecha} para este servicio.`)
  }
}

async function crearServicio(args: Record<string, unknown>) {
  const a = esquemaCrearServicio.parse(args)
  const patch = patchServicio(a as unknown as Record<string, unknown>)

  let agencia = a.agencia_id?.trim() || null
  if (!agencia) {
    const user = await getAuthUser()
    const perfil = await select<{ supplier_id: string | null }[]>(
      'profiles',
      `select=supplier_id&id=eq.${q(user.id)}`,
    )
    agencia = perfil[0]?.supplier_id ?? null
  }
  if (!agencia) {
    throw new KetzalError(
      'Falta `agencia_id`: tu cuenta no tiene agencia propia. Corre ketzal_agencias y ' +
        'pasa el id de la agencia dueña del servicio.',
    )
  }

  const fila = await insert<Record<string, unknown>>('services', {
    ...patch,
    supplier_id: agencia,
    // NOT NULL sin default; se deriva de los paquetes cuando los hay.
    price: patch.price ?? 0,
    current_bookings: 0,
    published: false,
  })

  return {
    servicio: fila,
    nota:
      'Creado SIN publicar: no aparece en el catálogo público hasta que corras ' +
      'ketzal_publicar_servicio. Las fotos van con ketzal_subir_fotos y el video ' +
      'con el campo `video` de ketzal_editar_servicio. El precio "desde" ' +
      'se deriva del paquete más barato: sin paquetes queda en $0.',
  }
}

async function editarServicio(args: Record<string, unknown>) {
  const a = esquemaEditarServicio.parse(args)
  const patch = patchServicio(a as unknown as Record<string, unknown>)
  if (!Object.keys(patch).length) {
    throw new KetzalError('No mandaste ningún campo que cambiar.')
  }

  // El formato ya lo validó `patchServicio`; esto pregunta si el video EXISTE y de
  // quién es, para que no acabe un reproductor muerto —o de la competencia— en una
  // ficha pública. Se hace antes del UPDATE: un 404 no debe llegar a la BD.
  let video: VideoInfo | null = null
  if (typeof patch.yt_link === 'string' && patch.yt_link) {
    const embed = videoEmbedUrl(patch.yt_link)!
    try {
      video = await verificarVideo(embed)
    } catch (e) {
      throw new KetzalError(
        `No se guardó el video: ${(e as Error).message}. Verifica la liga y vuelve a intentar.`,
      )
    }
  }

  const filas = await update<Record<string, unknown>>(
    'services',
    `id=eq.${q(a.servicio_id.trim())}&select=${CAMPOS_DETALLE}`,
    patch,
  )
  if (!filas.length) {
    throw new KetzalError('No se pudo editar: el servicio no existe o es de otra agencia.')
  }
  return {
    servicio: filas[0],
    cambiados: Object.keys(patch),
    // Se devuelve el dueño del video para que el agente pueda cumplir lo que el
    // schema le pide: que no sea de una agencia competidora. Sin esto tendría que
    // creerle a la liga.
    ...(video ? { video: { ...video, revisa: 'Confirma que el canal no sea de una agencia competidora.' } } : {}),
    nota:
      'Sólo se tocaron los campos que mandaste; el resto quedó igual. Ojo: `paquetes` ' +
      'reemplaza la lista completa, no la mezcla — manda todos los que deba tener.',
  }
}

async function crearSalida(args: Record<string, unknown>) {
  const a = esquemaCrearSalida.parse(args)
  const servicio = a.servicio_id.trim()
  const patch = patchSalida(a as unknown as Record<string, unknown>)
  const fecha = patch.departs_on as string

  if (fecha < hoyLocal()) {
    throw new KetzalError('La fecha de salida no puede ser en el pasado.')
  }
  await chocaFecha(servicio, fecha)

  const fila = await insert<Record<string, unknown>>('service_departures', {
    service_id: servicio,
    ...patch,
  })
  return {
    salida: fila,
    nota: 'El cupo de la salida es el que manda para las ventas de esa fecha.',
  }
}

async function editarSalida(args: Record<string, unknown>) {
  const a = esquemaEditarSalida.parse(args)
  const id = a.salida_id.trim()
  const patch = patchSalida(a as unknown as Record<string, unknown>)
  if (!Object.keys(patch).length) {
    throw new KetzalError('No mandaste ningún campo que cambiar.')
  }

  const actuales = await select<
    { id: string; service_id: string; seats_taken: number; departs_on: string }[]
  >('service_departures', `select=${CAMPOS_SALIDA}&id=eq.${q(id)}`)
  const actual = actuales[0]
  if (!actual) {
    throw new KetzalError('No existe esa salida, o es de otra agencia.')
  }

  // CHECK seats_taken <= max_capacity: mejor decirlo con el número que ya vendió.
  if (patch.max_capacity !== undefined && Number(patch.max_capacity) < actual.seats_taken) {
    throw new KetzalError(
      `El cupo no puede quedar por debajo de los ${actual.seats_taken} lugares ya vendidos.`,
    )
  }
  if (patch.departs_on !== undefined && patch.departs_on !== actual.departs_on) {
    await chocaFecha(actual.service_id, patch.departs_on as string, id)
  }

  const filas = await update<Record<string, unknown>>(
    'service_departures',
    `id=eq.${q(id)}&select=${CAMPOS_SALIDA}`,
    patch,
  )
  if (!filas.length) {
    throw new KetzalError('No se pudo editar la salida: es de otra agencia.')
  }
  return { salida: filas[0], cambiados: Object.keys(patch) }
}

// ── Esquemas ─────────────────────────────────────────────────────────

const campoPaquetes = z
  .array(
    z.object({
      tipo: z.enum(PACKS.map((p) => p.key) as [PackKey, ...PackKey[]]),
      precio: z.number().min(0).describe('Precio POR PERSONA en MXN con esa ocupación.'),
    }),
  )
  .describe(
    'Precios por tipo de habitación. Reemplaza la lista completa. El precio público ' +
      '"desde" del servicio se deriva del más barato.',
  )

const camposServicio = {
  descripcion: z.string().nullish().describe('Descripción larga del viaje.'),
  video: z
    .string()
    .nullish()
    .describe(
      'Liga de YouTube o Vimeo que se muestra en la ficha pública. null lo quita. ' +
        'Verifica que el video exista y NO sea de una agencia competidora antes de ponerlo.',
    ),
  tipo: z.enum(TIPOS).nullish().describe('Tipo de servicio.'),
  origen_estado: z.string().nullish(),
  origen_ciudad: z.string().nullish().describe('Ciudad de salida (ej. Ciudad Juárez).'),
  destino_estado: z.string().nullish(),
  destino_ciudad: z.string().nullish().describe('Ciudad destino (ej. Creel).'),
  cupo: z.number().int().min(1).optional().describe('Cupo por default del viaje.'),
  transporte: z
    .enum(TRANSPORTES)
    .nullish()
    .describe('Habilita el mapa de asientos. null = sin mapa.'),
  disponible_desde: z.string().nullish().describe('AAAA-MM-DD.'),
  disponible_hasta: z.string().nullish().describe('AAAA-MM-DD.'),
  incluye: z.array(z.string()).optional().describe('Conceptos incluidos, uno por elemento.'),
  no_incluye: z.array(z.string()).optional().describe('Conceptos NO incluidos.'),
  itinerario: z
    .array(z.object({ titulo: z.string(), descripcion: z.string().optional() }))
    .optional()
    .describe('Día por día. Un elemento por día, con título y detalle.'),
  preguntas: z
    .array(z.object({ pregunta: z.string(), respuesta: z.string().optional() }))
    .optional()
    .describe('Preguntas frecuentes que se pintan en la ficha pública.'),
  paquetes: campoPaquetes.optional(),
}

const esquemaCrearServicio = z.object({
  nombre: z.string().min(1).describe('Nombre del viaje o paquete.'),
  agencia_id: z
    .string()
    .optional()
    .describe('Agencia dueña. Por default la tuya; obligatorio si eres superadmin sin agencia.'),
  ...camposServicio,
})

const esquemaEditarServicio = z.object({
  servicio_id: z.string().describe('Id del servicio a editar.'),
  nombre: z.string().optional(),
  ...camposServicio,
})

const camposSalida = {
  nota: z.string().nullish().describe('Nota interna de la salida (ej. "sale 6am de la central").'),
  ajuste_pct: z
    .number()
    .optional()
    .describe('Temporada: % sobre el precio del servicio. 0 = normal, 25 = alta, -10 = promo.'),
  precios_por_paquete: z
    .record(z.string(), z.number())
    .nullish()
    .describe(
      'Precio especial por paquete SÓLO en esta salida; pisa el ajuste %. ' +
        'Ej. {"doble": 2699}. null = quitarlos.',
    ),
}

const esquemaCrearSalida = z.object({
  servicio_id: z.string().describe('Servicio al que se le agrega la fecha.'),
  fecha: z.string().describe('Fecha de salida AAAA-MM-DD. No puede ser en el pasado.'),
  cupo: z.number().int().min(1).describe('Lugares disponibles en esa fecha.'),
  ...camposSalida,
})

const esquemaEditarSalida = z.object({
  salida_id: z.string().describe('Id de la salida a editar.'),
  fecha: z.string().optional(),
  cupo: z.number().int().min(1).optional(),
  ...camposSalida,
})

export const tools: ToolDef[] = [
  {
    name: 'ketzal_buscar',
    title: 'Buscar en Ketzal',
    description:
      'Buscador global por texto libre: encuentra ventas, cotizaciones, clientes, ' +
      'servicios y proveedores. Es la puerta de entrada cuando el usuario menciona algo ' +
      'por nombre ("la venta de Meny", "el tour a Creel") y no tienes el id: búscalo aquí ' +
      'primero y usa el id que devuelve en las demás herramientas.',
    inputSchema: z.object({
      q: z.string().describe('Texto a buscar (mínimo 2 caracteres): nombre, folio, servicio.'),
    }),
    handler: buscar,
  },
  {
    name: 'ketzal_servicios',
    title: 'Catálogo de servicios',
    description:
      'Catálogo de viajes y paquetes de la agencia (la RLS acota a los tuyos; el superadmin ' +
      've todos, con el nombre de la agencia dueña en cada fila). Sin argumentos lista el ' +
      'catálogo; con `servicio_id` devuelve el detalle COMPLETO —incluidos itinerario, ' +
      'preguntas frecuentes, paquetes, video y si tiene banner— más sus salidas con fecha, ' +
      'cupo y lugares libres. **Léelo siempre antes de editar**: las listas se reemplazan ' +
      'enteras, así que editar sin leer borra lo que no reenvíes.',
    inputSchema: z.object({
      servicio_id: z
        .string()
        .optional()
        .describe('Id del servicio: devuelve su detalle y sus salidas en vez de la lista.'),
      texto: z.string().optional().describe('Filtra la lista por nombre (búsqueda parcial).'),
      publicado: z
        .boolean()
        .optional()
        .describe('true = sólo los publicados en el catálogo público; false = sólo los que no.'),
      agencia_id: z
        .string()
        .optional()
        .describe('Filtra por agencia dueña (útil si eres superadmin y ves varias).'),
      limite: z.number().optional().describe('Máximo de servicios a devolver (1-200, default 50).'),
    }),
    handler: servicios,
  },
  {
    name: 'ketzal_publicar_servicio',
    title: 'Publicar o despublicar un servicio',
    description:
      'Prende o apaga la visibilidad de un servicio en el catálogo público (/explora y su ' +
      'ficha). Publicar lo hace visible a CUALQUIER visitante de internet, así que confirma ' +
      'con el usuario antes. No crea ni edita servicios: eso se hace en la app web.',
    write: true,
    destructive: true,
    idempotent: true,
    inputSchema: z.object({
      servicio_id: z.string().describe('Id del servicio a publicar o despublicar.'),
      publicado: z.boolean().describe('true = publicar en el catálogo público; false = quitarlo.'),
    }),
    handler: publicar,
  },
  {
    name: 'ketzal_crear_servicio',
    title: 'Crear un servicio',
    description:
      'Da de alta un viaje o paquete en el catálogo de la agencia: nombre, destino, cupo, ' +
      'qué incluye, itinerario y precios por tipo de habitación. Nace SIN publicar. ' +
      'Úsala cuando el usuario dicte un viaje nuevo (por ejemplo desde un flyer o un ' +
      'mensaje de WhatsApp). Las fechas de salida van aparte con ketzal_crear_salida, ' +
      'y las fotos se suben desde la app web.',
    write: true,
    inputSchema: esquemaCrearServicio,
    handler: crearServicio,
  },
  {
    name: 'ketzal_editar_servicio',
    title: 'Editar un servicio',
    description:
      'Cambia campos de un servicio existente. La edición es PARCIAL: sólo se tocan los ' +
      'campos que mandes, el resto queda intacto. Úsala para corregir precios, agregar ' +
      'conceptos incluidos o ajustar el itinerario. Ojo: `paquetes` reemplaza la lista ' +
      'completa de precios, no la mezcla.',
    write: true,
    inputSchema: esquemaEditarServicio,
    handler: editarServicio,
  },
  {
    name: 'ketzal_crear_salida',
    title: 'Agregar una fecha de salida',
    description:
      'Agrega una fecha de salida a un servicio, con su cupo. Es lo que hace que un mismo ' +
      'viaje se venda varias veces al año sin duplicar el servicio. Acepta ajuste de ' +
      'temporada en % y precios especiales por paquete sólo para esa fecha.',
    write: true,
    inputSchema: esquemaCrearSalida,
    handler: crearSalida,
  },
  {
    name: 'ketzal_editar_salida',
    title: 'Editar una fecha de salida',
    description:
      'Cambia la fecha, el cupo, la nota o el precio de temporada de una salida. Edición ' +
      'parcial. No deja bajar el cupo por debajo de los lugares ya vendidos.',
    write: true,
    inputSchema: esquemaEditarSalida,
    handler: editarSalida,
  },
]
