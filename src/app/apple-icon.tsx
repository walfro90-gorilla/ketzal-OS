import { brandIconResponse } from '@/lib/brand-icon'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS redondea las esquinas por su cuenta ⇒ va a sangre (maskable).
export default function AppleIcon() {
  return brandIconResponse(180, { maskable: true })
}
