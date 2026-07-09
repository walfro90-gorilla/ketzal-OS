'use client'

import { LogOutIcon, UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
