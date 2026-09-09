// Costeo de un tour (ADR-0055): el tarifario de cada proveedor y la hoja de
// costeo de un servicio son un PLAN, no un ledger. El dinero real sigue en
// `expenses`. Módulo puro (sin 'use server'): lo importan las server actions
// (frontera de confianza) y el form del costeo (cálculo en cliente).
//
// Unidades de costo y cómo escalan con N pasajeros:
//   pax        · por persona           ⇒ cost · qty · N
//   grupo      · fijo por viaje        ⇒ cost · qty · unidades(N)
//   dia        · fijo por día          ⇒ cost · qty · unidades(N)   (qty = DÍAS de esa línea)
//   noche      · fijo por noche        ⇒ cost · qty · unidades(N)   (qty = NOCHES: cabaña, quinta, camping)
//   habitacion · por habitación-noche  ⇒ por pax y por pack: cost_by_pack[pack] / ocupación · noches
// `cap` (opcional en grupo/día) es el cupo por unidad: una sprinter de 15 a
// 16 pax son 2 sprinters. Ese escalón es lo que hace mentir a un equilibrio
// "cerrado"; por eso el punto de equilibrio se busca por escaneo.
//
// En una línea por día la cantidad SON los días (1.5 = día y medio de van). La
// cabecera `days` NO vuelve a multiplicar: hasta el 2026-09-08 lo hacía y una
// quinta de $12,500 "por día" en un fin de semana de 2 días salía en $25,000.
// El form precarga la cantidad con los días del viaje; la persona la ajusta.
//
// Margen = utilidad ÷ precio (la misma convención que reportes y gross-up),
// bruto: comisiones de agente/embajador y `commission_rate` salen de ahí.

import { OCCUPANCY, PACK_TYPES, type Pack, type PackKey } from './packs'
import { slug, type AddOn } from './addons'
import { round2 } from './currency'

export const UNITS = ['pax', 'grupo', 'dia', 'noche', 'habitacion'] as const
export type Unit = (typeof UNITS)[number]

export const UNIT_LABELS: Record<Unit, string> = {
  pax: 'Por persona',
  grupo: 'Por grupo (fijo por viaje)',
  dia: 'Por día',
  noche: 'Por noche',
  habitacion: 'Por habitación y noche',
}

export type CostByPack = Partial<Record<PackKey, number>>

/** Cuerpo común de una tarifa: qué se cobra y en qué unidad. */
type RateBody = {
  label: string
  unit: Unit
  /** pax | grupo | dia | noche. MXN. */
  cost?: number
  /** grupo | dia | noche: cupo por unidad (sprinter 15, cabaña 8). */
  cap?: number
  /** habitacion: costo por noche según pack; falta = ese hotel no ofrece el pack. */
  cost_by_pack?: CostByPack
}

/** Lo que manda la UI del tarifario (strings sin limpiar). */
export type RateInput = {
  label: string
  unit: string
  cost?: number | string | null
  cap?: number | string | null
  cost_by_pack?: Record<string, number | string | null | undefined> | null
}

/** Lo que se guarda en supplier_rate_cards.rates (jsonb). */
export type RateLine = RateBody & { key: string }

/** Una tarifa elegida para un tour: snapshot de la tarifa + de quién. */
export type CostLine = RateBody & {
  supplier_id: string
  supplier_name: string
  rate_key: string
  /** Cuántas veces entra la tarifa (2 sprinters, 2 comidas). No aplica a habitación. */
  qty: number
}

export type AddonCost = { cost: number; supplier_id?: string; supplier_name?: string }

/** Lo que se guarda en service_costings.doc (jsonb). */
export type Costeo = {
  plan_pax: number
  nights: number
  days: number
  /** Margen bruto objetivo sobre el precio, 0 ≤ x < 100. */
  margin_pct: number
  /**
   * ADR-0061: precio de venta por pax que la persona quiere probar; null =
   * usar el sugerido por el margen. Con él salen equilibrio y utilidad aunque
   * el servicio aún no tenga packs.
   */
  precio_venta: number | null
  /** Colchón sobre TODO el costo (gasolina que sube, propina, un pax que no llega). */
  imprevistos_pct: number
  /** true = se vende por el portal: la utilidad neta descuenta la comisión de Ketzal. */
  portal: boolean
  lines: CostLine[]
  /** Costo por persona de cada add-on vendido, por `services.add_ons[].key`. */
  addon_costs: Record<string, AddonCost>
}

export const COSTEO_VACIO: Costeo = {
  plan_pax: 1,
  nights: 0,
  days: 1,
  margin_pct: 30,
  precio_venta: null,
  imprevistos_pct: 5,
  portal: false,
  lines: [],
  addon_costs: {},
}

// ------------------------------------------------------------ limpieza -----

