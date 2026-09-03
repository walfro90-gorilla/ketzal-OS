/** Ventas y cotizaciones: listar y ver detalle. */
import { z } from 'zod'
import { KetzalError } from '../errors.js'
import { q, rpc, select } from '../rest.js'
import { APP_URL } from '../config.js'
import type { ToolDef } from './tipos.js'

const ESTADOS = ['draft', 'reserved', 'confirmed', 'paid', 'cancelled'] as const
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * El dinero (`total`, `paid`, `balance`) sale de `bookings_with_balance`, que ya
 * deriva el saldo como `total − pagos + reembolsos`. Aquí no se recalcula nada:
 * una segunda fórmula en TS sería una segunda fuente de verdad que diverge.
 */
const COLS_LISTA = 'id,folio,status,travel_date,num_pax,total,currency,paid,balance,created_at'

const esquemaVentas = z.object({
  estado: z
    .enum(ESTADOS)
    .optional()
    .describe(
      'Filtra por estado. `draft` es una cotización (aún no es venta); ' +
        '`reserved`/`confirmed` están vivas; `paid` liquidada; `cancelled` cancelada.',
    ),
  campo_fecha: z
    .enum(['created_at', 'travel_date'])
    .default('created_at')
    .describe(
      'Sobre qué fecha aplican `desde`/`hasta`: `created_at` = cuándo se vendió ' +
        '(default, es lo que se pregunta casi siempre), `travel_date` = cuándo viaja.',
    ),
  desde: z.string().regex(FECHA).optional().describe('Fecha inicial inclusive, YYYY-MM-DD.'),
  hasta: z.string().regex(FECHA).optional().describe('Fecha final inclusive, YYYY-MM-DD.'),
  cliente: z.string().optional().describe('Texto a buscar en el nombre del cliente.'),
  servicio: z.string().optional().describe('Texto a buscar en el nombre del servicio o viaje.'),
  limite: z.number().int().min(1).max(100).default(25).describe('Máximo de ventas a devolver.'),
})

type ArgsVentas = z.infer<typeof esquemaVentas>

/** Día siguiente en ISO (`2026-08-31` → `2026-09-01`). */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Query-string de PostgREST para la lista de ventas.
 *
 * `travel_date` es `date` y admite `lte` directo; `created_at` es `timestamptz`,
 * donde `lte.2026-08-31` sería medianoche y se comería casi todo el último día:
 * por eso el corte superior es `lt.<día siguiente>`.
 *
 * ponytail: ese corte usa UTC, no la zona de la agencia. Una venta hecha después
 * de las 18:00 en México cae en el día siguiente en UTC. Es un filtro de lista,
 * no un reporte contable — si algún día importa al peso, va en SQL, no aquí.
 */
export function queryVentas(a: ArgsVentas): string {
  const partes: string[] = []
  const cliente = a.cliente?.trim()
  const servicio = a.servicio?.trim()

  // `!inner` sólo cuando se filtra por el nombre embebido: sin él, PostgREST
  // aplicaría el filtro al embed y dejaría pasar la venta con el cliente en null.
  partes.push(
    `select=${COLS_LISTA}` +
      `,customer:customers${cliente ? '!inner' : ''}(id,full_name,phone)` +
      `,service:services${servicio ? '!inner' : ''}(id,name)`,
  )

  if (a.estado) partes.push(`status=eq.${q(a.estado)}`)
  if (a.desde) partes.push(`${a.campo_fecha}=gte.${q(a.desde)}`)
  if (a.hasta) {
    partes.push(
      a.campo_fecha === 'travel_date'
        ? `travel_date=lte.${q(a.hasta)}`
        : `created_at=lt.${q(diaSiguiente(a.hasta))}`,
    )
  }
  if (cliente) partes.push(`customer.full_name=ilike.*${q(cliente)}*`)
  if (servicio) partes.push(`service.name=ilike.*${q(servicio)}*`)

  partes.push('order=created_at.desc', `limit=${a.limite}`)
  return partes.join('&')
}

type FilaVenta = {
  id: string
  folio: string | null
  status: string
  travel_date: string | null
  num_pax: number
  total: number
  currency: string
  paid: number
  balance: number
  created_at: string
  customer: { id: string; full_name: string; phone: string | null } | null
  service: { id: string; name: string } | null
}

async function listarVentas(args: Record<string, unknown>) {
  const a = esquemaVentas.parse(args)
  const filas = await select<FilaVenta[]>('bookings_with_balance', queryVentas(a))
  return {
    total_devuelto: filas.length,
    nota:
      filas.length === a.limite
        ? `Se alcanzó el límite de ${a.limite}: puede haber más ventas fuera de esta lista.`
        : undefined,
    ventas: filas.map((v) => ({
      id: v.id,
      folio: v.folio,
      estado: v.status,
      cliente: v.customer?.full_name ?? null,
      cliente_id: v.customer?.id ?? null,
      telefono: v.customer?.phone ?? null,
      servicio: v.service?.name ?? null,
      fecha_viaje: v.travel_date,
      pax: v.num_pax,
      moneda: v.currency,
      total: v.total,
      pagado: v.paid,
      saldo: v.balance,
      vendida_el: v.created_at,
    })),
  }
}

// ── detalle ──────────────────────────────────────────────────────────────────

const COLS_DETALLE =
  'id,folio,quote_folio,status,travel_date,due_date,num_pax,subtotal,discount,total,' +
  'currency,exchange_rate,payment_type,plan_frequency,plan_final_date,notes,cancel_reason,' +
  'cancel_fee_mxn,cancelled_at,policy_accepted_at,created_at,quote_token,owner_supplier_id,' +
  'selling_supplier_id,customer_id,service_id,marketplace_customer_id,' +
  'customer:customers(id,full_name,phone,email),service:services(id,name)'

