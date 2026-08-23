/**
 * Configuración del servidor.
 *
 * La URL y la llave publishable de Supabase son **públicas por diseño**: ya viajan
 * en el bundle del navegador de https://ketzal-os.vercel.app y cualquiera puede
 * leerlas desde la página. Vienen horneadas para que `npx -y ketzal-mcp` funcione
 * sin configuración; lo que protege la cuenta es el login del usuario y la RLS,
 * no la oscuridad de estas dos cadenas.
 *
 * Se pueden sobrescribir por env (útil si la llave rota, o para apuntar a otro
 * proyecto de Supabase).
 */
export const SUPABASE_URL =
  process.env.KETZAL_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://wnujoyzdpdyxblgdtxjw.supabase.co'

export const SUPABASE_KEY =
  process.env.KETZAL_SUPABASE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_LU0E9aZNyrOqW5WdVU0MkQ_VTlFuQx3'

/** El schema de negocio. `public` está vacío a propósito. */
export const SCHEMA = 'ketzal'

/** Solo lectura: esconde por completo las herramientas de escritura. */
export const READ_ONLY =
  process.env.KETZAL_MCP_READONLY === '1' || process.argv.includes('--read-only')

/**
 * Tope de escrituras por proceso. Un agente en bucle podría registrar 50 abonos;
 * el ledger es append-only y corregir eso son 50 contra-asientos. Al llegar al
 * tope, toda herramienta de escritura responde pidiendo reiniciar el servidor.
 */
export const MAX_WRITES = Number(process.env.KETZAL_MCP_MAX_WRITES ?? 20)

/**
 * Tope aparte para las escrituras que NO mueven dinero (catálogo, clientes,
 * pasajeros). Son editables: corregir un servicio es volver a editarlo, no un
 * contra-asiento. El freno anti-bucle sigue, pero no puede ser el mismo cupo que
 * el del ledger o cargar un catálogo de 12 viajes con sus salidas lo agota.
 */
export const MAX_DATA_WRITES = Number(process.env.KETZAL_MCP_MAX_DATA_WRITES ?? 100)

export const VERSION = '0.2.0'
