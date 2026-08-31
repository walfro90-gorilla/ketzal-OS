import { randomInt } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

// Entrega de acceso a una persona que NO se registra sola (admin de agencia
// invitado, embajador reclutado, proveedor con portal): se le emite una
// contraseña PROVISIONAL que el operador le pasa por WhatsApp, y al primer login
// la app la obliga a fijar la suya (`profiles.must_change_password`).
//
// Por qué no un magic-link, que era el camino anterior de embajadores y
// proveedores: NUNCA funcionó, por dos razones independientes y medidas.
//   1. `admin.generateLink` devuelve un `/auth/v1/verify` que aterriza en
//      `/auth/callback` con la sesión en el FRAGMENTO (`#access_token=…`). El
//      callback es un Route Handler de servidor y el fragmento no sale del
//      navegador: leía `?code=` (PKCE), no lo encontraba y mandaba a
//      `/login?error=auth`. Siempre.
//   2. El token es de UN SOLO USO y el crawler de vista previa de WhatsApp abre
//      el link para armar la tarjeta. Para cuando la persona lo toca, ya está
//      quemado — el segundo GET responde `#error=…`.
// Una contraseña sobrevive a las dos cosas: no caduca en una hora, no la quema
// una vista previa, y se puede volver a leer en el chat.
//
// La provisional NO se guarda en ningún lado (auth.users la hashea) ni se
// registra en bitácora: se devuelve UNA vez para que el operador la copie. Si se
// pierde, se emite otra — por eso esto es idempotente y sin ceremonia.

/** Contraseña provisional legible por teléfono: se dicta sin ambigüedad. */
export function nuevaProvisional(): string {
  return `Ketzal-${randomInt(100000, 999999)}`
}

/**
 * Emite una contraseña provisional para `userId` y marca que debe cambiarla.
 * NO valida permisos: cada llamador pone su propia puerta antes (el service role
 * no respeta RLS). Devuelve el correo de `auth.users`, que es el que sirve para
 * entrar — `profiles.email` puede diferir.
 */
export async function emitirCredencialProvisional(
  userId: string,
): Promise<{ error: string } | { credentials: { email: string; password: string } }> {
  const svc = createServiceClient()
  const { data: authUser, error: eGet } = await svc.auth.admin.getUserById(userId)
  const email = authUser?.user?.email
  if (eGet || !email) return { error: safeError(eGet, 'No se encontró la cuenta.') }

  const password = nuevaProvisional()
  const { error: ePwd } = await svc.auth.admin.updateUserById(userId, { password })
  if (ePwd) return { error: safeError(ePwd, 'No se pudo generar la contraseña.') }

  // `authenticated` no escribe profiles (b017) ⇒ service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eFlag } = await (svc as any)
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', userId)
  // Sin el flag la contraseña provisional se vuelve permanente en silencio: se
  // deshace la emisión en vez de entregar un acceso que nadie va a cambiar.
  if (eFlag) return { error: safeError(eFlag, 'No se pudo marcar el cambio de contraseña.') }

  return { credentials: { email, password } }
}
