'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BrandMark } from '@/components/brand-mark'
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

// Página PÚBLICA (usuario sin sesión). Envía el correo de recuperación; el
// enlace vuelve por /auth/callback y termina en /nueva-password.
export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/nueva-password`,
    })
    setLoading(false)
    if (error) {
      setError('No se pudo enviar el enlace. Verifica el correo e intenta de nuevo.')
      return
    }
    setSent(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark className="size-6 text-primary" />
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            Te enviamos un enlace para crear una nueva contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground" role="status">
                Revisa tu correo: te enviamos un enlace para restablecer tu
                contraseña. Ábrelo en este mismo navegador.
              </p>
              <Link
                href="/login"
                className="block text-sm text-muted-foreground hover:underline"
              >
                ← Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </Button>
              <Link
                href="/login"
                className="block text-center text-sm text-muted-foreground hover:underline"
              >
                ← Volver a iniciar sesión
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
