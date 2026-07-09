'use client'

import { ThemeProvider } from 'next-themes'

// Proveedor de tema (light/dark/system) — usa la clase `.dark` que ya definen
// los tokens en globals.css. `disableTransitionOnChange` evita el flash al cambiar.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
