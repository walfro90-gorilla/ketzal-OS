/**
 * Proveedores (quintas, cabañas, transportistas, guías) y su tarifario.
 *
 * Son PROVEEDORES, no agencias: una agencia es un inquilino con roles e
 * invitaciones y se da de alta en la pantalla, solo por superadmin. Aquí el
 * proveedor cuelga de una agencia (`owner_supplier_id`) y la RLS decide quién
 * puede: el admin de esa agencia o el superadmin (b063, ADR-0056).
 *
 * El tarifario (`supplier_rate_cards.rates`, b097 / ADR-0055) es lo que hace
 * costeable a un proveedor desde el chat: sin tarifas, el costeo no tiene qué
 * sumar. Las unidades son las del motor de costeo (`src/lib/domain/costeo.ts`):
 *   pax        · por persona                       ⇒ costo · N
 *   grupo      · fijo por viaje, con cupo opcional  ⇒ costo · unidades(N)
 *   dia        · fijo por día (qty = días)          ⇒ costo · días · unidades(N)
 *   noche      · fijo por noche (qty = noches)      ⇒ costo · noches · unidades(N)
 *   habitacion · por habitación y noche, por pack   ⇒ costo_por_pack / ocupación · noches
 *
 * El paquete `mcp/` no importa de `src/`: el catálogo de estados se duplica
 * aquí a sabiendas (32 entidades, cambia cada década). Fuente:
 * `src/lib/domain/mexico.ts` (ADR-0057).
 */
import { KetzalError } from '../errors.js'
import { insert, q, select, update } from '../rest.js'
import { getAuthUser } from '../session.js'
import type { ToolDef } from './tipos.js'
import { z } from 'zod'

export const TIPOS_PROVEEDOR = ['transporte', 'hotel', 'otro'] as const
export const UNIDADES = ['pax', 'grupo', 'dia', 'noche', 'habitacion'] as const
export const PACKS = ['sencilla', 'doble', 'triple', 'cuadruple', 'cabana6', 'cabana8', 'cabana10', 'camping2', 'camping4'] as const

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
] as const

const MEXICO = 'México'

/** Minúsculas, sin acentos, sin signos: "Cabañas Rancho San Lorenzo" ≡ "cabanas rancho san lorenzo". */
export function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Misma regla que `slug()` de la app: key estable a partir del label. */
export function slug(label: string): string {
  return label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, '-')
}

