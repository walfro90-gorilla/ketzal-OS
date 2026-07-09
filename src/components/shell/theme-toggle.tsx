'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const OPTIONS = [
  { value: 'light', label: 'Claro', icon: SunIcon },
  { value: 'dark', label: 'Oscuro', icon: MoonIcon },
  { value: 'system', label: 'Sistema', icon: MonitorIcon },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // El check del tema activo solo se muestra tras montar, para no romper la
  // hidratación (en el servidor `theme` es indefinido).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cambiar tema"
            className="size-11 md:size-9"
          />
        }
      >
        {/* El ícono visible sigue la clase .dark por CSS (sin mismatch de hidratación). */}
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon />
            {label}
            {mounted && theme === value && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
