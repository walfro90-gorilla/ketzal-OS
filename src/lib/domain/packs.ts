// Paquetes por ocupación (habitación) para tours. Config de PRECIO, no de
// inventario: el cupo se descuenta por `num_pax` contra la salida, sin importar
// el tipo de habitación. Módulo puro (sin 'use server'): lo importan tanto el
// server action del servicio como el form de venta (cliente).

export const PACK_TYPES = [
  { key: 'sencilla', label: 'Sencilla (1 persona)' },
  { key: 'doble', label: 'Doble (2 personas)' },
  { key: 'triple', label: 'Triple (3 personas)' },
  { key: 'cuadruple', label: 'Cuádruple (4 personas)' },
] as const

export type PackKey = (typeof PACK_TYPES)[number]['key']

/** Lo que manda la UI: tipo + precio por persona. El label lo sella el server. */
export type PackInput = { key: string; price: number }

/** Lo que se guarda en services.packs (jsonb). Precio por persona en MXN. */
export type Pack = { key: PackKey; label: string; price: number }

/**
 * Limpia los paquetes: valida tipo conocido y precio ≥ 0, deduplica por tipo
 * y devuelve en orden canónico (sencilla → cuádruple). Los renglones sin
 * precio válido se descartan (permite renderizar los 4 y guardar solo los que
 * el proveedor llenó). El label lo sella este helper, no la UI.
 */
export function limpiarPacks(packs?: PackInput[]): Pack[] {
  const byKey = new Map<PackKey, Pack>()
  for (const p of packs ?? []) {
    const def = PACK_TYPES.find((t) => t.key === p?.key)
    if (!def) continue
    const price = Number(p?.price)
    if (!Number.isFinite(price) || price < 0) continue
    byKey.set(def.key, {
      key: def.key,
      label: def.label,
      price: Math.round(price * 100) / 100,
    })
  }
  return PACK_TYPES.map((t) => byKey.get(t.key)).filter((p): p is Pack => p != null)
}
