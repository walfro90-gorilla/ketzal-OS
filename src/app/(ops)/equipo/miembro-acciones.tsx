'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { Database } from '@/lib/db/database.types'
import { aprobarUsuario, asignarAgencia, cambiarRol, resetearPassword } from './actions'

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
}: {
  miembro: Miembro
  agencias: AgenciaOption[]
  isSuperadmin: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Estado local de los selects para reflejar el cambio de inmediato;
  // si la acción falla se revierte al valor del servidor.
  const [agencia, setAgencia] = useState(miembro.supplier_id ?? '')
  const [rol, setRol] = useState<UserRole>(miembro.role)

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

  // Reset de contraseña (solo superadmin): pide la nueva clave y la fija por el
  // service role. La comparte el admin con el agente; luego el agente puede
  // cambiarla desde /recuperar. window.prompt basta para una herramienta interna.
  function resetPwd() {
    const quien = miembro.name ?? miembro.email ?? 'este agente'
    const pwd = window.prompt(`Nueva contraseña para ${quien} (mín. 8 caracteres):`)
    if (pwd == null) return // canceló
    if (pwd.trim().length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await resetearPassword(miembro.id, pwd)
      if ('error' in result) {
        setError(result.error)
      } else {
        toast.success('Contraseña actualizada')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
          onClick={resetPwd}
        >
          Contraseña
        </Button>
      )}

      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
