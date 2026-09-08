'use client'

import * as React from 'react'
import { AlertDialog as Primitive } from '@base-ui/react/alert-dialog'

import { cn } from '@/lib/utils'

// Modal de confirmación (base-nova sobre @base-ui/react, como el Sheet). Se usa
// para acciones que conviene frenar un segundo: publicar/ocultar un servicio.
function AlertDialog(props: Primitive.Root.Props) {
  return <Primitive.Root {...props} />
}

function AlertDialogContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Primitive.Popup
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border bg-popover p-5 text-sm text-popover-foreground shadow-lg transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
          className
        )}
        {...props}
      >
        {children}
      </Primitive.Popup>
    </Primitive.Portal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: Primitive.Title.Props) {
  return (
    <Primitive.Title className={cn('text-base font-semibold', className)} {...props} />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: Primitive.Description.Props) {
  return (
    <Primitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
}
