// Superficie pública del marketplace: aquí sí se mide (ADR-0025). El
// back-office NO — ni audiencias ni pageviews de agentes trabajando.
const PREFIJOS_MEDIBLES = [
  '/explora',
  '/servicio/',
  '/agencias',
  '/agencia/',
  '/comprar/',
  '/opina/',
  '/politica-cancelacion',
  '/entrar',
  '/mis-compras',
  '/descubre',
]

/** Pura: ¿esta ruta pertenece al marketplace público? */
export function esRutaMedible(path: string): boolean {
  return path === '/' || PREFIJOS_MEDIBLES.some((p) => path.startsWith(p))
}
