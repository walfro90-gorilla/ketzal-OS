// URL base absoluta del sitio (OG, sitemap, robots, llms.txt, conversiones).
// En Vercel usa el dominio de producción; override con NEXT_PUBLIC_SITE_URL
// cuando exista dominio propio. ponytail: un env, sin config extra.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
