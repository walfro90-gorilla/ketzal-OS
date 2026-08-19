/**
 * Gastos y cuentas por pagar a mayoristas.
 *
 * Los egresos también son ledger append-only: corregir un gasto es un
 * contra-asiento (`reverse_expense`), nunca un UPDATE ni un DELETE. Un solo
 * ledger de egresos es lo que permite sacar utilidad sin doble contabilidad, así
 * que los pagos a mayorista son gastos de categoría `mayorista`, no otra tabla.
 */
import { z } from 'zod'
import { rpc } from '../rest.js'
import type { ToolDef } from './registry.js'

const CATEGORIAS = [
  'operacion',
  'transporte',
  'hospedaje',
  'alimentos',
  'mayorista',
  'embajador',
  'marketing',
  'otro',
] as const

export const tools: ToolDef[] = [
  {
    name: 'ketzal_gastos',
    title: 'Gastos y cuentas por pagar',
    description:
      'Egresos de la agencia. `accion: "resumen"` da el neto del periodo (egresos menos ' +
      'reversos) desglosado por categoría y por mes — es la mitad que falta para la ' +
      'utilidad, que sale de vendido menos gastos. `"por_pagar"` lista lo que se le debe a ' +
      'cada agencia dueña por reventas: lo debido, la comisión, lo ya pagado y el saldo.',
    inputSchema: z.object({
      accion: z.enum(['resumen', 'por_pagar']),
      desde: z.string().optional().describe('Inicio del periodo YYYY-MM-DD (sólo en resumen).'),
      hasta: z.string().optional().describe('Fin del periodo YYYY-MM-DD (sólo en resumen).'),
    }),
    handler: async (a) => {
      if (a.accion === 'por_pagar') return rpc('payables_summary')
      return rpc('expenses_summary', { p_from: a.desde ?? null, p_to: a.hasta ?? null })
    },
  },
  {
    name: 'ketzal_registrar_gasto',
    title: 'Registrar un gasto',
    description:
      'Asienta un egreso de la agencia. Las categorías "mayorista" (pago a la agencia dueña ' +
      'de un viaje que revendiste) y "embajador" exigen el proveedor. El asiento es ' +
      'append-only: si te equivocas no se edita ni se borra, se revierte con ' +
      'ketzal_revertir_gasto.',
    write: true,
    money: true,
    inputSchema: z.object({
      concepto: z.string().min(1).describe('En qué se gastó.'),
      categoria: z.enum(CATEGORIAS),
      monto: z.number().positive().describe('Monto en MXN.'),
      fecha: z.string().describe('Fecha del gasto YYYY-MM-DD.'),
      metodo: z.string().optional().describe('efectivo, transferencia…'),
      proveedor_id: z.string().uuid().optional().describe('Obligatorio si la categoría es mayorista o embajador.'),
      venta_id: z.string().uuid().optional().describe('Venta a la que se imputa el gasto, si aplica.'),
      notas: z.string().optional(),
      confirmar: z
        .literal(true)
        .describe('Obligatorio. Confirma que la persona aprobó registrar este egreso.'),
    }),
    handler: async (a) => {
      await rpc('create_expense', {
        p_concept: a.concepto,
        p_category: a.categoria,
        p_amount: a.monto,
        p_method: a.metodo ?? null,
        p_spent_at: a.fecha,
        p_provider_supplier_id: a.proveedor_id ?? null,
        p_booking_id: a.venta_id ?? null,
        p_notes: a.notas ?? null,
      })
      return { ok: true, nota: 'Gasto asentado. Para corregirlo, revierte: no se edita ni se borra.' }
    },
  },
  {
    name: 'ketzal_revertir_gasto',
    title: 'Revertir un gasto',
    description:
      'Asienta el contra-asiento de un gasto, dejándolo en neto cero. Es la única forma de ' +
      'corregir un egreso: el ledger no admite editar ni borrar. Un gasto sólo se revierte ' +
      'una vez, y un reverso no se revierte.',
    write: true,
    money: true,
    inputSchema: z.object({
      gasto_id: z.string().uuid().describe('Id del gasto a revertir.'),
      motivo: z.string().min(3).describe('Por qué se revierte. Queda en el asiento.'),
      confirmar: z.literal(true).describe('Obligatorio. Confirma que la persona aprobó el reverso.'),
    }),
    handler: async (a) => {
      await rpc('reverse_expense', { p_expense_id: a.gasto_id, p_reason: a.motivo })
      return { ok: true, nota: 'Reverso asentado. El neto del gasto original queda en cero.' }
    },
  },
]
