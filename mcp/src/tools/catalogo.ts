/** Catálogo: servicios, sus salidas, y búsqueda global. */
import { KetzalError } from '../errors.js'
import { q, rpc, select, update } from '../rest.js'
import type { ToolDef } from './registry.js'
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
  'id,name,price,service_type,state_to,city_to,max_capacity,transport_type,published'
const CAMPOS_DETALLE =
  `${CAMPOS_LISTA},supplier_id,description,packs,includes,excludes,available_from,available_to`

type SalidaRow = {
  id: string
  departs_on: string
  max_capacity: number
  seats_taken: number
  note: string | null
  price_pct: number | null
}

async function servicios(a: Record<string, unknown>) {
  const id = typeof a.servicio_id === 'string' ? a.servicio_id.trim() : ''

  if (id) {
    const [filas, salidas] = await Promise.all([
      select<Record<string, unknown>[]>('services', `select=${CAMPOS_DETALLE}&id=eq.${q(id)}`),
      select<SalidaRow[]>(
        'service_departures',
        `select=id,departs_on,max_capacity,seats_taken,note,price_pct&service_id=eq.${q(id)}&order=departs_on`,
      ),
    ])
    const servicio = filas[0]
    if (!servicio) {
      throw new KetzalError(
        'No existe ese servicio, o es de otra agencia y la RLS no te lo muestra.',
      )
    }
    return {
      servicio,
      salidas: salidas.map((s) => ({
        ...s,
        // Lugares libres: misma derivación que `listarSalidas` en la app.
        lugares_libres: Math.max(0, s.max_capacity - s.seats_taken),
        price_pct: Number(s.price_pct ?? 0),
      })),
      nota:
        'El precio del servicio es el "desde" (pack más barato). `price_pct` es el ajuste ' +
        'de temporada de esa salida en %: 0 = precio normal.',
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

  const lista = await select<Record<string, unknown>[]>('services', filtros.join('&'))
  return {
    num: lista.length,
    servicios: lista,
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
      've todos). Sin argumentos lista el catálogo; con `servicio_id` devuelve el detalle ' +
      'más sus salidas con fecha, cupo y lugares libres. Úsala para saber qué se vende, a ' +
      'qué precio, con cuánto cupo y qué está publicado en el catálogo público.',
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
]
