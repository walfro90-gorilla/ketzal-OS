import { listPublicServices } from '@/app/explora/data'
import { getPublicService } from '@/app/servicio/[id]/data'
import { destino } from '@/components/data/format'

// Inventario REAL para la home (KETZAL_HOME_REDESIGN.md §6.7): las mismas RPC
// anónimas de la vitrina (`list_public_services` + `get_public_service`, ambas
// SECURITY DEFINER y solo `published`), así la sección nunca muestra algo que
// el marketplace no muestre. Server-only: importa la capa de datos del servidor.
// ponytail: 1 + N llamadas (N ≤ 3, cacheadas por request). Si el catálogo
// crece, una RPC `home_inventory` que traiga la próxima salida en una pasada.

export type TarjetaSalida = {
  id: string
  nombre: string
  agencia: string
  destino: string | null
  imagen: string | null
  precio: number | null
  /** Próxima salida con cupo (YYYY-MM-DD). */
  proxima: string
  /** Lugares libres en esa salida. */
  libres: number
}

// La spec pide la Huasteca de Border Travels como ejemplo real; va primero.
const EJEMPLO = 'b32907ab-0fe2-4e0c-a74b-c315622317c7'

export async function inventarioHome(max = 3): Promise<TarjetaSalida[]> {
  const catalogo = await listPublicServices()
  // Con foto y ordenado: el ejemplo de la spec primero, luego el resto como
  // los devuelve la vitrina. Se piden hasta max+2 fichas por si alguna no tiene
  // salida futura con cupo.
  const candidatos = [...catalogo]
    .filter((s) => s.image)
    .sort((a, b) => Number(b.id === EJEMPLO) - Number(a.id === EJEMPLO))
    .slice(0, max + 2)
  const fichas = await Promise.all(candidatos.map((s) => getPublicService(s.id)))
  const tarjetas: TarjetaSalida[] = []
  for (const f of fichas) {
    const salida = f?.departures?.[0]
    if (!f || !salida) continue
    tarjetas.push({
      id: f.id,
      nombre: f.name,
      agencia: f.agency.name,
      destino: destino(f),
      imagen: f.images?.imgBanner ?? f.images?.imgAlbum?.[0] ?? null,
      precio: f.price,
      proxima: salida.departs_on,
      libres: salida.free,
    })
    if (tarjetas.length === max) break
  }
  return tarjetas
}