const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const esUnidad = (u: unknown): u is Unit => UNITS.includes(u as Unit)

/** Valida el cuerpo de una tarifa; null si no se puede guardar. */
function limpiarCuerpo(r: {
  label?: unknown
  unit?: unknown
  cost?: unknown
  cap?: unknown
  cost_by_pack?: unknown
}): RateBody | null {
  const label = String(r.label ?? '').trim()
  if (!label || !esUnidad(r.unit)) return null
  if (r.unit === 'habitacion') {
    const src = (r.cost_by_pack ?? {}) as Record<string, unknown>
    const cbp: CostByPack = {}
    for (const t of PACK_TYPES) {
      const c = num(src[t.key])
      if (c != null && c > 0) cbp[t.key] = round2(c)
    }
    if (Object.keys(cbp).length === 0) return null
    return { label, unit: 'habitacion', cost_by_pack: cbp }
  }
  const cost = num(r.cost)
  if (cost == null || cost < 0) return null
  const body: RateBody = { label, unit: r.unit, cost: round2(cost) }
  const cap = num(r.cap)
  if (r.unit !== 'pax' && cap != null && cap > 0) body.cap = Math.floor(cap)
  return body
}

/**
 * Limpia el tarifario: descarta renglones inválidos, sella la key desde el
 * nombre y desempata colisiones con sufijo (-2, -3): dos "Camioneta" con
 * distinto costo son plausibles y no debe ganar el último en silencio.
 */
export function limpiarTarifario(rows?: RateInput[]): RateLine[] {
  const out: RateLine[] = []
  const usadas = new Set<string>()
  for (const r of rows ?? []) {
    const body = limpiarCuerpo(r ?? {})
    if (!body) continue
    const base = slug(body.label) || 'tarifa'
    let key = base
    for (let i = 2; usadas.has(key); i++) key = `${base}-${i}`
    usadas.add(key)
    out.push({ key, ...body })
  }
  return out
}

const entero = (v: unknown, min: number, def: number): number => {
  const n = num(v)
  return n == null ? def : Math.max(min, Math.floor(n))
}

/**
 * Limpia la hoja de costeo (espejo TS del CHECK `valid_costing`): normaliza
 * la cabecera a rangos válidos, descarta líneas sin proveedor o con tarifa
 * inválida, y tira los costos de add-ons cuya key ya no existe en el servicio
 * (renombrar un extra cambia su key; el costo huérfano no se conserva).
 */
export function limpiarCosteo(doc: unknown, addonKeys: string[]): Costeo {
  const d = (doc ?? {}) as Record<string, unknown>
  const days = entero(d.days, 1, 1)
  const margin = num(d.margin_pct)
  const lines: CostLine[] = []
  for (const raw of Array.isArray(d.lines) ? d.lines : []) {
    const l = (raw ?? {}) as Record<string, unknown>
    const body = limpiarCuerpo(l)
    const supplier_id = String(l.supplier_id ?? '').trim()
    if (!body || !supplier_id) continue
    const qty = num(l.qty)
    lines.push({
      supplier_id,
      supplier_name: String(l.supplier_name ?? '').trim(),
      rate_key: String(l.rate_key ?? '').trim(),
      qty: body.unit === 'habitacion' ? 1 : qty != null && qty > 0 ? round2(qty) : 1,
      ...body,
    })
  }
  const addon_costs: Record<string, AddonCost> = {}
  const src = (d.addon_costs ?? {}) as Record<string, Record<string, unknown> | undefined>
  for (const key of addonKeys) {
    const a = src[key]
    const cost = num(a?.cost)
    if (!a || cost == null || cost < 0) continue
    const ac: AddonCost = { cost: round2(cost) }
    if (a.supplier_id) ac.supplier_id = String(a.supplier_id)
    if (a.supplier_name) ac.supplier_name = String(a.supplier_name)
    addon_costs[key] = ac
  }
  return {
    plan_pax: entero(d.plan_pax, 1, 1),
    nights: entero(d.nights, 0, Math.max(0, days - 1)),
    days,
    margin_pct: margin == null ? COSTEO_VACIO.margin_pct : Math.min(99, Math.max(0, round2(margin))),
    precio_venta: (() => {
      const p = num(d.precio_venta)
      return p != null && p > 0 ? round2(p) : null
    })(),
    imprevistos_pct: (() => {
      const i = num(d.imprevistos_pct)
      return i == null ? COSTEO_VACIO.imprevistos_pct : Math.min(100, Math.max(0, round2(i)))
    })(),
    portal: d.portal === true,
    lines,
    addon_costs,
  }
}

// ------------------------------------------------------------- cálculo -----

