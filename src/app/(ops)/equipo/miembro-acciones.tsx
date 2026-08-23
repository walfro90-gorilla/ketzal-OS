'use client'

import Link from 'next/link'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { Database } from '@/lib/db/database.types'
import { aprobarUsuario, asignarAgencia, cambiarRol } from './actions'
import { cambiarRolAgencia, regenerarAcceso } from './invitaciones-actions'

type UserRole = Database['ketzal']['Enums']['user_role']

// Forma de cada elemento del Json que devuelve ketzal.list_team().
// Los tipos generados a mano declaran `Returns: Json`, así que se
// estrecha con un cast en la página (mismo patrón que en /comisiones).
export type Miembro = {
  id: string
  email: string | null
  name: string | null
  role: UserRole
  active: boolean
  supplier_id: string | null
  agency: string | null
  num_ventas: number
}

export type AgenciaOption = {
  id: string
  name: string
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'Agente' },
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Superadmin' },
]

/** Acciones por miembro: aprobar/desactivar y (superadmin) agencia + rol. */
export function MiembroAcciones({
  miembro,
  agencias,
  isSuperadmin,
  viewerId,
}: {
  miembro: Miembro
  agencias: AgenciaOption[]
  isSuperadmin: boolean
  /** Id del que mira: para ocultar la delegación de rol en su propia fila. */
  viewerId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Estado local de los selects para reflejar el cambio de inmediato;
  // si la acción falla se revierte al valor del servidor.
  const [agencia, setAgencia] = useState(miembro.supplier_id ?? '')
  const [rol, setRol] = useState<UserRole>(miembro.role)
  // Credenciales provisionales tras regenerar acceso (para copiar por WhatsApp).
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  function run(
    action: () => Promise<{ error: string } | { ok: true }>,
    revert?: () => void
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        setError(result.error)
        revert?.()
      } else {
        toast.success('Cambios guardados')
      }
    })
  }

  // Delegación de rol del admin de agencia (user ↔ admin, nunca superadmin ni
  // cross-agencia; el RPC lo garantiza). El superadmin ya tiene el selector de
  // 3 roles, así que este botón es solo para admins. Se oculta en la fila propia
  // (evitar auto-degradación) y para miembros libres/superadmin.
  const puedeDelegarRol =
    !isSuperadmin &&
    miembro.supplier_id != null &&
    miembro.role !== 'superadmin' &&
    miembro.id !== viewerId

  function toggleRolAgencia() {
    const nuevo: UserRole = rol === 'admin' ? 'user' : 'admin'
    const prev = rol
    setRol(nuevo)
    run(() => cambiarRolAgencia(miembro.id, nuevo), () => setRol(prev))
  }

  // Regenerar acceso (solo superadmin): genera una contraseña provisional nueva y
  // fuerza a crear la propia al primer login. Reemite las credenciales cuando se
  // perdieron (la provisional original no se puede recuperar). Se copian y se
  // mandan por WhatsApp. Invalida la clave anterior ⇒ se confirma.
  function regenerar() {
    const quien = miembro.name ?? miembro.email ?? 'este miembro'
    if (
      !window.confirm(
        `¿Regenerar el acceso de ${quien}? Se crea una contraseña nueva; la anterior deja de servir.`
      )
    )
      return
    setError(null)
    setCreds(null)
    startTransition(async () => {
      const res = await regenerarAcceso(miembro.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setCreds(res.credentials)
      toast.success('Acceso regenerado. Copia el mensaje y mándalo por WhatsApp.')
    })
  }

  async function copiarCreds() {
    if (!creds) return
    const texto = `Ketzal OS — entra en https://ketzal-os.vercel.app/login\nCorreo: ${creds.email}\nContraseña provisional: ${creds.password}\n(Al entrar te pedirá crear tu propia contraseña.)`
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard bloqueado: seleccionar a mano.
    }
  }

  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {/* b066: expediente de la cuenta (bitácora + historial). */}
      <Link
        href={`/usuarios/${miembro.id}`}
        className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' h-10 md:h-7'}
      >
        Expediente
      </Link>

      <Button
        type="button"
        variant={miembro.active ? 'outline' : 'default'}
        size="sm"
        // Táctil en móvil; compacto (el h-7 de size="sm") en desktop.
        className="h-10 md:h-7"
        disabled={isPending}
        onClick={() => run(() => aprobarUsuario(miembro.id, !miembro.active))}
      >
        {miembro.active ? 'Desactivar' : 'Aprobar'}
      </Button>

      {puedeDelegarRol && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 md:h-7"
          disabled={isPending}
          onClick={toggleRolAgencia}
        >
          {rol === 'admin' ? 'Hacer agente' : 'Hacer admin'}
        </Button>
      )}

      {isSuperadmin && (
        <NativeSelect
          className="w-36"
          value={agencia}
          disabled={isPending}
          aria-label={`Agencia de ${miembro.name ?? miembro.email ?? 'miembro'}`}
          onChange={(e) => {
            const value = e.target.value
            setAgencia(value)
            run(
              () => asignarAgencia(miembro.id, value === '' ? null : value),
              () => setAgencia(miembro.supplier_id ?? '')
            )
          }}
        >
          <option value="">— Libre —</option>
          {agencias.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      )}

      {isSuperadmin && (
        <NativeSelect
          className="w-32"
          value={rol}
          disabled={isPending}
          aria-label={`Rol de ${miembro.name ?? miembro.email ?? 'miembro'}`}
          onChange={(e) => {
            const value = e.target.value as UserRole
            setRol(value)
            run(
              () => cambiarRol(miembro.id, value),
              () => setRol(miembro.role)
            )
          }}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      )}

      {isSuperadmin && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 md:h-7"
          disabled={isPending}
          onClick={regenerar}
        >
          Regenerar acceso
        </Button>
      )}

      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>

    {creds && (
      <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Acceso regenerado. Manda estas credenciales (WhatsApp):
        </p>
        <div className="space-y-1 rounded-md border bg-background px-3 py-2 text-sm">
          <p>
            <span className="text-muted-foreground">Correo:</span>{' '}
            <span className="font-medium">{creds.email}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Contraseña provisional:</span>{' '}
            <span className="font-mono font-medium">{creds.password}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copiarCreds}>
            {copiado ? (
              <>
                <CheckIcon className="size-4" /> Copiado
              </>
            ) : (
              <>
                <CopyIcon className="size-4" /> Copiar mensaje
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Al entrar se le pedirá crear su propia contraseña.
          </span>
        </div>
      </div>
    )}
    </div>
  )
}
