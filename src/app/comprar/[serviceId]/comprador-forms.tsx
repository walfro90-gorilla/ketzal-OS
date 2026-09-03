'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { registrarComprador, guardarComprador } from '../actions'
import { Captcha, type CaptchaHandle, faltaCaptcha } from '@/components/auth/captcha'

/** Alta rápida de comprador (visitante sin sesión). */
export function RegistroComprador({
  nombreInicial = '',
  next,
  onCreada,
}: {
  /** Prellena el nombre (p. ej. el que capturó el agente en la cotización). */
  nombreInicial?: string
  /** Ruta interna a la que volver si el proyecto exige confirmar el correo (b091). */
  next?: string
  /** Qué hacer al crear la cuenta con sesión; por default recarga la página. */
  onCreada?: () => void | Promise<void>
} = {}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [pending, start] = useTransition()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captcha = useRef<CaptchaHandle>(null)
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const falta = faltaCaptcha(captchaToken)
    if (falta) return toast.error(falta)
    start(async () => {
      const res = await registrarComprador({
        nombre,
        telefono,
        email,
        password,
        captchaToken: captchaToken ?? undefined,
        next,
      })
      if ('error' in res) {
        captcha.current?.reset()
        toast.error(res.error)
        return
      }
      if (res.needsConfirmation) {
        setEnviado(true)
      } else {
        toast.success('¡Cuenta creada!')
        if (onCreada) await onCreada()
        else router.refresh()
      }
    })
  }

  if (enviado) {
    return (
      <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
        Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a esta
        página para continuar.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Crea tu cuenta para comprar en línea. Es rápido.
      </p>
      <div className="space-y-2">
        <Label htmlFor="c-nombre">Nombre *</Label>
        <Input
          id="c-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
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
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. 656 123 4567"
          autoComplete="tel"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-email">Correo *</Label>
        <Input
          id="c-email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-pass">Contraseña *</Label>
        <PasswordInput
          id="c-pass"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
        />
      </div>
      <Captcha ref={captcha} onToken={setCaptchaToken} />
      <Button type="submit" size="touch" disabled={pending} className="w-full">
        {pending ? 'Creando…' : 'Crear cuenta y continuar'}
      </Button>
    </form>
  )
}

/** Completar datos de comprador cuando ya hay sesión pero falta la ficha. */
export function CompletarComprador() {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const res = await guardarComprador({ nombre, telefono })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Datos guardados')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Confirma tus datos para continuar tu compra.
      </p>
      <div className="space-y-2">
        <Label htmlFor="cc-nombre">Nombre *</Label>
        <Input
          id="cc-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cc-tel">Teléfono</Label>
        <Input
          id="cc-tel"
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. 656 123 4567"
          autoComplete="tel"
        />
      </div>
      <Button type="submit" size="touch" disabled={pending} className="w-full">
        {pending ? 'Guardando…' : 'Continuar'}
      </Button>
    </form>
  )
}
