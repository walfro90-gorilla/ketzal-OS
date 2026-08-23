'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'

/**
 * hCaptcha para los endpoints de Auth: registro, login por contraseña, magic
 * link y recuperación. Son los que Supabase protege cuando se prende
 * Authentication → Attack Protection → Enable CAPTCHA protection.
 *
 * Por qué existe: la publishable key viaja en el bundle del navegador (por
 * diseño), así que `POST /auth/v1/signup` es un endpoint público. El 2026-07-19
 * alguien lo usó para crear una cuenta en producción sin pasar por la app —
 * inofensivo (sin fila en `profiles` la RLS no da nada), pero gratis. Esto le
 * pone costo.
 *
 * **Sin `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` no renderiza nada** y el token va vacío,
 * así que la app se comporta igual antes y después de prender el switch. El
 * orden importa: primero la variable en Vercel + redeploy, después el switch en
 * Supabase. Al revés, Auth rechaza todos los logins hasta que el deploy llegue.
 */
export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? ''
export const captchaActivo = CAPTCHA_SITE_KEY.length > 0

export type CaptchaHandle = { reset: () => void }

export const Captcha = forwardRef<CaptchaHandle, { onToken: (token: string | null) => void }>(
  function Captcha({ onToken }, ref) {
    const widget = useRef<HCaptcha>(null)

    useImperativeHandle(ref, () => ({
      // Un token de hCaptcha es de UN SOLO USO. Si el intento falla (contraseña
      // mal, correo inexistente) hay que resetear, o el siguiente envío va con
      // uno ya quemado y el error que ve la persona es el equivocado.
      reset: () => {
        widget.current?.resetCaptcha()
        onToken(null)
      },
    }))

    if (!captchaActivo) return null

    return (
      <div className="flex justify-center">
        <HCaptcha
          ref={widget}
          sitekey={CAPTCHA_SITE_KEY}
          onVerify={onToken}
          onExpire={() => onToken(null)}
          onError={() => onToken(null)}
        />
      </div>
    )
  }
)

/** Mensaje único cuando falta resolver el captcha. `null` = se puede enviar. */
export function faltaCaptcha(token: string | null): string | null {
  return captchaActivo && !token ? 'Completa la verificación de seguridad.' : null
}
