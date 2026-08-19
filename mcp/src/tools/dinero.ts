/**
 * Dinero: crear venta, abonos, recibos, vouchers, planes de pago, cancelaciones
 * y créditos.
 *
 * Todo el cálculo vive en los RPCs de Postgres (saldo derivado, penalización por
 * tramos, folio atómico). Aquí no se suma ni se redondea nada: reimplementarlo en
 * TypeScript crearía una segunda fuente de verdad que se desincroniza del motor.
 *
 * El ledger es append-only: corregir un abono es un contra-asiento, no un
 * borrado. Por eso toda herramienta de esta familia exige `confirmar: true`.
 */
import { z } from 'zod'
import { assertMontoEsperado } from '../guard.js'
import { KetzalError } from '../errors.js'
import { q, rpc, select } from '../rest.js'
import type { ToolDef } from './registry.js'

const confirmar = z
  .literal(true)
  .describe('Obligatorio. Confirma que la persona aprobó esta operación de dinero.')

/** Fecha `YYYY-MM-DD` a mediodía local: evita que retroceda un día al pasar a UTC. */
function aIso(fecha?: unknown): string | null {
  if (typeof fecha !== 'string' || !fecha.trim()) return null
  return new Date(`${fecha}T12:00:00`).toISOString()
}

/**
 * El enganche se pide en % (lo natural al hablar) pero los RPCs del plan lo
 * reciben como FRACCIÓN — su default es `0.20`, no `20`. Mandar el porcentaje
 * crudo generaría un enganche de 20 veces el total.
 */
export function aFraccion(pct: unknown): number {
  // `Number(null)` es 0, que es finito: sin este corte, "no lo especificaron"
  // caería en la validación de rango en vez de usar el default.
  if (pct === undefined || pct === null || pct === '') return 0.2
  const n = Number(pct)
  if (!Number.isFinite(n)) return 0.2
  if (n < 1 || n > 99) {
    throw new KetzalError('El enganche debe estar entre 1% y 99%.')
  }
  return n / 100
}

// ── crear venta / cotización ─────────────────────────────────────────────────

const LINEA = z.object({
  item_type: z.enum(['passenger', 'addon']).describe('passenger = pasajero; addon = habitación o extra'),
  passenger_type: z
    .string()
    .nullish()
    .describe('Tipo de pasajero (adult, child, infant…). Null en addons.'),
  description: z.string().nullish().describe('Descripción libre de la línea.'),
  qty: z.number().int().positive().describe('Cantidad.'),
  unit_price: z.number().nonnegative().describe('Precio unitario en MXN.'),
})

async function crearVenta(a: Record<string, unknown>) {
  // Sin esto el RPC recibiría un cliente con nombre nulo y reventaría por
  // constraint (23502), que al agente le llega como error genérico.
  if (!a.cliente_id && !String(a.cliente_nuevo ?? '').trim()) {
    throw new KetzalError(
      'Falta el cliente: pasa `cliente_id` (búscalo con ketzal_clientes) o `cliente_nuevo` con su nombre completo.',
    )
  }
  const bookingId = await rpc<string>('create_booking_with_items', {
    p_customer_id: a.cliente_id ?? null,
    p_new_customer: a.cliente_id ? null : { full_name: a.cliente_nuevo, phone: a.cliente_telefono ?? null },
    p_service_id: a.servicio_id ?? null,
    p_travel_date: a.fecha_viaje ?? null,
    p_discount: a.descuento ?? 0,
    p_notes: a.notas ?? null,
    p_items: a.lineas,
    p_status: a.estado ?? 'reserved',
  })
  // Congela la política de cancelación vigente (snapshot idempotente). Best-effort,
  // igual que en la app: la venta ya existe y el snapshot se puede rehacer.
  const politica = await rpc('snapshot_booking_policy', { p_booking: bookingId }).then(
    () => 'congelada',
    () => 'no se pudo congelar (reintentar desde la app)',
  )
  return {
    booking_id: bookingId,
    estado: a.estado ?? 'reserved',
    politica_cancelacion: politica,
    siguiente: 'Usa ketzal_venta para ver el detalle y el saldo derivado.',
  }
}

// ── abonos y devoluciones ────────────────────────────────────────────────────

async function registrarAbono(a: Record<string, unknown>) {
  await rpc('register_payment', {
    p_booking_id: a.venta_id,
    p_amount: a.monto,
    p_method: a.metodo ?? null,
    p_paid_at: aIso(a.fecha),
    p_type: 'payment',
  })
  return {
    ok: true,
    nota: 'Abono registrado. El saldo es derivado: consúltalo con ketzal_venta, no lo calcules.',
  }
}

