import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Primera red de tests de app. Solo lógica pura (dominio de dinero), sin DOM ni
// BD: environment node y se limita a src/ para no escanear worktrees ni node_modules.
export default defineConfig({
  // `@/` como en tsconfig y en Next. Sin esto, cualquier test que alcance un
  // módulo importado con el alias muere en "Cannot find package '@/…'" — y
  // hasta ahora ningún test lo había cruzado, así que el hueco estaba tapado
  // por casualidad, no por diseño.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
