// Self-check del lector de links de producto de WhatsApp.
// Correr:  node --test 'src/lib/ai/*.test.mjs'
// Es .mjs a propósito: queda fuera del tsconfig y Node 24 hace el type-stripping
// del .ts que importa, así que no hace falta test runner ni build.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TITULO_MUERTO,
  extraerOg,
  textoDeProducto,
  urlProductoValida,
} from './wa-producto.ts'

// La whitelist es lo que merece test: el server hace fetch de una URL que
// teclea el usuario. Si se cuela otro host, es SSRF.
test('acepta las dos formas legítimas de link de producto', () => {
  for (const ok of [
    'https://wa.me/p/25550174681245544/59897697824939',
    'https://wa.me/p/1/2/',
    'http://wa.me/p/1/2',
    'https://www.whatsapp.com/product/1/2',
    'https://whatsapp.com/product/1/2/',
    '  https://wa.me/p/1/2  ',
  ]) {
    assert.ok(urlProductoValida(ok), `debió aceptar: ${ok}`)
  }
})

test('rechaza todo lo que no sea un producto de WhatsApp', () => {
  for (const malo of [
    // Host parecido: el error clásico de validar con includes().
    'https://wa.me.atacante.com/p/1/2',
    'https://atacante.com/wa.me/p/1/2',
    'https://evil.com/p/1/2',
    // SSRF hacia la red interna / metadatos del cloud.
    'http://169.254.169.254/p/1/2',
    'http://localhost/p/1/2',
    // Esquemas que no son HTTP.
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>',
    // Ruta que no es de producto — /c/ es el catálogo, que no sirve.
    'https://wa.me/c/56964151927',
    'https://wa.me/p/abc/def',
    'https://wa.me/p/1',
    'https://wa.me/p/1/2/extra',
    // Basura.
    '',
    '   ',
    'no soy una url',
    null,
    undefined,
    42,
    { url: 'https://wa.me/p/1/2' },
  ]) {
    assert.equal(urlProductoValida(malo), null, `debió rechazar: ${String(malo)}`)
  }
})

test('normaliza: fuera query, fragment y credenciales embebidas', () => {
  assert.equal(
    urlProductoValida('https://wa.me/p/1/2?utm_source=x&app_absent=0#frag'),
    'https://wa.me/p/1/2'
  )
  assert.equal(
    urlProductoValida('https://usuario:clave@wa.me/p/1/2'),
    'https://wa.me/p/1/2'
  )
})

test('extraerOg saca los 3 tags sin importar el orden de atributos', () => {
  const html = `<html><head>
    <meta property="og:title" content="Tour a Samalayuca" />
    <meta content="Duna y arena, 1 día" property="og:description">
    <meta name="og:image" content="https://cdn.whatsapp.net/foto.jpg">
    <meta property="og:site_name" content="WhatsApp.com" />
    <meta name="viewport" content="width=device-width">
  </head></html>`
  assert.deepEqual(extraerOg(html), {
    title: 'Tour a Samalayuca',
    description: 'Duna y arena, 1 día',
    image: 'https://cdn.whatsapp.net/foto.jpg',
  })
})

test('extraerOg desescapa entidades (WhatsApp las manda escapadas)', () => {
  const html = `<meta property="og:title" content="LIMIN&#039;s Tour &amp; Caf&#233;" />`
  assert.equal(extraerOg(html).title, "LIMIN's Tour & Café")
  // &amp; se resuelve al final: "&amp;lt;" es el texto "&lt;", no "<".
  assert.equal(
    extraerOg(`<meta property="og:title" content="a &amp;lt; b">`).title,
    'a &lt; b'
  )
})

test('página sin OG o vacía no inventa datos', () => {
  assert.deepEqual(extraerOg(''), {})
  assert.deepEqual(extraerOg('<html><body>hola</body></html>'), {})
  assert.equal(extraerOg(`<meta property="og:title" content="">`).title, undefined)
})

test('textoDeProducto detecta el producto muerto por contenido, no por status', () => {
  // WhatsApp responde 200 con este título cuando el producto ya no existe.
  assert.equal(textoDeProducto({ title: TITULO_MUERTO }), null)
  assert.equal(textoDeProducto({}), null)
  assert.equal(textoDeProducto({ description: 'sola' }), null)
})

test('textoDeProducto etiqueta las partes para el prompt', () => {
  assert.equal(
    textoDeProducto({ title: 'Tour Creel', description: '3 días' }),
    'Producto: Tour Creel\nDescripción: 3 días'
  )
  assert.equal(textoDeProducto({ title: 'Tour Creel' }), 'Producto: Tour Creel')
})
