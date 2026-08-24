'use client'

import { useState, type ComponentProps } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Contraseña con ojito para verla. Acepta las mismas props que `Input`, así
 * que sustituir `<Input type="password" …>` es cambiar el nombre y nada más.
 *
 * El botón queda FUERA del orden de tabulación (`tabIndex={-1}`): tabular desde
 * la contraseña tiene que llevar al botón de enviar, no a un control opcional.
 * Se alcanza con el ratón y, para el teclado, el campo ya se puede leer con el
 * lector de pantalla.
 *
 * `aria-pressed` y no sólo el ícono: quien no ve el ojo necesita saber si la
 * contraseña está a la vista.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
        title={visible ? 'Ocultar' : 'Mostrar'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}
