/** Dirección: panel, reportes por rango, metas, conversión, comisiones y cuentas. */
import { KetzalError } from '../errors.js'
import { rpc } from '../rest.js'
import type { ToolDef } from './tipos.js'
import { z } from 'zod'

// ── Rango de fechas ──────────────────────────────────────────────────
// Puro y exportado para poder probarlo: si el agente no da periodo y la
// herramienta calla el default, el usuario cree que le contestaron del año
// completo. El default se dice siempre en la respuesta.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha local → "YYYY-MM-DD" (mismo criterio que `/reportes`). */
function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export type Rango = { desde: string; hasta: string; nota: string }

export function rangoFechas(desde?: string, hasta?: string, hoy = new Date()): Rango {
  for (const [campo, valor] of [
    ['desde', desde],
    ['hasta', hasta],
  ] as const) {
    if (valor !== undefined && !DATE_RE.test(valor)) {
      throw new KetzalError(`\`${campo}\` debe ir en formato YYYY-MM-DD.`)
    }
  }

  const r = {
    desde: desde ?? isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: hasta ?? isoDate(hoy),
  }
  if (r.desde > r.hasta) {
    throw new KetzalError('`desde` no puede ser posterior a `hasta`.')
  }

  const faltan = [desde ? null : 'inicio', hasta ? null : 'fin'].filter(Boolean)
  return {
    ...r,
    nota: faltan.length
      ? `No diste ${faltan.join(' ni ')} del rango: se usó el mes en curso (${r.desde} a ${r.hasta}). ` +
        'Dile al usuario qué periodo se midió; no lo des por otro.'
      : `Periodo ${r.desde} a ${r.hasta}.`,
  }
}

// ── Panel ────────────────────────────────────────────────────────────

async function panel() {
  const [resumen, anomalias] = await Promise.all([
    rpc<unknown>('dashboard_summary'),
    // Requiere permisos de revisión; si esta cuenta no los tiene, el panel sigue
    // sirviendo — la alerta es un extra, no el KPI.
    rpc<unknown>('alertas_anomalias_dinero').catch(() => null),
  ])
  return {
    panel: resumen,
    anomalias,
    nota:
      'Cifras de hoy, ya derivadas por la base (saldo = total − pagos + reembolsos): no las recalcules. ' +
      '`anomalias` = pagos que necesitan revisión manual (sobrepago, pagado sin cupo, pago en venta cancelada); ' +
      'null significa que tu cuenta no puede consultarlas, no que sean cero.',
  }
}

// ── Reportes por rango ───────────────────────────────────────────────

async function reportes(a: Record<string, unknown>) {
  const rango = rangoFechas(
    typeof a.desde === 'string' ? a.desde : undefined,
    typeof a.hasta === 'string' ? a.hasta : undefined,
  )
  const args = { p_from: rango.desde, p_to: rango.hasta }

  const [ventas, gastos, conversion, metas] = await Promise.all([
    rpc<Record<string, unknown>>('reports_summary', args),
    rpc<Record<string, unknown>>('expenses_summary', args),
    rpc<unknown>('conversion_summary', args),
    // Las metas son mensuales: el mes que manda es el del final del rango
    // (mismo criterio que `/reportes`).
    rpc<unknown>('goals_progress', { p_month: rango.hasta }),
  ])

  const vendido = Number(ventas?.total_vendido ?? 0)
  const totalGastos = Number(gastos?.total_gastos ?? 0)

  return {
    periodo: rango,
    ventas,
    gastos,
    // ponytail: única definición de utilidad que existe — calco de `/reportes`.
    // Si algún día hay un RPC que la derive, se cambia por él.
    utilidad: vendido - totalGastos,
    conversion,
    metas,
    nota:
      `${rango.nota} Utilidad = vendido − gastos del rango (derivada, igual que en /reportes). ` +
      '`conversion` es cotización→venta y `metas` es del mes de la fecha final, no del rango completo.',
  }
}