/** ¿`b` es el mismo proveedor que `a`? Igual, o uno contiene al otro ("Rancho San Lorenzo" ⊂ "Cabañas Rancho San Lorenzo"). */
export function mismoNombre(a: string, b: string): boolean {
  const x = normalizarNombre(a)
  const y = normalizarNombre(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

const soloDigitos = (v?: string) => (v ?? '').replace(/\D/g, '') || undefined
const limpiar = (v?: string | null) => {
  const t = v?.trim()
  return t ? t : undefined
}

const esquemaPago = z
  .object({
    titular: z.string().optional().describe('A nombre de quién está la cuenta.'),
    banco: z.string().optional(),
    clabe: z.string().optional().describe('CLABE interbancaria de 18 dígitos.'),
    cuenta: z.string().optional().describe('Número de cuenta, para depósito en ventanilla.'),
    tarjeta: z.string().optional().describe('Tarjeta de débito, para depósito en cajero.'),
  })
  .optional()

export const esquemaCrear = z.object({
  nombre: z.string().min(2).describe('Nombre comercial tal como lo usa el proveedor.'),
  tipo: z
    .enum(TIPOS_PROVEEDOR)
    .describe('hotel = hospedaje (hotel, quinta, cabañas, campamento); transporte; otro (guía, restaurante, actividad). NUNCA agencia.'),
  subtipo: z.string().optional().describe('Detalle libre: "cabañas y camping", "quinta para eventos", "sprinter 20 pax", "guía certificado".'),
  telefono: z.string().optional().describe('Teléfono o WhatsApp. Se guardan solo los dígitos.'),
  email: z.string().optional(),
  ciudad: z.string().optional().describe('Localidad: "Basaseachi", "Creel", "Samalayuca".'),
  estado: z.enum(ESTADOS_MX).optional().describe('Entidad, solo si el país es México.'),
  pais: z.string().optional().describe('Default México.'),
  direccion: z.string().optional(),
  descripcion: z.string().optional().describe('Qué es y qué ofrece, en dos o tres líneas.'),
  condiciones: z
    .string()
    .optional()
    .describe('Condiciones de pago y cancelación del proveedor (anticipo, liquidación, penalizaciones). Lo que quien costea necesita saber antes de vender.'),
  sitio_web: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  especialidades: z.array(z.string()).optional().describe('Actividades o servicios: ["senderismo", "asador", "camping"].'),
  pago: esquemaPago.describe('Cómo se le paga al proveedor (SPEI, cuenta, tarjeta).'),
  agencia_id: z
    .string()
    .optional()
    .describe('Agencia dueña del proveedor. Solo hace falta si eres superadmin sin agencia propia; consíguela con ketzal_agencias.'),
  forzar: z
    .boolean()
    .optional()
    .describe('true = crear aunque ya exista uno con nombre parecido. Solo si la persona confirmó que es otro proveedor.'),
})

export type ArgsCrear = z.infer<typeof esquemaCrear>

/** La fila de `suppliers` a partir de los argumentos. Sin efectos. */
export function armarProveedor(a: ArgsCrear, owner: string): Record<string, unknown> {
  const nombre = a.nombre.trim()
  const telefono = soloDigitos(a.telefono)
  const email = limpiar(a.email)?.toLowerCase()
  if (!telefono && !email) {
    throw new KetzalError('Falta un contacto: teléfono (WhatsApp) o correo. La BD exige al menos uno.')
  }
  const pais = limpiar(a.pais) ?? MEXICO
  const esMexico = normalizarNombre(pais) === normalizarNombre(MEXICO) || normalizarNombre(pais) === 'mx'
  if (a.estado && !esMexico) {
    throw new KetzalError('`estado` solo aplica cuando el país es México; para otro país manda solo ciudad y país.')
  }
  const info: Record<string, unknown> = {}
  if (limpiar(a.descripcion)) info.about = limpiar(a.descripcion)
  if (limpiar(a.condiciones)) info.condiciones = limpiar(a.condiciones)
  if (limpiar(a.sitio_web)) info.website = limpiar(a.sitio_web)
  if (limpiar(a.instagram)) info.instagram = limpiar(a.instagram)
  if (limpiar(a.facebook)) info.facebook = limpiar(a.facebook)
  const tags = (a.especialidades ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20)
  if (tags.length) info.specialties = tags
  if (a.pago) {
    if (limpiar(a.pago.titular)) info.spei_titular = limpiar(a.pago.titular)
    if (limpiar(a.pago.banco)) info.spei_banco = limpiar(a.pago.banco)
    if (soloDigitos(a.pago.clabe)) info.spei_clabe = soloDigitos(a.pago.clabe)
    if (soloDigitos(a.pago.cuenta)) info.spei_cuenta = soloDigitos(a.pago.cuenta)
    if (soloDigitos(a.pago.tarjeta)) info.spei_tarjeta = soloDigitos(a.pago.tarjeta)
  }
  return {
    name: nombre,
    supplier_type: a.tipo,
    supplier_sub_type: limpiar(a.subtipo) ?? null,
    phone_number: telefono ?? null,
    contact_email: email ?? null,
    address: limpiar(a.direccion) ?? null,
    description: limpiar(a.descripcion) ?? null,
    city: limpiar(a.ciudad) ?? null,
    state: esMexico ? (a.estado ?? null) : null,
    country: esMexico ? MEXICO : pais,
    owner_supplier_id: owner,
    commission_rate: 0,
    info: Object.keys(info).length ? info : null,
  }
}

const esquemaTarifa = z.object({
  key: z.string().optional().describe('Clave estable; si falta se deriva del label. Misma key = misma tarifa (se actualiza).'),
  label: z.string().min(1).describe('"Cabaña 8 pax sin cocineta", "Sprinter 20", "Acceso al parque".'),
  unidad: z
    .enum(UNIDADES)
    .describe('pax | grupo | dia | noche | habitacion. Cabaña o quinta que cobra por noche = noche; renta por evento/día = dia; van por viaje = grupo; entrada por persona = pax.'),
  costo: z.number().min(0).optional().describe('MXN. Obligatorio salvo en habitacion.'),
  cupo: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Personas por unidad (cabaña para 8, sprinter de 20, vehículo de camping hasta 5). A más pax, más unidades.'),
  costo_por_pack: z
    .record(z.string(), z.number().positive())
    .optional()
    .describe('Solo habitacion: costo por noche por unidad según pack {sencilla, doble, triple, cuadruple, cabana6, cabana8, cabana10, camping2, camping4}. Una cabaña de 8 a $1,900 la noche va en cabana8: 1900.'),
})

export type TarifaIn = z.infer<typeof esquemaTarifa>
export type Tarifa = {
  key: string
  label: string
  unit: (typeof UNIDADES)[number]
  cost?: number
  cap?: number
  cost_by_pack?: Record<string, number>
}

/**
 * Valida y mezcla tarifas. `reemplazar` = false (default) conserva las que ya
 * había y pisa solo las que traen la misma key; así agregar una tarifa nunca
 * borra las demás. Misma forma que el CHECK `valid_rate_card` de la BD, para
 * que el error llegue en español y no como 23514.
 */
export function armarTarifas(entrada: TarifaIn[], existentes: Tarifa[], reemplazar = false): Tarifa[] {
  if (!entrada.length) throw new KetzalError('Manda al menos una tarifa.')
  const nuevas = new Map<string, Tarifa>()
  for (const t of entrada) {
    const label = t.label.trim()
    const key = (t.key?.trim() || slug(label)).slice(0, 60)
    if (!key) throw new KetzalError(`Tarifa sin clave ni label utilizable: ${JSON.stringify(t)}`)
    const fila: Tarifa = { key, label, unit: t.unidad }
    if (t.unidad === 'habitacion') {
      const packs = Object.entries(t.costo_por_pack ?? {})
      if (!packs.length) throw new KetzalError(`"${label}": una tarifa por habitación necesita costo_por_pack (sencilla, doble, triple o cuadruple).`)
      for (const [k] of packs) {
        if (!(PACKS as readonly string[]).includes(k)) {
          throw new KetzalError(`"${label}": pack desconocido "${k}". Son ${PACKS.join(', ')}.`)
        }
      }
      fila.cost_by_pack = Object.fromEntries(packs.map(([k, v]) => [k, Math.round(v * 100) / 100]))
    } else {
      if (t.costo == null) throw new KetzalError(`"${label}": falta el costo (MXN).`)
      fila.cost = Math.round(t.costo * 100) / 100
      if (t.unidad !== 'pax' && t.cupo != null) fila.cap = t.cupo
    }
    nuevas.set(key, fila)
  }
  if (reemplazar) return [...nuevas.values()]
  const mezcla = new Map(existentes.map((e) => [e.key, e]))
  for (const [k, v] of nuevas) mezcla.set(k, v)
  return [...mezcla.values()]
}

async function perfilActual(): Promise<{ id: string; role: string | null; supplier_id: string | null }> {
  const user = await getAuthUser()
  const filas = await select<{ role: string | null; supplier_id: string | null }[]>(
    'profiles',
    `select=role,supplier_id&id=eq.${q(user.id)}`,
  )
  return { id: user.id, role: filas[0]?.role ?? null, supplier_id: filas[0]?.supplier_id ?? null }
}

const CAMPOS = 'id,name,supplier_type,supplier_sub_type,phone_number,contact_email,city,state,country,owner_supplier_id,created_at'

type FilaProveedor = Record<string, unknown> & { id: string; name: string }

async function tarifasDe(proveedorId: string): Promise<Tarifa[]> {
  const filas = await select<{ rates: Tarifa[] | null }[]>(
    'supplier_rate_cards',
    `select=rates&supplier_id=eq.${q(proveedorId)}`,
  )
  return Array.isArray(filas[0]?.rates) ? filas[0]!.rates : []
}

export const tools: ToolDef[] = [
  {
    name: 'ketzal_proveedores',
    title: 'Proveedores y sus tarifarios',
    description:
      'Proveedores dados de alta (quintas, cabañas, transportistas, guías; NO agencias): nombre, tipo, ' +
      'contacto, ubicación y cuántas tarifas tienen. Con `texto` filtra por nombre; con `proveedor_id` ' +
      'devuelve el detalle completo, sus condiciones de pago y su tarifario. Úsala ANTES de crear un ' +
      'proveedor (para no duplicarlo) y antes de costear (para saber qué tarifas hay).',
    inputSchema: z.object({
      proveedor_id: z.string().optional().describe('Id del proveedor: devuelve detalle + tarifario.'),
      texto: z.string().optional().describe('Filtra por nombre (búsqueda parcial, sin acentos).'),
      tipo: z.enum(TIPOS_PROVEEDOR).optional(),
      limite: z.number().int().min(1).max(200).optional().describe('Default 50.'),
    }),
    handler: async (args) => {
      const a = args as { proveedor_id?: string; texto?: string; tipo?: string; limite?: number }
      if (a.proveedor_id?.trim()) {
        const id = a.proveedor_id.trim()
        const filas = await select<FilaProveedor[]>(
          'suppliers',
          `select=${CAMPOS},address,description,info&id=eq.${q(id)}`,
        )
        if (!filas.length) throw new KetzalError('Ese proveedor no existe o no tienes acceso.')
        return { proveedor: filas[0], tarifas: await tarifasDe(id) }
      }
      const filtros = [`select=${CAMPOS}`, 'supplier_type=neq.agency', 'order=name', `limit=${Math.min(a.limite ?? 50, 200)}`]
      if (a.tipo) filtros.push(`supplier_type=eq.${q(a.tipo)}`)
      const lista = await select<FilaProveedor[]>('suppliers', filtros.join('&'))
      const texto = a.texto?.trim()
      const filtrados = texto ? lista.filter((p) => mismoNombre(p.name, texto) || normalizarNombre(p.name).includes(normalizarNombre(texto))) : lista
      const ids = filtrados.map((p) => p.id)
      const tarjetas = ids.length
        ? await select<{ supplier_id: string; rates: unknown[] | null }[]>(
            'supplier_rate_cards',
            `select=supplier_id,rates&supplier_id=in.(${ids.map(q).join(',')})`,
          )
        : []
      const numTarifas = new Map(tarjetas.map((t) => [t.supplier_id, Array.isArray(t.rates) ? t.rates.length : 0]))
      return {
        total: filtrados.length,
        proveedores: filtrados.map((p) => ({ ...p, num_tarifas: numTarifas.get(p.id) ?? 0 })),
      }
    },
  },
  {
    name: 'ketzal_crear_proveedor',
    title: 'Dar de alta un proveedor',
    description:
      'Registra un PROVEEDOR de la agencia: quinta, cabañas, campamento, transportista, guía. NUNCA una ' +
      'agencia (eso es un inquilino y se hace en pantalla). Antes búscalo con ketzal_proveedores: si ya ' +
      'existe uno con nombre parecido la herramienta se niega y te da su id; solo con `forzar: true` crea ' +
      'otro. Exige teléfono o correo. Si leíste un volante o PDF, pasa también `condiciones` (anticipo, ' +
      'liquidación, cancelación) y `pago` (titular, CLABE, cuenta, tarjeta): es lo que quien costea ' +
      'necesita después. Luego captura su tarifario con ketzal_tarifario_guardar.',
    write: true,
    inputSchema: esquemaCrear,
    handler: async (args) => {
      const a = esquemaCrear.parse(args)
      const perfil = await perfilActual()
      const owner = a.agencia_id?.trim() || perfil.supplier_id
      if (!owner) {
        throw new KetzalError(
          'Falta `agencia_id`: tu cuenta no tiene agencia propia. Corre ketzal_agencias y manda el id de la agencia dueña del proveedor.',
        )
      }
      const fila = armarProveedor(a, owner)

      // Antiduplicados: por nombre normalizado, en lo que la RLS deja ver.
      const existentes = await select<FilaProveedor[]>(
        'suppliers',
        'select=id,name,supplier_type,owner_supplier_id&supplier_type=neq.agency&limit=500',
      )
      const parecidos = existentes.filter((p) => mismoNombre(p.name, a.nombre))
      if (parecidos.length && !a.forzar) {
        throw new KetzalError(
          `Ya existe un proveedor con nombre parecido: ${parecidos
            .map((p) => `"${p.name}" (${p.id})`)
            .join(', ')}. Úsalo, o si de verdad es otro, repite con forzar: true.`,
        )
      }

      const creado = await insert<FilaProveedor>('suppliers', fila)
      return {
        proveedor: creado,
        siguiente_paso: 'Captura su tarifario con ketzal_tarifario_guardar (unidad noche para cabañas/quintas por noche; pax para entradas por persona).',
      }
    },
  },
  {
    name: 'ketzal_tarifario',
    title: 'Tarifario de un proveedor',
    description:
      'Las tarifas capturadas de un proveedor (label, unidad, costo, cupo o costo por pack). ' +
      'Úsala antes de costear un servicio o antes de agregar tarifas, para no repetir claves.',
    inputSchema: z.object({ proveedor_id: z.string().describe('Id del proveedor (ketzal_proveedores).') }),
    handler: async (args) => {
      const id = String((args as { proveedor_id?: string }).proveedor_id ?? '').trim()
      if (!id) throw new KetzalError('Falta proveedor_id.')
      const prov = await select<FilaProveedor[]>('suppliers', `select=id,name,supplier_type&id=eq.${q(id)}`)
      if (!prov.length) throw new KetzalError('Ese proveedor no existe o no tienes acceso.')
      return { proveedor: prov[0], tarifas: await tarifasDe(id), unidades: UNIDADES }
    },
  },
  {
    name: 'ketzal_tarifario_guardar',
    title: 'Capturar o actualizar el tarifario de un proveedor',
    description:
      'Agrega o actualiza tarifas de un proveedor. Por default MEZCLA: conserva las que ya había y pisa ' +
      'solo las que traen la misma key; con `reemplazar: true` deja únicamente las que mandes. Unidades: ' +
      'noche (cabaña para 8 a $1,900 por noche → unidad noche, costo 1900, cupo 8; camping $600 por noche ' +
      'por vehículo hasta 5 → noche, 600, cupo 5), dia (quinta que cobra por día/evento), grupo (sprinter ' +
      '$8,000 por viaje, cupo 15), pax (acceso al parque $65 por persona), habitacion (hotel por pack y ' +
      'noche). Solo el admin de la agencia dueña o el superadmin pueden escribirlo.',
    write: true,
    inputSchema: z.object({
      proveedor_id: z.string().describe('Id del proveedor (ketzal_proveedores).'),
      tarifas: z.array(esquemaTarifa).min(1),
      reemplazar: z.boolean().optional().describe('true = el tarifario queda SOLO con estas tarifas.'),
    }),
    handler: async (args) => {
      const a = args as { proveedor_id: string; tarifas: TarifaIn[]; reemplazar?: boolean }
      const id = String(a.proveedor_id ?? '').trim()
      if (!id) throw new KetzalError('Falta proveedor_id.')
      const entrada = z.array(esquemaTarifa).min(1).parse(a.tarifas)
      const existentes = await select<{ supplier_id: string; rates: Tarifa[] | null }[]>(
        'supplier_rate_cards',
        `select=supplier_id,rates&supplier_id=eq.${q(id)}`,
      )
      const previas = Array.isArray(existentes[0]?.rates) ? existentes[0]!.rates : []
      const rates = armarTarifas(entrada, previas, a.reemplazar === true)
      let guardadas: Tarifa[]
      if (existentes.length) {
        const filas = await update<{ rates: Tarifa[] }>('supplier_rate_cards', `supplier_id=eq.${q(id)}&select=rates`, { rates })
        if (!filas.length) throw new KetzalError('No se pudo guardar: no tienes acceso a ese proveedor.')
        guardadas = filas[0]!.rates
      } else {
        const fila = await insert<{ rates: Tarifa[] }>('supplier_rate_cards', { supplier_id: id, rates })
        guardadas = fila.rates
      }
      return {
        proveedor_id: id,
        total: guardadas.length,
        tarifas: guardadas,
        modo: a.reemplazar ? 'reemplazado' : 'mezclado',
      }
    },
  },
]
