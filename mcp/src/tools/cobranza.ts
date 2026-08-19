/** Cobranza: a quién cobrar, quién va atrasado, SPEI por aprobar. */
import { z } from 'zod'
import { rpc } from '../rest.js'
import type { ToolDef } from './registry.js'

/**
 * Forma del jsonb de `ketzal.cobranza()` (calco de `src/app/(ops)/cobranza/data.ts`).
 * Los ítems se devuelven **tal cual** los da el RPC: el atraso y el saldo ya vienen
 * derivados de la BD (regla de oro #2) y recalcularlos aquí sólo abriría una vía de
 * divergencia.
 */
type CobranzaItem = {
  id: string
  cliente: string
  servicio: string
  total: number
  pagado: number
  saldo: number
  con_plan: boolean
  frecuencia: string | null
  proximo_due: string | null
  proximo_monto: number | null
  atrasado: number
  due_date: string | null
  travel_date: string | null
}

type Cobranza = {
  total_saldo: number
  total_atrasado: number
  num_ventas: number
  items: CobranzaItem[]
}

const VACIA: Cobranza = { total_saldo: 0, total_atrasado: 0, num_ventas: 0, items: [] }

export const tools: ToolDef[] = [
  {
    name: 'ketzal_cobranza',
    title: 'Cobranza: a quién cobrar y quién va atrasado',
    description:
      'Panorama de cobranza de la agencia en una sola llamada: (1) las ventas con saldo, ' +
      'cruzando el plan de pagos contra los abonos reales — cuánto debe cada cliente, cuál es ' +
      'su próximo pago y cuánto trae atrasado; (2) las transferencias SPEI y depósitos en ' +
      'efectivo que el comprador reportó y esperan que un admin las confirme contra la banca; ' +
      '(3) las que se rechazaron hace poco. Úsala para "¿a quién le cobro hoy?", "¿quién va ' +
      'atrasado?", "¿hay pagos por confirmar?" o antes de una ronda de recordatorios. ' +
      'Los montos y los días de atraso vienen ya calculados por la base de datos: repórtalos ' +
      'tal cual, no los recalcules. Aprobar o rechazar una transferencia NO se hace desde aquí.',
    inputSchema: z.object({
      solo_atrasados: z
        .boolean()
        .optional()
        .describe('Sólo las ventas que ya traen atraso contra su plan de pagos (atrasado > 0).'),
      limite: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Máximo de ventas a listar. Por defecto 50, las demás se resumen en el conteo.'),
      dias_rechazadas: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe('Ventana de las transferencias rechazadas, en días. Por defecto 14.'),
    }),
    handler: async (args) => {
      const soloAtrasados = args.solo_atrasados === true
      const limite = typeof args.limite === 'number' ? args.limite : 50
      const dias = typeof args.dias_rechazadas === 'number' ? args.dias_rechazadas : undefined

      // Las tres listas son independientes; los RPCs de SPEI exigen admin, así que
      // para un agente fallan: se degradan a null (como en la app) en vez de tumbar
      // la respuesta entera.
      const [cobranza, pendientes, rechazadas] = await Promise.all([
        rpc<Cobranza | null>('cobranza'),
        rpc<unknown[] | null>('list_pending_spei').catch(() => null),
        rpc<unknown[] | null>('list_rejected_spei', { p_days: dias }).catch(() => null),
      ])

      const data = cobranza ?? VACIA
      const todos = data.items ?? []
      const filtrados = soloAtrasados ? todos.filter((i) => Number(i.atrasado) > 0) : todos

      return {
        resumen: {
          saldo_total: data.total_saldo,
          atrasado_total: data.total_atrasado,
          ventas_con_saldo: data.num_ventas,
        },
        ventas: filtrados.slice(0, limite),
        mostrando: `${Math.min(filtrados.length, limite)} de ${filtrados.length}${
          soloAtrasados ? ` con atraso (${todos.length} con saldo)` : ''
        }`,
        spei_por_aprobar: pendientes,
        spei_rechazadas: rechazadas,
        nota_spei:
          pendientes === null || rechazadas === null
            ? 'Las transferencias SPEI sólo las consulta y aprueba un admin de la agencia; con tu rol no se listan.'
            : undefined,
      }
    },
  },
]
