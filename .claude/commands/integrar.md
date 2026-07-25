---
description: Integra el carril actual a main — verifica (tsc+build), rebasa sobre origin/main, push sin force (con reintento por carreras) y limpia el worktree
argument-hint: "(sin args — corre desde dentro del carril)"
---

Integra el **carril actual** (worktree) a `main`, de forma verificada y sin pisar a
nadie. Es `/push-safe` pero desde una rama de carril hacia `main`.

Determina la raíz del worktree actual: `git rev-parse --show-toplevel` y la rama:
`git branch --show-current`.

**Guarda dura:** si la rama es `main` (o no es `worktree-*`), **detente** — este
comando corre DENTRO de un carril, no en main.

Pasos (detente y reporta ante cualquier fallo; NO fuerces nada):

1. **Working tree limpio.** `git status --short`. Si hay cambios sin commitear:
   commitéalos SOLO por rutas explícitas (nunca `git add -A`) o pide instrucción.

2. **Gate de calidad** (no integres código roto):
   `pnpm exec tsc --noEmit` y luego `pnpm build`. Si algo falla, **detente** y
   reporta el error — no integres.

3. **Rebase sobre lo último de main.**
   `git fetch origin` → `git rebase origin/main`. Si hay conflicto: **detente**,
   muestra `git status`, NO resuelvas a ciegas ni abortes sin permiso.

4. **Confirma el alcance.** `git diff --stat origin/main..HEAD`. Revisa que solo
   toque las rutas de tu carril; si aparece una superficie compartida inesperada
   (`database.types.ts`, migraciones, `package.json`), avísalo antes de seguir.

5. **Push a main sin force.** `git push origin HEAD:main`.
   Si lo rechazan (non-fast-forward = otro agente pusheó en la ventana):
   `git fetch origin && git rebase origin/main` y **reintenta** (hasta ~3 veces).
   Jamás `--force`. Reporta el rango publicado.

6. **Verifica el deploy Vercel** del commit que quedó en `main` (MCP Vercel
   `list_deployments`/`get_deployment` o `vercel ls`) → **READY** o **ERROR** con URL.

7. **Limpia el carril** (solo si el push quedó en main). No puedes borrar el worktree
   donde estás parado: hazlo desde el repo main.
   - Si la sesión entró con **EnterWorktree**, usa **ExitWorktree** (`action: remove`).
   - Si es un worktree normal (otra terminal), desde el main:
     `git -C /home/walfro90/Desktop/codes/ketzal-app worktree remove .claude/worktrees/<nombre>`
     `git -C /home/walfro90/Desktop/codes/ketzal-app branch -d worktree-<nombre>` (usa `-d`,
     no `-D`: `-d` se niega si la rama no está mergeada — red de seguridad) y `worktree prune`.

Cierre: resume en 2-3 líneas qué se integró a main, si hubo rebase/reintentos, el
estado del deploy, y que el carril quedó limpio.
