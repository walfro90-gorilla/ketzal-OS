import { defineConfig } from 'vitest/config'

// Primera red de tests de app. Solo lógica pura (dominio de dinero), sin DOM ni
// BD: environment node y se limita a src/ para no escanear worktrees ni node_modules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
