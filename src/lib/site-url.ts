// URL base absoluta del sitio (OG, sitemap, robots, llms.txt, conversiones).
// En Vercel usa el dominio de producción; override con NEXT_PUBLIC_SITE_URL
// cuando exista dominio propio. ponytail: un env, sin config extra.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

/**
 * Origen para los links que van a un CLIENTE o prospecto (cotización, estado
 * de cuenta, recibo, voucher, link de referido, ficha compartida): SIEMPRE el
 * dominio público, aunque quien lo genere esté en `os.ketzal.tours` o en el
 * `ketzal-os.vercel.app` viejo. Sin la env (local, preview) cae al origen
 * actual — en local el puerto varía y `localhost:3000` a secas sería mentira.
 * Funciona en cliente y servidor: `NEXT_PUBLIC_*` se hornea en el bundle.
 */
export function origenPublico(actual?: string | null): string {
  return process.env.NEXT_PUBLIC_SITE_URL || actual || SITE_URL
}
