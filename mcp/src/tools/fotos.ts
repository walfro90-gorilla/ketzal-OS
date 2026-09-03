/**
 * Fotos del servicio: banner y galería, subidas a Storage con el JWT del usuario.
 *
 * Cierra el "fuera de v1" del README: el MCP ya podía crear/editar servicios pero
 * las fotos se subían desde la app web. La subida va directo a la API de Storage
 * (bucket público `ketzal-assets`, INSERT autenticado ya permitido por policy)
 * con el token de la sesión — la RLS de `services` sigue decidiendo quién puede
 * ligar la foto al servicio, igual que en la app.
 *
 * Espeja `subirImagenServicio` (naming `services/<id>/<slot>-<ts>-<rand>.<ext>`,
 * mismos formatos y tope de 8 MB) y el merge NO destructivo de
 * `setServicioImagen`/`setServicioAlbum`: banner reemplaza, galería agrega, y
 * cualquier otra clave del jsonb `images` se preserva.
 */
import { readFile } from 'node:fs/promises'
import { SUPABASE_KEY, SUPABASE_URL } from '../config.js'
import { KetzalError } from '../errors.js'
import { q, select, update } from '../rest.js'
import { getAccessToken } from '../session.js'
import type { ToolDef } from './tipos.js'
import { z } from 'zod'

const BUCKET = 'ketzal-assets'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB, mismo tope que la app
const MAX_FOTOS = 20 // mismo tope que setServicioAlbum

const EXTS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Extensión + MIME a partir de la ruta local. Solo JPG/PNG/WebP, como la app. */
export function extDe(ruta: string): { ext: string; mime: string } {
  const ext = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()
  const mime = EXTS[ext]
  if (!mime) {
    throw new KetzalError(`Formato no válido: ${ruta}. Usa JPG, PNG o WebP.`)
  }
  return { ext: ext === 'jpeg' ? 'jpg' : ext, mime }
}

/**
 * Merge no destructivo del jsonb `images` (calco de la app): `banner` reemplaza
 * `imgBanner`, `albumNuevas` se AGREGA a `imgAlbum` (dedupe, tope 20). Preserva
 * cualquier otra clave. Devuelve cuántas fotos nuevas ya no cupieron.
 */
export function mergeImages(
  actual: unknown,
  cambios: { banner?: string; albumNuevas?: string[]; quitar?: string[] },
): { next: Record<string, unknown>; sinCupo: number; quitadas: number } {
  const base =
    actual && typeof actual === 'object' && !Array.isArray(actual)
      ? { ...(actual as Record<string, unknown>) }
      : {}
  if (cambios.banner) base.imgBanner = cambios.banner

  let sinCupo = 0
  let quitadas = 0
  const tieneLista = cambios.albumNuevas?.length || cambios.quitar?.length
  if (tieneLista) {
    let lista = Array.isArray(base.imgAlbum)
      ? (base.imgAlbum as unknown[]).map(String).filter(Boolean)
      : []

    // Quitar ANTES de agregar: así liberar espacio y llenarlo en la misma
    // llamada funciona, en vez de chocar contra el tope con huecos disponibles.
    if (cambios.quitar?.length) {
      const fuera = new Set(cambios.quitar)
      const antes = lista.length
      lista = lista.filter((u) => !fuera.has(u))
      quitadas = antes - lista.length
      // El banner también puede ser lo que se quiere quitar.
      if (typeof base.imgBanner === 'string' && fuera.has(base.imgBanner)) {
        base.imgBanner = null
        quitadas++
      }
    }

    for (const url of cambios.albumNuevas ?? []) {
      if (lista.includes(url)) continue
      if (lista.length >= MAX_FOTOS) {
        sinCupo++
        continue
      }
      lista.push(url)
    }
    base.imgAlbum = lista
  }
  return { next: base, sinCupo, quitadas }
}