type Detalle = {
  id: string
  customer_id: string | null
  owner_supplier_id: string
  selling_supplier_id: string
  status: string | null
  quote_token: string | null
  [k: string]: unknown
}

/** Lo opcional no debe tumbar el detalle completo: si una parte falla, va en null. */
const opcional = <T>(p: Promise<T>) => p.catch(() => null)

async function verVenta(args: Record<string, unknown>) {
  const { venta_id: id } = z
    .object({ venta_id: z.string().uuid().describe('UUID de la venta o cotización.') })
    .parse(args)
  const f = `booking_id=eq.${q(id)}`

  const [venta, saldo, lineas, abonos, recibos, pasajeros, vouchers, plan, asientos] =
    await Promise.all([
      select<Detalle[]>('bookings', `select=${COLS_DETALLE}&id=eq.${q(id)}&limit=1`),
      opcional(select<{ paid: number; balance: number }[]>(
        'bookings_with_balance',
        `select=paid,balance&id=eq.${q(id)}`,
      )),
      opcional(select('booking_items', `select=id,item_type,passenger_type,description,qty,unit_price,line_total&${f}&order=created_at`)),
      opcional(select('payments', `select=id,amount_mxn,type,status,payment_method,paid_at,refunds_payment_id,credit_id&${f}&order=paid_at`)),
      opcional(select('receipts', `select=id,folio,payment_id,amount,issued_at&${f}&order=folio`)),
      opcional(select('booking_passengers', `select=id,full_name,passenger_type,doc_id,boarded_at&${f}&order=created_at`)),
      opcional(select('vouchers', `select=id,folio,created_at&${f}`)),
      opcional(select('payment_schedule', `select=seq,kind,due_date,amount&${f}&order=seq`)),
      opcional(rpc('seat_map_for_booking', { p_booking_id: id })),
    ])

  const b = venta[0]
  if (!b) {
    throw new KetzalError(
      'No encontré esa venta. O el id está mal, o pertenece a otra agencia (la RLS ' +
        'sólo deja ver las de la tuya).',
    )
  }

  // Crédito universal: es de la PERSONA, así que depende del cliente de la venta.
  const creditos = b.customer_id
    ? await opcional(rpc('list_customer_credits', { p_customer: b.customer_id }))
    : []

  const { customer, service, ...campos } = b as Detalle & {
    customer?: unknown
    service?: unknown
  }

  // Ligas públicas de los documentos: es lo que se manda por WhatsApp. Se arman
  // aquí, con el token/uuid que ya vino de la BD, para que el agente nunca tenga
  // que adivinar la URL de un documento de dinero. El estado de cuenta pide su
  // token aparte (`ensure_statement_token` lo crea la primera vez) y sólo existe
  // para ventas cerradas — en `draft` el RPC falla y la liga se omite.
  const rec = (recibos as { id: string; folio: number }[] | null) ?? []
  const vou = ((vouchers as { id: string; folio: number }[] | null) ?? [])[0]
  const tokenEstado =
    b.status && b.status !== 'draft'
      ? await opcional(rpc<string>('ensure_statement_token', { p_booking_id: id }))
      : null

  const links: Record<string, unknown> = {}
  if (tokenEstado) links.estado_de_cuenta = `${APP_URL}/estado/${tokenEstado}`
  if (b.quote_token) links.cotizacion = `${APP_URL}/cotizacion/${b.quote_token}`
  if (vou) links.voucher = `${APP_URL}/voucher/${vou.id}`
  if (rec.length) {
    links.recibos = rec.map((r) => ({ folio: r.folio, url: `${APP_URL}/recibo/${r.id}` }))
  }

  return {
    venta: campos,
    cliente: customer ?? null,
    servicio: service ?? null,
    // Derivado en la BD (`bookings_with_balance`), nunca recalculado aquí.
    dinero: saldo?.[0] ?? null,
    es_reventa: b.owner_supplier_id !== b.selling_supplier_id,
    lineas,
    abonos,
    recibos,
    pasajeros,
    voucher: vou ?? null,
    plan_pagos: plan,
    asientos,
    creditos_del_cliente: creditos,
    links,
  }
}

export const tools: ToolDef[] = [
  {
    name: 'ketzal_ventas',
    title: 'Listar ventas y cotizaciones',
    description:
      'Lista ventas con su saldo, filtrando por estado, rango de fechas, cliente o servicio. ' +
      'Úsala para "¿qué vendimos este mes?", "ventas pendientes de pago", "cotizaciones sin cerrar" ' +
      'o para encontrar el id de una venta antes de pedir su detalle. Devuelve total, pagado y ' +
      'saldo ya derivados por la base de datos.',
    inputSchema: esquemaVentas,
    handler: listarVentas,
  },
  {
    name: 'ketzal_venta',
    title: 'Detalle completo de una venta',
    description:
      'Todo lo de una venta en una sola llamada: datos, líneas de precio, abonos y reembolsos, ' +
      'recibos emitidos, pasajeros, voucher, plan de pagos, mapa de asientos y créditos ' +
      'disponibles del cliente. Úsala cuando ya tengas el id (de ketzal_ventas) y necesites ' +
      'contexto para cobrar, cancelar, emitir un documento o responder al cliente.',
    inputSchema: z.object({
      venta_id: z.string().uuid().describe('UUID de la venta o cotización (campo `id`).'),
    }),
    handler: verVenta,
  },
]

// `ketzal_convertir_cotizacion` se eliminó a propósito (b071): con el flujo
// estricto cotización→abono→venta (b070) la única forma de que una cotización
// ascienda es un pago real — este tool era el último camino que convertía con
// $0 cobrado. El RPC `convert_quote_to_sale` quedó revocado a `authenticated`.
