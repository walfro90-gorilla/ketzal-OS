'use client'

import Link from 'next/link'
import { LogOutIcon, ShoppingBagIcon, UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { marketplaceActivo } from '@/lib/marketplace'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Etiqueta legible del tipo de cuenta (`profiles.type`) + rol. Un admin no es
 *  "agente a secas", y el menú era el único lugar sin decirlo. */
function etiquetaCuenta(tipo: string | null, role: string | null): string | null {
  if (role === 'superadmin') return 'Administrador de Ketzal'
  const porTipo: Record<string, string> = {
    agente: role === 'admin' ? 'Administrador de agencia' : 'Agente',
    viajero: 'Viajero',
    embajador: 'Embajador',
    proveedor: 'Proveedor',
  }
  return tipo ? (porTipo[tipo] ?? null) : null
}

export function UserMenu({
  email,
  displayName,
  avatar,
  tipoCuenta,
  agenciaNombre,
  role,
}: {
  email: string
  displayName: string | null
  avatar?: string | null
  tipoCuenta?: string | null
  agenciaNombre?: string | null
  role?: string | null
}) {
  const cuenta = etiquetaCuenta(tipoCuenta ?? null, role ?? null)
  const inicial = (displayName || email).trim().charAt(0).toUpperCase()
  return (
    <>
      {/* El cierre de sesión es un POST al route handler; lo disparamos con
          requestSubmit desde el item del menú para no depender de cómo
          base-ui maneje el click. */}
      <form id="signout-form" action="/auth/signout" method="post" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cuenta"
              className="size-11 md:size-9"
            />
          }
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="size-7 rounded-full object-cover md:size-6"
            />
          ) : (
            <UserIcon />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <div className="flex items-start gap-3 px-1.5 py-2">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
              >
                {inicial}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              {displayName && (
                <span className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
              {cuenta && (
                <span className="mt-1 w-fit rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                  {cuenta}
                </span>
              )}
              {agenciaNombre && (
                <span className="truncate text-xs text-muted-foreground">
                  {agenciaNombre}
                </span>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          {/* Comprar es capacidad de todo usuario (b033). El staff que compra en
              el marketplace ve aquí sus pedidos — su nav primario es el back-office,
              así que /mis-compras no está en el sidebar. Tras el flag. */}
          {marketplaceActivo() && (
            <DropdownMenuItem render={<Link href="/mis-compras" />}>
              <ShoppingBagIcon />
              Mis compras
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              (
                document.getElementById('signout-form') as HTMLFormElement | null
              )?.requestSubmit()
            }
          >
            <LogOutIcon />
            Salir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
