'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

// Ruta PROTEGIDA. Se llega por dos caminos, ambos ya con sesión:
//   · recuperación de contraseña (/auth/callback la establece), y
//   · contraseña PROVISIONAL sin cambiar — el gate `must_change_password` de las
//     tres superficies (ops, /embajador, /proveedor) manda aquí y no deja pasar.
// Aquí se fija la nueva contraseña.
export default function NuevaPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setLoading(false)
      setError(
        'No se pudo actualizar la contraseña. El enlace pudo expirar; solicita uno nuevo desde «Recuperar contraseña».'
      )
      return
    }
    // Si venía de una contraseña provisional (admin recién creado), baja el flag
    // must_change_password para que el shell deje de forzar esta pantalla. RPC
    // DEFINER (authenticated no escribe profiles, b017). No-op en el flujo normal
    // de recuperación. RPC nuevo ⇒ cast.
    await supabase.rpc('clear_password_change_flag' as never)
    // Nueva contraseña lista. A '/' y no a '/dashboard': esta pantalla ya no es
    // solo del agente (embajador y proveedor también llegan con provisional), y
    // '/' resuelve el aterrizaje por persona en vez de rebotar contra el gate.
    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark className="size-6 text-primary" />
          <CardTitle className="text-xl">Nueva contraseña</CardTitle>
          <CardDescription>Elige una contraseña para tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