/** Unidades necesarias para N pax (2 sprinters de 15 a 16 pax). Sin `cap`, 1. */
export function unidades(l: { cap?: number }, n: number): number {
  return l.cap && l.cap > 0 ? Math.max(1, Math.ceil(n / l.cap)) : 1
}

/** Costo de una línea para el grupo de N pax. Habitación no entra: va por pax y por pack. */
export function totalLinea(l: CostLine, n: number): number {
  const cost = l.cost ?? 0
  switch (l.unit) {
    case 'pax':
      return cost * l.qty * n
    case 'grupo':
    case 'dia':
    case 'noche':
      return cost * l.qty * unidades(l, n)
    case 'habitacion':
      return 0
  }
}

/** Costos fijos del viaje a N pax (grupo + día, con sus escalones). */
export function fijos(doc: Costeo, n: number): number {
  return doc.lines
    .filter((l) => l.unit === 'grupo' || l.unit === 'dia' || l.unit === 'noche')
    .reduce((s, l) => s + totalLinea(l, n), 0)
}

/** Costos que crecen uno a uno con cada pasajero. */
export function variablesPorPax(doc: Costeo): number {
  return doc.lines
    .filter((l) => l.unit === 'pax')
    .reduce((s, l) => s + (l.cost ?? 0) * l.qty, 0)
}

/**
 * Hospedaje por pax en un pack: Σ costo de la habitación / ocupación · noches.
 * `null` si algún hotel del costeo no ofrece ese pack (no se puede vender).
 */
export function habitacionPorPax(doc: Costeo, pack: PackKey): number | null {
  let s = 0
  for (const l of doc.lines) {
    if (l.unit !== 'habitacion') continue
    const c = l.cost_by_pack?.[pack]
    if (c == null) return null
    s += (c / OCCUPANCY[pack]) * doc.nights
  }
  return s
}

/**
 * Costo por pasajero en un pack, con el grupo a N pax, ya con el colchón de
 * imprevistos. `null` si N ≤ 0 o el pack no tiene hospedaje.
 */
export function costoPorPax(doc: Costeo, pack: PackKey, n: number): number | null {
  if (!(n > 0)) return null
  const hab = habitacionPorPax(doc, pack)
  if (hab == null) return null
  return (fijos(doc, n) / n + variablesPorPax(doc) + hab) * (1 + (doc.imprevistos_pct ?? 0) / 100)
}

/**
 * Redondeo comercial hacia ARRIBA (nunca por debajo del margen): a partir de
 * $1,000 termina en 99 (2,714 → 2,799, como los precios reales de las agencias);
 * abajo termina en 9 (732 → 739). Un precio exacto ya "comercial" no se mueve.
 */
export function redondeoComercial(x: number): number {
  if (!(x > 0)) return 0
  const paso = x >= 1000 ? 100 : 10
  return Math.ceil((x + 1) / paso) * paso - 1
}

/** Precio por pax que deja el margen objetivo, con redondeo comercial. */
export function precioSugerido(doc: Costeo, pack: PackKey, n: number): number | null {
  const c = costoPorPax(doc, pack, n)
  if (c == null) return null
  return redondeoComercial(c / (1 - doc.margin_pct / 100))
}

/** El precio con el que se evalúa el plan: el que tecleó la persona, o el sugerido. */
export function precioEfectivo(doc: Costeo, pack: PackKey, n: number): number | null {
  return doc.precio_venta ?? precioSugerido(doc, pack, n)
}

/** Pack de referencia: doble si existe (lo que casi todos compran), si no el más barato. */
export function packReferencia(packs: Pack[]): Pack | null {
  if (packs.length === 0) return null
  return packs.find((p) => p.key === 'doble') ?? packs.reduce((a, b) => (b.price < a.price ? b : a))
}

export type Margen = { ingreso: number; comision: number; costo: number; utilidad: number; pct: number | null }

/**
 * Margen del viaje a N pax, todos en `pack` al precio dado por pax. Si el
 * costeo está marcado `portal`, la comisión de Ketzal (`comisionPct`, la de
 * `app_settings`) sale del ingreso antes de la utilidad: es NETA de plataforma,
 * sigue siendo bruta de comisiones de agente o embajador.
 */
export function margenA(doc: Costeo, pack: PackKey, n: number, precioPorPax: number, comisionPct = 0): Margen | null {
  const c = costoPorPax(doc, pack, n)
  if (c == null) return null
  const ingreso = precioPorPax * n
  const comision = doc.portal ? (ingreso * comisionPct) / 100 : 0
  const costo = c * n
  const utilidad = ingreso - comision - costo
  return { ingreso, comision, costo, utilidad, pct: ingreso > 0 ? (utilidad / ingreso) * 100 : null }
}

