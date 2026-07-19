// Self-check de la normalización del lector de PDF/imagen.
// Correr:  node --test src/lib/ai/
// Es .mjs a propósito: queda fuera del tsconfig y Node 24 hace el type-stripping
// del .ts que importa, así que no hace falta test runner ni build.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BYTES, normalizarLeido, tieneDatos } from './servicio-leido.ts'

// La regresión que rompió el lector en prod: el tope era 6 MB y Vercel corta el
// body en 4.5 MB, así que el 413 mataba el request antes de que el action
// corriera. Si alguien vuelve a subir MAX_BYTES, esto truena antes que prod.
test('MAX_BYTES cabe en el body de 4.5 MB de Vercel, con aire de multipart', () => {
  const TECHO_VERCEL = 4.5 * 1024 * 1024
  assert.ok(MAX_BYTES < TECHO_VERCEL, 'MAX_BYTES excede el techo duro de Vercel')
  assert.ok(
    TECHO_VERCEL - MAX_BYTES > 256 * 1024,
    'sin margen para el overhead del multipart'
  )
})

test('basura de entrada no explota', () => {
  for (const basura of [null, undefined, 'texto', 42, [], [{ name: 'x' }]]) {
    assert.deepEqual(normalizarLeido(basura), {})
  }
  assert.equal(tieneDatos(normalizarLeido(null)), false)
})

test('precios sucios se limpian, negativos se descartan', () => {
  assert.equal(normalizarLeido({ price: '$1,500.00 MXN' }).price, 1500)
  assert.equal(normalizarLeido({ price: 2499.999 }).price, 2500)
  assert.equal(normalizarLeido({ price: -10 }).price, undefined)
  assert.equal(normalizarLeido({ price: 'gratis' }).price, undefined)
  assert.equal(normalizarLeido({ price: null }).price, undefined)
})

test('cupo debe ser entero >= 1', () => {
  assert.equal(normalizarLeido({ max_capacity: '40 personas' }).max_capacity, 40)
  assert.equal(normalizarLeido({ max_capacity: 12.7 }).max_capacity, 12)
  assert.equal(normalizarLeido({ max_capacity: 0 }).max_capacity, undefined)
})

test('solo pasan fechas YYYY-MM-DD reales', () => {
  assert.equal(normalizarLeido({ available_from: '2026-03-15' }).available_from, '2026-03-15')
  assert.equal(normalizarLeido({ available_from: '15/03/2026' }).available_from, undefined)
  assert.equal(normalizarLeido({ available_from: '2026-02-31' }).available_from, undefined)
  assert.equal(normalizarLeido({ available_from: '2026-13-01' }).available_from, undefined)
})

test('listas: recorta, tira vacíos y topa el largo', () => {
  const d = normalizarLeido({ includes: ['  Transporte  ', '', '   ', 'Desayuno', 7] })
  assert.deepEqual(d.includes, ['Transporte', 'Desayuno'])
  assert.equal(normalizarLeido({ includes: [] }).includes, undefined)
  assert.equal(normalizarLeido({ includes: Array(200).fill('x') }).includes.length, 40)
})

test('itinerario: días sin título se caen, description default ""', () => {
  const d = normalizarLeido({
    itinerary: [
      { title: 'Día 1', description: 'Llegada' },
      { description: 'huérfano' },
      { title: 'Día 2' },
      'basura',
    ],
  })
  assert.deepEqual(d.itinerary, [
    { title: 'Día 1', description: 'Llegada' },
    { title: 'Día 2', description: '' },
  ])
})

test('packs: solo precios válidos, se conserva la key', () => {
  const d = normalizarLeido({
    packs: { sencilla: '3,200', doble: 2800, triple: 'n/a', cuadruple: -5 },
  })
  assert.deepEqual(d.packs, { sencilla: 3200, doble: 2800 })
  assert.equal(normalizarLeido({ packs: [] }).packs, undefined)
})

test('los campos ausentes NO aparecen (no pisan el form con vacíos)', () => {
  const d = normalizarLeido({ name: 'Tour Samalayuca', description: '   ' })
  assert.deepEqual(Object.keys(d), ['name'])
  assert.equal('description' in d, false)
  assert.equal(tieneDatos(d), true)
})
