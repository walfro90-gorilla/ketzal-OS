/** Operación de viaje: salidas, ocupación, manifiesto, pasajeros y asientos. */
import { z } from 'zod'
import { KetzalError } from '../errors.js'
import { insert, q, remove, rpc, select } from '../rest.js'
import type { ToolDef } from './tipos.js'

// Formas del jsonb de los RPCs de F3/b046 (calco de `src/app/(ops)/salidas/tipos.ts`).
type SalidaDetalle = {
  departure: {
    id: string
    service: string
    agency: string | null
    departs_on: string
    max_capacity: number
    seats_taken: number
    note: string | null
  }
  totals: { num_ventas: number; num_pax: number; pax_capturados: number }
  money: { vendido_propio: number; cobrado_propio: number; saldo_propio: number }
  bookings: unknown[]
}

type Listas = { buslist?: unknown[]; rooms?: unknown[] }

type Pasajero = {
  id: string
  full_name: string
  passenger_type: string | null
  doc_id: string | null
  boarded_at: string | null
}

type MapaAsientos = {
  enabled: boolean
  transport_type?: string
  total?: number
  occupied?: number[]
  mine?: { passenger_id: string; seat: number }[]
}

const uuid = (que: string) => z.uuid().describe(que)

export const tools: ToolDef[] = [
  {
    name: 'ketzal_salidas',
    title: 'Salidas: ocupación, ventas del camión y listas de operación',
    description:
      'Operación de viaje, en tres modos según los argumentos. ' +
      'SIN argumentos: las próximas salidas de los servicios que opera tu agencia, con cupo, ' +
      'asientos tomados y cuántos pasajeros llevan capturados. ' +
      'CON `salida_id`: el detalle de esa salida — ocupación, pasajeros capturados, dinero ' +
      'propio (vendido/cobrado/saldo) y las ventas del camión. ' +
      'CON `salida_id` y `listas: true`: la buslist (pase de abordar, ordenada por asiento, ' +
      'con la hora de abordaje) y la roomlist (por reservación, con la ocupación para el hotel). ' +
      'IMPORTANTE — el camión es cross-tenant a propósito: aparecen TODOS los pasajeros, ' +
      'incluidas las reventas de otras agencias, pero el dinero de una venta ajena llega en ' +
      '`null` (`is_own: false`) porque es privado. Esos nulos son intencionales: repórtalos ' +
      'como "no visible", nunca los inventes ni los completes sumando. ' +
      'Sólo la agencia dueña del servicio (o un superadmin) puede consultar una salida.',
    inputSchema: z.object({
      salida_id: z
        .uuid()
        .optional()
        .describe('Id de la salida. Si lo omites, se listan las próximas salidas.'),
      listas: z
        .boolean()
        .optional()
        .describe('Con `salida_id`: devuelve la buslist y la roomlist en vez del detalle.'),
      desde: z
        .string()
        .optional()
        .describe('Al listar: fecha mínima de salida en formato AAAA-MM-DD. Por defecto hoy.'),
    }),
    handler: async (args) => {
      const id = typeof args.salida_id === 'string' ? args.salida_id : null
      if (!id) {
        return rpc('list_departures', {
          p_from: typeof args.desde === 'string' ? args.desde : undefined,
        })
      }

      if (args.listas !== true) return rpc<SalidaDetalle>('get_departure_detail', { p_departure_id: id })

      // Las listas no traen encabezado (servicio/fecha): se acompañan del detalle,
      // igual que las páginas de manifiesto y roomlist de la app.
      const [detalle, listas] = await Promise.all([
        rpc<SalidaDetalle>('get_departure_detail', { p_departure_id: id }),
        rpc<Listas>('departure_lists', { p_departure_id: id }),
      ])
      return {
        salida: detalle.departure,
        totales: detalle.totals,
        buslist: listas.buslist ?? [],
        roomlist: listas.rooms ?? [],
      }
    },
  },

  {
    name: 'ketzal_pasajeros',
    title: 'Pasajeros y asientos de una venta',
    description:
      'Quién va en una venta: los pasajeros capturados (nombre, tipo, documento, hora de ' +
      'abordaje), cuántos faltan contra los lugares vendidos, y el asiento de cada uno junto ' +
      'con el mapa de la salida (tipo de transporte, total de asientos y cuáles ya están ' +
      'ocupados por cualquier venta del camión). Úsala antes de capturar pasajeros, antes de ' +
      'asignar un asiento (para ver cuáles quedan libres) o para revisar si falta gente por ' +
      'nombrar. Si el viaje no tiene mapa de asientos, `mapa_asientos` llega en null.',
    inputSchema: z.object({ venta_id: uuid('Id de la venta (booking).') }),
    handler: async (args) => {
      const id = String(args.venta_id)
      const [pasajeros, ventas, mapa] = await Promise.all([
        select<Pasajero[]>(
          'booking_passengers',
          `select=id,full_name,passenger_type,doc_id,boarded_at&booking_id=eq.${q(id)}&order=created_at`,
        ),
        select<{ num_pax: number; travel_date: string | null; status: string }[]>(
          'bookings',
          `select=num_pax,travel_date,status&id=eq.${q(id)}`,
        ),
        rpc<MapaAsientos>('seat_map_for_booking', { p_booking_id: id }).catch(() => null),
      ])

      const venta = ventas[0]
      const asientoDe = new Map((mapa?.mine ?? []).map((m) => [m.passenger_id, m.seat]))

      return {
        venta: venta
          ? { num_pax: venta.num_pax, fecha_viaje: venta.travel_date, estado: venta.status }
          : null,
        capturados: venta ? `${pasajeros.length} de ${venta.num_pax}` : `${pasajeros.length}`,
        pasajeros: pasajeros.map((p) => ({ ...p, asiento: asientoDe.get(p.id) ?? null })),
        mapa_asientos: mapa?.enabled
          ? {
              transporte: mapa.transport_type,
              total_asientos: mapa.total,
              ocupados: mapa.occupied ?? [],
            }
          : null,
      }
    },
  },

  {
    name: 'ketzal_pasajero_agregar',
    title: 'Capturar un pasajero en una venta',
    description:
      'Agrega un pasajero a una venta (nombre para el manifiesto y el pase de abordar). ' +
      'Los pasajeros NO son dinero: la tabla es editable y no toca el ledger. ' +
      'Captura uno por llamada; el cupo de la venta es `num_pax` (revísalo con ketzal_pasajeros ' +
      'para no capturar de más). El asiento se asigna aparte, con ketzal_asiento.',
    write: true,
    inputSchema: z.object({
      venta_id: uuid('Id de la venta (booking).'),
      nombre: z.string().min(1).describe('Nombre completo del pasajero, como va en su documento.'),
      tipo: z
        .string()
        .optional()
        .describe('Tipo de pasajero: adulto, niño, infante, adulto mayor.'),
      documento: z.string().optional().describe('INE/pasaporte, si la operación lo pide.'),
    }),
    handler: async (args) => {
      const nombre = String(args.nombre).trim()
      if (!nombre) throw new KetzalError('Escribe el nombre del pasajero.')
      const limpiar = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
      return insert('booking_passengers', {
        booking_id: args.venta_id,
        full_name: nombre,
        passenger_type: limpiar(args.tipo),
        doc_id: limpiar(args.documento),
      })
    },
  },

  {
    name: 'ketzal_pasajero_quitar',
    title: 'Quitar un pasajero de una venta',
    description:
      'Borra un pasajero capturado (se equivocaron de nombre, o ya no viaja). ' +
      'No mueve dinero ni cancela la venta: los lugares vendidos (`num_pax`) y el saldo no ' +
      'cambian. Si el pasajero tenía asiento, el asiento queda libre. ' +
      'El id del pasajero sale de ketzal_pasajeros, no es el id de la venta.',
    write: true,
    destructive: true,
    inputSchema: z.object({
      pasajero_id: uuid('Id del pasajero (campo `id` de ketzal_pasajeros).'),
    }),
    handler: async (args) => {
      await remove('booking_passengers', `id=eq.${q(String(args.pasajero_id))}`)
      return { ok: true }
    },
  },

  {
    name: 'ketzal_asiento',
    title: 'Asignar o liberar el asiento de un pasajero',
    description:
      'Sienta a un pasajero en un asiento del transporte de su salida, o lo libera. ' +
      'Antes de asignar, consulta ketzal_pasajeros para ver el total de asientos y cuáles ya ' +
      'están ocupados (por cualquier venta del camión, no sólo la tuya): la base de datos ' +
      'rechaza un asiento ya tomado y un número fuera del rango. ' +
      'Sólo aplica a viajes con mapa de asientos.',
    write: true,
    inputSchema: z.object({
      pasajero_id: uuid('Id del pasajero (campo `id` de ketzal_pasajeros).'),
      accion: z.enum(['asignar', 'liberar']).describe('`asignar` requiere `asiento`.'),
      asiento: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Número de asiento, desde 1. Sólo con `accion: "asignar"`.'),
    }),
    handler: async (args) => {
      if (args.accion === 'liberar') {
        return rpc('release_seat', { p_passenger_id: args.pasajero_id })
      }
      if (typeof args.asiento !== 'number') {
        throw new KetzalError('Indica el número de asiento para asignarlo.')
      }
      return rpc('assign_seat', { p_passenger_id: args.pasajero_id, p_seat: args.asiento })
    },
  },
]
