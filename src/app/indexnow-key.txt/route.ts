import { indexNowKey } from '@/lib/marketing/indexnow'

// El archivo de clave de IndexNow. El buscador lo pide para comprobar que
// quien manda el aviso controla el dominio, así que su contenido ES la clave
// y publicarla es el diseño del protocolo, no una fuga.
// Route handler (como llms.txt) para leerla de la env y poder rotarla sin
// desplegar un archivo nuevo. Sin `INDEXNOW_KEY` la ruta no existe: 404, y el
// aviso es no-op.
export function GET() {
  const key = indexNowKey()
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(key, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
