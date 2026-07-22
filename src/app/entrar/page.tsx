'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { registrarComprador } from '@/app/comprar/actions'
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

// Entrada del VIAJERO (comprador B2C): iniciar sesión o crear cuenta, con cara de
// viaje (no "back-office de ventas", que es el /login del agente). El comprador
// usa email+password (registrarComprador NO pasa por /auth/callback ⇒ nunca nace
// agente). Al entrar va a '/', que resuelve por persona → /mis-compras.
type Modo = 'entrar' | 'crear'

function AuthCard() {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>('entrar')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [pending, start] = useTransition()

  function cambiar(m: Modo) {
    setModo(m)
    setError(null)
    setEnviado(false)
  }

  function entrar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Correo o contraseña incorrectos.')
        return
      }
      router.push('/') // resuelve por persona → /mis-compras
      router.refresh()
    })
  }

  function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await registrarComprador({ nombre, telefono, email, password })
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.needsConfirmation) {
        setEnviado(true)
        return
      }
      toast.success('¡Cuenta creada!')
      router.push('/')
      router.refresh()
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="flex justify-center">
          <BrandLogo className="h-20 max-w-[280px]" />
        </CardTitle>
        <CardDescription>Tus viajes en Ketzal. Entra o crea tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={modo === 'entrar' ? 'default' : 'outline'}
            onClick={() => cambiar('entrar')}
          >
            Entrar
          </Button>
          <Button
            type="button"
            variant={modo === 'crear' ? 'default' : 'outline'}
            onClick={() => cambiar('crear')}
          >
            Crear cuenta
          </Button>
        </div>

        {enviado ? (
          <p className="rounded-lg border bg-muted/40 p-4 text-sm" role="status">
            Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí para entrar.
          </p>
        ) : modo === 'entrar' ? (
          <form onSubmit={entrar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-email">Correo electrónico</Label>
              <Input
                id="e-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-pass">Contraseña</Label>
              <Input
                id="e-pass"
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="touch" className="w-full" disabled={pending}>
              {pending ? 'Entrando…' : 'Entrar'}
            </Button>
            <Link
              href="/recuperar"
              className="block text-center text-sm text-muted-foreground hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        ) : (
          <form onSubmit={crear} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-nombre">Nombre</Label>
              <Input
                id="c-nombre"
                value={nombre}
                onChange={(ev) => setNombre(ev.target.value)}
                placeholder="Tu nombre"
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-tel">Teléfono</Label>
              <Input
                id="c-tel"
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(ev) => setTelefono(ev.target.value)}
                placeholder="Ej. 656 123 4567"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">Correo electrónico</Label>
              <Input
                id="c-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-pass">Contraseña</Label>
              <Input
                id="c-pass"
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="touch" className="w-full" disabled={pending}>
              {pending ? 'Creando…' : 'Crear cuenta'}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          ¿Eres agencia?{' '}
          <Link href="/login" className="hover:underline">
            Entra al back-office
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function EntrarPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <AuthCard />
      </Suspense>
    </main>
  )
}