/** Sube un archivo local al bucket público y devuelve su URL pública. */
async function subirAStorage(rutaLocal: string, destino: string, mime: string): Promise<string> {
  let cuerpo: Buffer
  try {
    cuerpo = await readFile(rutaLocal)
  } catch {
    throw new KetzalError(`No se pudo leer el archivo: ${rutaLocal}. ¿La ruta es correcta?`)
  }
  if (cuerpo.byteLength > MAX_BYTES) {
    throw new KetzalError(`${rutaLocal} pesa más de 8 MB. Comprímela e intenta de nuevo.`)
  }

  const send = async (token: string) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destino}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': mime,
        'cache-control': 'max-age=3600',
        'x-upsert': 'true',
      },
      body: new Uint8Array(cuerpo),
    })

  // Mismo reintento único en 401 que rest.ts: el rechazo ocurre antes de ejecutar.
  let r = await send(await getAccessToken())
  if (r.status === 401) r = await send(await getAccessToken(true))
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string }
    throw new KetzalError(
      `Storage rechazó la subida de ${rutaLocal}: ${j.message ?? `HTTP ${r.status}`}`,
    )
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${destino}`
}

function destinoPara(servicioId: string, slot: 'banner' | 'album', ext: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `services/${servicioId}/${slot}-${Date.now()}-${rand}.${ext}`
}

async function subirFotos(args: Record<string, unknown>) {
  const a = esquema.parse(args)
  const id = a.servicio_id.trim()
  if (!a.banner && !a.album?.length && !a.quitar?.length) {
    throw new KetzalError('Manda `banner`, `album` o `quitar`: no hay nada que hacer.')
  }

  // RLS primero: si el servicio no es tuyo, no se sube ni un byte a Storage.
  const filas = await select<{ id: string; name: string; images: unknown }[]>(
    'services',
    `select=id,name,images&id=eq.${q(id)}`,
  )
  const servicio = filas[0]
  if (!servicio) {
    throw new KetzalError('No existe ese servicio, o es de otra agencia y la RLS no te lo muestra.')
  }

  // Valida TODAS las rutas antes de subir la primera: falla temprano y completo.
  const banner = a.banner ? { ruta: a.banner, ...extDe(a.banner) } : null
  const album = (a.album ?? []).map((ruta) => ({ ruta, ...extDe(ruta) }))

  const bannerUrl = banner
    ? await subirAStorage(banner.ruta, destinoPara(id, 'banner', banner.ext), banner.mime)
    : undefined
  const albumUrls: string[] = []
  for (const f of album) {
    albumUrls.push(await subirAStorage(f.ruta, destinoPara(id, 'album', f.ext), f.mime))
  }

  const { next, sinCupo, quitadas } = mergeImages(servicio.images, {
    banner: bannerUrl,
    albumNuevas: albumUrls,
    quitar: a.quitar,
  })
  const actualizadas = await update<{ id: string }>(
    'services',
    `id=eq.${q(id)}&select=id`,
    { images: next },
  )
  if (!actualizadas.length) {
    throw new KetzalError('Las fotos subieron pero no se pudieron ligar al servicio (RLS).')
  }

  const galeria = Array.isArray(next.imgAlbum) ? (next.imgAlbum as string[]) : []
  return {
    servicio: { id, name: servicio.name },
    banner_url: (next.imgBanner as string | null) ?? null,
    album_agregadas: albumUrls,
    fotos_quitadas: quitadas,
    galeria_total: galeria.length,
    // Devolver la galería resultante es lo que hace utilizable a `quitar`: sin
    // las URLs a la vista no hay forma de nombrar cuál foto sobra.
    galeria: galeria,
    nota:
      'El banner es la foto principal (catálogo, ficha y preview social); la galería sale ' +
      'en el carrusel de la ficha pública.' +
      (sinCupo ? ` OJO: ${sinCupo} foto(s) ya no cupieron (tope ${MAX_FOTOS}).` : '') +
      ' `quitar` desliga la foto de la ficha pero NO la borra de Storage. ' +
      'Reordenar sigue siendo trabajo de la app web (/servicios).',
  }
}

const esquema = z.object({
  servicio_id: z.string().describe('Id del servicio al que se le suben las fotos.'),
  banner: z
    .string()
    .optional()
    .describe('Ruta LOCAL absoluta de la foto principal. Reemplaza el banner actual.'),
  quitar: z
    .array(z.string())
    .optional()
    .describe(
      'URLs públicas a desligar de la ficha (las que devuelve `galeria`, o el banner). ' +
        'No borra el archivo de Storage. Se aplica antes de agregar las nuevas.',
    ),
  album: z
    .array(z.string())
    .max(MAX_FOTOS)
    .optional()
    .describe('Rutas LOCALES absolutas de fotos de galería. Se AGREGAN a las existentes.'),
})

export const tools: ToolDef[] = [
  {
    name: 'ketzal_subir_fotos',
    title: 'Subir fotos a un servicio',
    description:
      'Sube el banner y/o fotos de galería de un servicio desde archivos locales ' +
      '(JPG/PNG/WebP, máx 8 MB cada una). El banner reemplaza al actual; la galería ' +
      'agrega hasta 20 fotos en total. Solo la agencia dueña (o superadmin) puede — ' +
      'misma RLS que la app. Las fotos quedan públicas de inmediato si el servicio ' +
      'está publicado.',
    write: true,
    inputSchema: esquema,
    handler: subirFotos,
  },
]
