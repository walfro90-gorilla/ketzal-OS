'use client'

import { Suspense, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Captcha, type CaptchaHandle, faltaCaptcha } from '@/components/auth/captcha'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { GoogleButton } from '@/components/auth/google-button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { BorderBeam } from '@/components/ui/border-beam'

type Mode = 'magic' | 'password'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackError = searchParams.get('error') === 'auth'

  const [mode, setMode] = useState<Mode>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSent, setLinkSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captcha = useRef<CaptchaHandle>(null)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setLinkSent(false)
    // Cada modo monta su propio widget: el token del anterior ya no sirve.
    setCaptchaToken(null)
  }

  const handleMagicLink = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const falta = faltaCaptcha(captchaToken)
    if (falta) return setError(falta)
    setLoading(true)
    setError(null)
    setLinkSent(false)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken: captchaToken ?? undefined,
      },
    })
    setLoading(false)
    captcha.current?.reset()
    if (error) {
      setError('No se pudo enviar el enlace. Verifica el correo e intenta de nuevo.')
      return
    }
    setLinkSent(true)
  }

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const falta = faltaCaptcha(captchaToken)
    if (falta) return setError(falta)
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    })
    if (error) {
      setLoading(false)
      captcha.current?.reset()
      setError('Correo o contraseña incorrectos.')
      return
    }
    // La bitácora (b066) tampoco: el login por contraseña no toca el servidor,
    // así que se le avisa. Va con await para que la petición no se cancele al
    // navegar, y sin romper el login si falla.
    await fetch('/api/track/login', { method: 'POST' }).catch(() => {})
    // SaaS: el login por contraseña NO pasa por /auth/callback, así que la
    // auto-unión a la agencia que invitó a este correo se dispara aquí. No-op si
    // no hay invitación o si ya pertenece a una agencia (mismo RPC idempotente que
    // usa el callback de magic-link/Google). RPC nuevo ⇒ cast.
    await supabase.rpc('accept_pending_invitation' as never)
    // '/' resuelve el aterrizaje por persona (agente → dashboard, viajero → mis-compras).
    router.push('/')
    router.refresh()
  }


  return (
    <Card className="relative w-full max-w-sm overflow-hidden">
      <BorderBeam />
      <CardHeader className="text-center">
        <CardTitle className="flex justify-center">
          <BrandLogo className="h-27 max-w-[360px]" />
        </CardTitle>
        {/* La estela bajo el wordmark: la firma, no un divisor cualquiera. */}
        <div
          aria-hidden
          className="bg-estela mx-auto mt-2 h-1 w-16 rounded-full"
        />
        <CardDescription>
          Tu operación de ventas, en una sola app. Entra para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton disabled={loading} onError={(m) => setError(m || null)} />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              o con tu correo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === 'magic' ? 'default' : 'outline'}
            onClick={() => switchMode('magic')}
          >
            Enlace mágico
          </Button>
          <Button
            type="button"
            variant={mode === 'password' ? 'default' : 'outline'}
            onClick={() => switchMode('password')}
          >
            Contraseña
          </Button>
        </div>

        {callbackError && !error && !linkSent && (
          <p className="text-sm text-destructive" role="alert">
            El enlace no es válido o expiró. Intenta de nuevo.
          </p>
        )}

        {mode === 'magic' ? (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-magic">Correo electrónico</Label>
              <Input
                id="email-magic"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {linkSent && (
              <p className="text-sm text-muted-foreground" role="status">
                Revisa tu correo: te enviamos un enlace para entrar.
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Captcha ref={captcha} onToken={setCaptchaToken} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-password">Correo electrónico</Label>
              <Input
                id="email-password"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Captcha ref={captcha} onToken={setCaptchaToken} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
            <Link
              href="/recuperar"
              className="block text-center text-sm text-muted-foreground hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Estela ambiental: el rastro del quetzal detrás del acceso. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-estela absolute top-[-12%] left-1/2 h-[440px] w-[440px] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl" />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
