import { SITE_URL } from '@/lib/site-url'

// IndexNow (ADR-0026): avisa a Bing —y con él a la búsqueda de ChatGPT, que se
// apoya en ese índice— en cuanto un tour se publica o se despublica, en vez de
// esperar semanas a que pase el crawler. También lo consumen Yandex y Seznam.
// Google NO participa; para Google el camino sigue siendo el sitemap.
//
// Env-gated: sin `INDEXNOW_KEY` es no-op y no rompe nada. La clave no es un
// secreto — se publica en `/indexnow-key.txt` a propósito: así es como el
// buscador comprueba que quien avisa controla el dominio. Se pasa por env de
// todos modos para poder rotarla sin tocar código.

const ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Dónde se sirve la clave. Debe estar en el MISMO host que las URLs avisadas. */
export function indexNowKeyUrl(): string {
  return `${SITE_URL}/indexnow-key.txt`
}

export function indexNowKey(): string | null {
  return process.env.INDEXNOW_KEY?.trim() || null
}

/**
 * Avisa que estas URLs cambiaron. Nunca lanza: el aviso a un buscador jamás
 * debe tumbar la acción que lo disparó (publicar un servicio).
 */
export async function avisarIndexNow(urls: string[]): Promise<string> {
  const key = indexNowKey()
  if (!key || urls.length === 0) return 'skipped'
  try {
    const host = new URL(SITE_URL).host
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: indexNowKeyUrl(),
        urlList: urls,
      }),
      signal: AbortSignal.timeout(3000),
    })
    // 200 = aceptado, 202 = aceptado pero la clave aún no se ha comprobado.
    const estado = r.ok ? 'sent' : `failed_${r.status}`
    console.log('indexnow', estado, urls.length)
    return estado
  } catch {
    console.log('indexnow failed_network', urls.length)
    return 'failed_network'
  }
}
