import type { MetadataRoute } from 'next'
import { listPublicServices } from './explora/data'
import { SITE_URL } from '@/lib/site-url'

// ADR-0026: sitemap dinámico desde la vitrina pública (list_public_services,
// RPC anon — solo servicios published).
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const servicios = await listPublicServices()
  const now = new Date()
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: `${SITE_URL}/explora`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/agencias`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    ...servicios.map((s) => ({
      url: `${SITE_URL}/servicio/${s.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
