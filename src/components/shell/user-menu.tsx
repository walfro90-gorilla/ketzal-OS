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

export function UserMenu({
  email,
  displayName,
}: {
  email: string
  displayName: string | null
}) {
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
          <UserIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
            {displayName && (
              <span className="text-sm font-medium text-foreground">
                {displayName}
              </span>
            )}
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>
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
