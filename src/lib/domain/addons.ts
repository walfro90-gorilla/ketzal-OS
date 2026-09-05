// Catálogo de add-ons por servicio (tirolesa, comida, seguro…). Config de
// PRECIO por concepto, lista ABIERTA (a diferencia de packs, que es fija por
// ocupación). Módulo puro (sin 'use server'): lo importan el server action del
// servicio y el form de venta (cliente) — calco del patrón de packs.ts.

/** Lo que manda la UI: nombre + precio. La key la sella el helper. */
export type AddOnInput = { label: string; price: number }

/** Lo que se guarda en services.add_ons (jsonb). Precio en MXN. */
export type AddOn = { key: string; label: string; price: number }

/**
 * key estable derivada del nombre (sin acentos, minúsculas, guiones).
 * CUIDADO: esta key IDENTIFICA UN DATO CON DINERO — es la `key` de cada add-on
 * (que tiene precio) y el `rate_key` del tarifario/costeo (b097). Cambiar esta
 * función renombra keys de add-ons ya vendidos y desalinea sus costos. No la
 * toques pensando que es un helper de texto cualquiera.
 */
export function slug(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Limpia los add-ons: valida nombre no vacío y precio > 0, deduplica por key
 * (gana el último, como packs) y redondea a 2 decimales. Los renglones
 * inválidos se descartan. La key la sella este helper, no la UI.
 */
export function limpiarAddOns(addons?: AddOnInput[]): AddOn[] {
  const byKey = new Map<string, AddOn>()
  for (const a of addons ?? []) {
    const label = String(a?.label ?? '').trim()
    if (!label) continue
    const price = Number(a?.price)
    if (!Number.isFinite(price) || price <= 0) continue
    const key = slug(label)
    byKey.set(key, { key, label, price: Math.round(price * 100) / 100 })
  }
  return [...byKey.values()]
}
