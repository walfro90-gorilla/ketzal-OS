// Feature flag del terreno del marketplace (Fase B). Apagado por default: el
// CTA "Comprar en línea" y la ruta /comprar/[id] quedan oscuros hasta que el
// flujo de pago esté probado. Se prende poniendo NEXT_PUBLIC_MARKETPLACE=on en
// el entorno (Vercel) y redeployando. Es NEXT_PUBLIC porque lo lee tanto el
// server (gate de la ruta) como el cliente (render del CTA).
export function marketplaceActivo(): boolean {
  return process.env.NEXT_PUBLIC_MARKETPLACE === 'on'
}