/**
 * Primer N (1..maxN) que no pierde dinero. Escaneo, no fórmula: con `cap` la
 * segunda sprinter puede hacer que 15 gane y 16 pierda, y una fórmula cerrada
 * no ve ese escalón. `null` si ningún N alcanza.
 */
export function puntoEquilibrio(doc: Costeo, pack: PackKey, maxN: number, precioPorPax: number, comisionPct = 0): number | null {
  for (let n = 1; n <= maxN; n++) {
    const m = margenA(doc, pack, n, precioPorPax, comisionPct)
    if (m && m.utilidad >= 0) return n
  }
  return null
}

export type Escalon = { label: string; de: number; a: number; cap: number }

/**
 * Líneas con cupo que necesitan MÁS unidades a `m` pax que a `n` (una quinta
 * de 40 a 45 pax son dos quintas). Es lo que explica que "lleno" pierda cuando
 * "plan" gana: el costo no crece parejo, brinca.
 */
export function escalonesEntre(doc: Costeo, n: number, m: number): Escalon[] {
  const out: Escalon[] = []
  for (const l of doc.lines) {
    if (!l.cap || l.unit === 'habitacion' || l.unit === 'pax') continue
    const de = unidades(l, n)
    const a = unidades(l, m)
    if (a !== de) out.push({ label: l.label, de, a, cap: l.cap })
  }
  return out
}

export type Resumen = {
  pack: PackKey
  precio: number | null
  sugerido: number | null
  costoPax: number | null
  equilibrio: number | null
  plan: Margen | null
  lleno: Margen | null
}

/** Lo que pinta la tarjeta de resultado: un precio (tecleado o sugerido) y sus consecuencias. */
export function resumen(doc: Costeo, pack: PackKey, maxN: number, comisionPct = 0): Resumen {
  const n = doc.plan_pax
  const precio = precioEfectivo(doc, pack, n)
  return {
    pack,
    precio,
    sugerido: precioSugerido(doc, pack, n),
    costoPax: costoPorPax(doc, pack, n),
    equilibrio: precio == null ? null : puntoEquilibrio(doc, pack, maxN, precio, comisionPct),
    plan: precio == null ? null : margenA(doc, pack, n, precio, comisionPct),
    lleno: precio == null || maxN <= 0 ? null : margenA(doc, pack, maxN, precio, comisionPct),
  }
}

/** Utilidad por unidad vendida de un extra. Sin costo capturado, todo el precio es utilidad. */
export function margenAddon(addon: AddOn, c?: AddonCost): number {
  return round2(addon.price - (c?.cost ?? 0))
}

export type FilaPack = {
  key: PackKey
  label: string
  actual: number
  costo: number | null
  sugerido: number | null
  margen: Margen | null
}

/** Una fila por pack del servicio, al pax plan: costo/pax, sugerido y margen con el precio actual. */
export function tablaPorPack(doc: Costeo, packs: Pack[], comisionPct = 0): FilaPack[] {
  return packs.map((p) => ({
    key: p.key,
    label: p.label,
    actual: p.price,
    costo: costoPorPax(doc, p.key, doc.plan_pax),
    sugerido: precioSugerido(doc, p.key, doc.plan_pax),
    margen: margenA(doc, p.key, doc.plan_pax, p.price, comisionPct),
  }))
}

export type FilaPrecio = {
  key: PackKey
  label: string
  /** Precio que hoy tiene el servicio en ese pack; null = el pack no existe. */
  actual: number | null
  costo: number | null
  sugerido: number | null
  /** Lo que se escribiría al servicio: el precio tecleado (si no hay hospedaje, todos igual) o el sugerido. */
  propuesto: number | null
  margen: Margen | null
}

/**
 * Una fila por cada ocupación del catálogo (ADR-0061): sirve para CREAR las
 * opciones de precio de un servicio que aún no las tiene, o para revisar las
 * que tiene. Con hospedaje cada pack cuesta distinto y el propuesto es su
 * sugerido; sin hospedaje el costo es igual para todos y el precio tecleado
 * aplica a los que se elijan.
 */
export function filasPrecio(doc: Costeo, packs: Pack[], comisionPct = 0): FilaPrecio[] {
  const hayHospedaje = doc.lines.some((l) => l.unit === 'habitacion')
  return PACK_TYPES.map((t) => {
    const actual = packs.find((p) => p.key === t.key)?.price ?? null
    const sugerido = precioSugerido(doc, t.key, doc.plan_pax)
    const propuesto = doc.precio_venta != null && !hayHospedaje ? doc.precio_venta : sugerido
    return {
      key: t.key,
      label: t.label,
      actual,
      costo: costoPorPax(doc, t.key, doc.plan_pax),
      sugerido,
      propuesto,
      margen: propuesto == null ? null : margenA(doc, t.key, doc.plan_pax, propuesto, comisionPct),
    }
  })
}