async function devolverPago(a: Record<string, unknown>) {
  const filas = await select<{ payment_method: string | null; type: string; status: string; amount_mxn: number | string }[]>(
    'payments',
    `select=payment_method,type,status,amount_mxn&id=eq.${q(String(a.pago_id))}`,
  )
  const pago = filas[0]
  if (!pago) throw new KetzalError('Ese pago no existe o no tienes acceso a él.')

  // Un pago de Mercado Pago hay que devolverlo PRIMERO en la API de MP; si aquí
  // sólo se asentara el ledger, el sistema diría "devuelto" y la tarjeta seguiría
  // cobrada. El MCP no tiene (ni debe tener) el token de MP.
  if (pago.payment_method === 'mercadopago') {
    throw new KetzalError(
      'Este abono se cobró por Mercado Pago: la devolución tiene que salir desde ' +
        '/ventas/[id] en la app, que primero devuelve el dinero en MP y luego asienta el ledger. ' +
        'Desde el MCP sólo se registran devoluciones de efectivo, transferencia o depósito.',
    )
  }

  const monto = a.monto == null ? null : Number(a.monto)
  const parcial = monto != null && monto < Number(pago.amount_mxn)
  const devuelto = parcial
    ? await rpc<number>('refund_payment_partial', { p_payment_id: a.pago_id, p_amount: monto })
    : await rpc<number>('refund_payment', { p_payment_id: a.pago_id })

  return {
    devuelto_mxn: Number(devuelto),
    tipo: parcial ? 'parcial' : 'total',
    nota: 'Queda el asiento de devolución. El dinero se entrega a mano; esto es el registro.',
  }
}

// ── cancelación ──────────────────────────────────────────────────────────────

type Preview = {
  pena_mxn?: number
  pagado_mxn: number
  tramo_pct?: number
  dias_antes?: number
  efectivo?: { a_devolver_mxn: number }
  credito?: { monto_mxn: number; expira: string }
  aceptada: boolean
  cancelada: boolean
  sin_fecha?: boolean
}

async function cancelarVenta(a: Record<string, unknown>) {
  // La pena sube por tramos según los días que falten para el viaje: un preview de
  // ayer puede caer en otro tramo hoy. Se recalcula y se compara con el eco.
  const p = await rpc<Preview>('preview_cancellation', { p_booking: a.venta_id })
  if (p.cancelada) throw new KetzalError('Esa venta ya está cancelada.')

  const waive = a.condonar === true
  const penaAhora = waive ? 0 : Number(p.pena_mxn ?? 0)
  assertMontoEsperado(Number(a.pena_esperada), penaAhora)

  const r = await rpc<{ pena_mxn: number; a_devolver_mxn: number; credito_mxn: number | null }>(
    'cancel_booking_v2',
    {
      p_booking: a.venta_id,
      p_reason: a.motivo,
      p_mode: a.modo,
      p_waive_fee: waive,
    },
  )
  return {
    pena_mxn: Number(r.pena_mxn ?? 0),
    a_devolver_mxn: Number(r.a_devolver_mxn ?? 0),
    credito_mxn: r.credito_mxn == null ? null : Number(r.credito_mxn),
    nota:
      a.modo === 'credito'
        ? 'Se emitió crédito (sin salida de efectivo). Es universal: el titular lo puede usar en cualquier viaje de Ketzal.'
        : 'Se registró la penalización. Devolver el efectivo es un acto aparte (ketzal_devolver_pago o desde la app si fue Mercado Pago).',
  }
}

// ── herramientas ─────────────────────────────────────────────────────────────

