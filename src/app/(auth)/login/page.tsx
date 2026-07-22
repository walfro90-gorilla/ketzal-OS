'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BorderBeam } from '@/components/ui/border-beam'

type Mode = 'magic' | 'password'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

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

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setLinkSent(false)
  }

  const handleMagicLink = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setLinkSent(false)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) {
      setError('No se pudo enviar el enlace. Verifica el correo e intenta de nuevo.')
      return
    }
    setLinkSent(true)
  }

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError('Correo o contraseña incorrectos.')
      return
    }
    // '/' resuelve el aterrizaje por persona (agente → dashboard, viajero → mis-compras).
    router.push('/')
    router.refresh()
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // En éxito el navegador se redirige a Google; solo llegamos aquí si falla.
    if (error) {
      setLoading(false)
      setError('No se pudo iniciar sesión con Google. Intenta de nuevo.')
    }
  }

  return (
    <Card className="relative w-full max-w-sm overflow-hidden">
      <BorderBeam />
      <CardHeader className="text-center">
        <CardTitle className="flex justify-center">
          <BrandLogo className="h-27 max-w-[360px]" />
        </CardTitle>
        <CardDescription>
          Back-office de ventas. Inicia sesión para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          Continuar con Google
        </Button>

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
              <Input
                id="password"
                type="password"
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
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
