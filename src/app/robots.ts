import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

// ADR-0026. Se indexa la superficie pública del marketplace; fuera el
// back-office, los flujos de auth y las vistas por token (links privados).
const DISALLOW = [
  '/api/',
  '/dashboard',
  '/ventas',
  '/cotizaciones',
  '/clientes',
  '/viajeros',
  '/cobranza',
  '/gastos',
  '/reportes',
  '/comisiones',
  '/cuentas',
  '/equipo',
  '/usuarios',
  '/servicios',
  '/salidas',
  '/abordaje',
  '/ajustes',
  '/clawbot',
  '/proveedores',
  '/investigacion',
  '/salud',
  '/login',
  '/entrar',
  '/auth/',
  '/recuperar',
  '/nueva-password',
  '/mis-compras',
  '/perfil',
  '/embajador',
  '/proveedor',
  '/cotizacion/',
  '/recibo/',
  '/voucher/',
  '/estado/',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      // Decisión de negocio (ADR-0026): bots de IA PERMITIDOS explícitamente —
      // queremos los tours en las respuestas de asistentes de IA.
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ClaudeBot',
          'PerplexityBot',
          'Google-Extended',
        ],
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