export const tools: ToolDef[] = [
  {
    name: 'ketzal_crear_venta',
    title: 'Crear venta o cotización',
    description:
      'Crea una venta con sus líneas (pasajeros y extras) de forma atómica. Con ' +
      '`estado: "draft"` crea una COTIZACIÓN (obtiene folio COT-n y link público); con ' +
      '"reserved" crea la venta directa. El RPC recalcula los totales, deriva la agencia ' +
      'vendedora y valida cupo y cliente. Congela la política de cancelación vigente.',
    write: true,
    money: true,
    inputSchema: z.object({
      lineas: z.array(LINEA).min(1).describe('Líneas de la venta. Al menos una.'),
      cliente_id: z.string().uuid().optional().describe('Cliente existente (búscalo con ketzal_clientes).'),
      cliente_nuevo: z.string().optional().describe('Nombre completo, si es un cliente nuevo.'),
      cliente_telefono: z.string().optional().describe('Teléfono del cliente nuevo.'),
      servicio_id: z.string().uuid().optional().describe('Servicio del catálogo.'),
      fecha_viaje: z.string().optional().describe('Fecha de viaje YYYY-MM-DD (define la salida y el cupo).'),
      descuento: z.number().nonnegative().optional().describe('Descuento en MXN sobre el subtotal.'),
      notas: z.string().optional(),
      estado: z.enum(['draft', 'reserved']).optional().describe('draft = cotización, reserved = venta. Default reserved.'),
      confirmar,
    }),
    handler: crearVenta,
  },
  {
    name: 'ketzal_registrar_abono',
    title: 'Registrar un abono',
    description:
      'Registra un pago del cliente contra una venta (efectivo, transferencia, depósito). ' +
      'El saldo NO se guarda: se deriva de total − pagos + devoluciones, así que después ' +
      'del abono consulta ketzal_venta en vez de calcularlo. El RPC rechaza sobrepagos. ' +
      'Para cobros en línea de Mercado Pago no uses esto: esos entran solos por el webhook.',
    write: true,
    money: true,
    inputSchema: z.object({
      venta_id: z.string().uuid().describe('Id de la venta.'),
      monto: z.number().positive().describe('Monto del abono en MXN.'),
      metodo: z.string().optional().describe('efectivo, transferencia, deposito…'),
      fecha: z.string().optional().describe('Fecha del pago YYYY-MM-DD. Default: hoy.'),
      confirmar,
    }),
    handler: registrarAbono,
  },
  {
    name: 'ketzal_emitir_recibo',
    title: 'Emitir recibo de un abono',
    description:
      'Emite el recibo interno de un abono ya registrado (folio atómico por agencia, ' +
      'link público compartible). Es idempotente: repetirla sobre el mismo abono no ' +
      'genera un folio nuevo. El recibo es interno, NO es factura fiscal (CFDI).',
    write: true,
    idempotent: true,
    inputSchema: z.object({
      pago_id: z.string().uuid().describe('Id del abono (lo devuelve ketzal_venta).'),
    }),
    handler: async (a) => ({ folio: Number(await rpc('emit_receipt', { p_payment_id: a.pago_id })) }),
  },
  {
    name: 'ketzal_emitir_voucher',
    title: 'Emitir voucher de servicio',
    description:
      'Emite el voucher que acredita el servicio ante el operador u hotel (folio por ' +
      'agencia, link público, NO muestra montos). Idempotente: si ya existe devuelve el ' +
      'mismo. Sólo aplica a ventas reserved/confirmed/paid.',
    write: true,
    idempotent: true,
    inputSchema: z.object({
      venta_id: z.string().uuid().describe('Id de la venta.'),
    }),
    handler: async (a) => ({ voucher_id: await rpc<string>('emit_voucher', { p_booking_id: a.venta_id }) }),
  },
  {
    name: 'ketzal_preview_plan_pagos',
    title: 'Simular un plan de pagos',
    description:
      'Calcula el calendario de abonos (enganche + parcialidades por frecuencia hasta la ' +
      'fecha final) sin guardar nada. La suma de las parcialidades siempre cuadra con el ' +
      'total. Úsala para enseñarle opciones al cliente antes de comprometer el plan.',
    inputSchema: z.object({
      total: z.number().positive().describe('Total a repartir, en MXN.'),
      fecha_final: z.string().describe('Fecha del último abono, YYYY-MM-DD.'),
      frecuencia: z.enum(['semanal', 'quincenal', 'mensual']).optional().describe('Default: quincenal.'),
      enganche_pct: z.number().min(1).max(99).optional().describe('% de enganche, entre 1 y 99. Default: 20.'),
    }),
    handler: (a) =>
      rpc('preview_payment_plan', {
        p_total: a.total,
        p_final: a.fecha_final,
        p_frequency: a.frecuencia ?? 'quincenal',
        p_down_pct: aFraccion(a.enganche_pct),
      }),
  },
  {
    name: 'ketzal_plan_pagos',
    title: 'Fijar o quitar el plan de pagos',
    description:
      '`accion: "generar"` persiste el calendario en la venta y fija su fecha límite como ' +
      'la última del plan. `"quitar"` lo borra y regresa la venta a contado, pero sólo si ' +
      'aún no hay abonos: con pagos registrados el plan queda congelado (el cliente ya pagó ' +
      'contra ese calendario). Simula antes con ketzal_preview_plan_pagos.',
    write: true,
    money: true,
    inputSchema: z.object({
      accion: z.enum(['generar', 'quitar']),
      venta_id: z.string().uuid().describe('Id de la venta.'),
      fecha_final: z.string().optional().describe('Último abono, YYYY-MM-DD. Requerido al generar.'),
      frecuencia: z.enum(['semanal', 'quincenal', 'mensual']).optional().describe('Default: quincenal.'),
      enganche_pct: z.number().min(1).max(99).optional().describe('% de enganche, entre 1 y 99. Default: 20.'),
      confirmar,
    }),
    handler: async (a) => {
      if (a.accion === 'quitar') {
        await rpc('clear_payment_plan', { p_booking_id: a.venta_id })
        return { ok: true, nota: 'Plan eliminado; la venta vuelve a contado.' }
      }
      await rpc('generate_payment_plan', {
        p_booking_id: a.venta_id,
        p_frequency: a.frecuencia ?? 'quincenal',
        p_final_date: a.fecha_final ?? null,
        p_down_pct: aFraccion(a.enganche_pct),
      })
      return { ok: true, nota: 'Plan generado. Consulta el calendario con ketzal_venta.' }
    },
  },
  {
    name: 'ketzal_preview_cancelacion',
    title: 'Simular una cancelación',
    description:
      'Calcula qué pasaría si se cancela una venta: días que faltan para el viaje, tramo ' +
      'de penalización aplicable, penalización en MXN, cuánto se devolvería en efectivo y ' +
      'cuánto crédito se emitiría. No cambia nada. **Corre esto y enséñaselo a la persona ' +
      'ANTES de cancelar**: ketzal_cancelar_venta exige que le repitas la penalización.',
    inputSchema: z.object({
      venta_id: z.string().uuid().describe('Id de la venta.'),
    }),
    handler: (a) => rpc('preview_cancellation', { p_booking: a.venta_id }),
  },
  {
    name: 'ketzal_cancelar_venta',
    title: 'Cancelar una venta',
    description:
      'Cancela aplicando la política congelada en la venta. Modo "credito": penalización ' +
      'cero y se emite crédito universal (usable en cualquier viaje de Ketzal por la misma ' +
      'persona). Modo "efectivo": se registra la penalización retenida; devolver el dinero ' +
      'es un acto aparte. `condonar: true` la exime (cancelación de la agencia o fuerza ' +
      'mayor) y exige motivo. Corre ketzal_preview_cancelacion primero: hay que repetir ' +
      'aquí la penalización que devolvió, o la operación se rechaza.',
    write: true,
    money: true,
    inputSchema: z.object({
      venta_id: z.string().uuid().describe('Id de la venta.'),
      motivo: z.string().min(3).describe('Motivo de la cancelación. Queda en el expediente.'),
      modo: z.enum(['credito', 'efectivo']).describe('credito = sin salida de dinero; efectivo = se retiene la pena.'),
      pena_esperada: z.number().nonnegative().describe('La penalización que devolvió ketzal_preview_cancelacion. Debe coincidir.'),
      condonar: z.boolean().optional().describe('Exime la penalización (cancela la agencia o fuerza mayor).'),
      confirmar,
    }),
    handler: cancelarVenta,
  },
  {
    name: 'ketzal_devolver_pago',
    title: 'Devolver un abono',
    description:
      'Registra la devolución de un abono, total o parcial. Un abono admite UNA sola ' +
      'devolución ligada. Un abono pagado con crédito no se devuelve en efectivo. ' +
      'Los cobros de Mercado Pago se devuelven desde la app, no aquí: el dinero tiene que ' +
      'salir primero en MP.',
    write: true,
    money: true,
    inputSchema: z.object({
      pago_id: z.string().uuid().describe('Id del abono a devolver.'),
      monto: z.number().positive().optional().describe('Monto parcial. Omitido = devolución total.'),
      confirmar,
    }),
    handler: devolverPago,
  },
  {
    name: 'ketzal_creditos',
    title: 'Créditos de un cliente',
    description:
      'Créditos por cancelación de un cliente, con su saldo (derivado de los canjes) y su ' +
      'vigencia. El crédito es universal en Ketzal: la misma persona lo puede usar en ' +
      'cualquier viaje, no sólo con la agencia que lo emitió.',
    inputSchema: z.object({
      cliente_id: z.string().uuid().describe('Id del cliente.'),
    }),
    handler: (a) => rpc('list_customer_credits', { p_customer: a.cliente_id }),
  },
  {
    name: 'ketzal_aplicar_credito',
    title: 'Aplicar un crédito a una venta',
    description:
      'Canjea crédito como abono de una venta (método "credito"). El RPC valida que sea la ' +
      'misma persona, la vigencia y el saldo. Sólo lo aplican el titular o la agencia que lo ' +
      'emitió. Un abono pagado con crédito ya no se devuelve en efectivo.',
    write: true,
    money: true,
    inputSchema: z.object({
      credito_id: z.string().uuid().describe('Id del crédito (lo da ketzal_creditos).'),
      venta_id: z.string().uuid().describe('Venta donde se aplica.'),
      monto: z.number().positive().describe('Monto a canjear en MXN.'),
      confirmar,
    }),
    handler: async (a) => ({
      saldo_restante_del_credito: Number(
        await rpc('redeem_credit', { p_credit: a.credito_id, p_booking: a.venta_id, p_amount: a.monto }),
      ),
    }),
  },
]