// ── Comisiones y cuentas ─────────────────────────────────────────────

async function comisionesCuentas(a: Record<string, unknown>) {
  const tipo = typeof a.cuenta_tipo === 'string' ? a.cuenta_tipo.trim() : ''

  const [comisiones, cuentas, movimientos] = await Promise.all([
    rpc<unknown>('commissions_summary'),
    rpc<unknown>('ledger_summary'),
    tipo
      ? rpc<unknown>('ledger_statement', {
          p_account_type: tipo,
          p_supplier: typeof a.supplier_id === 'string' ? a.supplier_id : null,
          p_profile: typeof a.profile_id === 'string' ? a.profile_id : null,
          p_limit: a.limite === undefined ? undefined : Number(a.limite),
        })
      : Promise.resolve(null),
  ])

  return {
    comisiones,
    cuentas,
    movimientos,
    nota:
      'Cuentas de doble partida: el saldo de todas suma 0. Saldo positivo = se le debe a esa cuenta; ' +
      'negativo = esa cuenta debe. Para el detalle de una, vuelve a llamar con `cuenta_tipo` (y los ids ' +
      'que trae `cuentas`). Son cifras de administración: con una cuenta de agente normal puede que ' +
      'sólo veas lo tuyo o nada.',
  }
}

export const tools: ToolDef[] = [
  {
    name: 'ketzal_panel',
    title: 'Panel del día',
    description:
      'Cómo va el negocio HOY: vendido, por cobrar, ventas vencidas, cotizaciones pendientes, ' +
      'próximos viajes y las anomalías de dinero que requieren revisión manual. Es la primera ' +
      'herramienta para "¿cómo vamos?", "¿qué requiere atención?" o cualquier pregunta sin ' +
      'periodo explícito. Para números de un rango de fechas usa `ketzal_reportes`.',
    handler: panel,
  },
  {
    name: 'ketzal_reportes',
    title: 'Reportes por periodo',
    description:
      'Números de un rango de fechas: vendido, cobrado, saldo por cobrar, comisión, ticket ' +
      'promedio y desglose por agente / servicio / mes; más gastos del rango, utilidad ' +
      '(vendido − gastos), tasa de conversión cotización→venta y avance de metas del mes. ' +
      'Úsala para "cómo nos fue en julio", "ventas de este mes", "cuánto llevamos del año". ' +
      'Si no das rango se usa el mes en curso y se dice en la respuesta: repórtaselo al usuario.',
    inputSchema: z.object({
      desde: z.string().optional().describe('Inicio del rango, YYYY-MM-DD. Default: día 1 del mes en curso.'),
      hasta: z.string().optional().describe('Fin del rango, YYYY-MM-DD (inclusive). Default: hoy.'),
    }),
    handler: reportes,
  },
  {
    name: 'ketzal_comisiones_cuentas',
    title: 'Comisiones y estado de cuenta',
    description:
      'Quién le debe a quién: comisiones devengadas por venta (reventa entre agencias, ' +
      'plataforma, embajador, agente) y el estado de cuenta de cada actor en el ledger de ' +
      'doble partida. Úsala para "cuánto se le debe a la agencia X", "cuánto lleva ganado el ' +
      'agente Y", "qué nos toca liquidar". Es información de administración: con rol de agente ' +
      'normal el servidor puede negar parte y te lo dirá.',
    inputSchema: z.object({
      cuenta_tipo: z
        .string()
        .optional()
        .describe(
          'Tipo de cuenta para ver sus movimientos: plataforma, agencia, embajador, viajero o agente. ' +
            'Sin esto sólo se devuelven los saldos.',
        ),
      supplier_id: z.string().optional().describe('Id de la agencia dueña de la cuenta (si aplica al tipo).'),
      profile_id: z.string().optional().describe('Id de la persona dueña de la cuenta (embajador o agente).'),
      limite: z.number().optional().describe('Máximo de movimientos a devolver (default 100).'),
    }),
    handler: comisionesCuentas,
  },
]
