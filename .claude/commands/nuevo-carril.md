---
description: Crea un carril aislado (git worktree + rama desde origin/main) con env + deps listos para editar sin tocar main
argument-hint: "<nombre-del-carril>  (kebab-case, p.ej. cobranza-emails)"
---

Crea un **carril** (worktree) para trabajar aislado del árbol compartido `main`.
Repo real: `/home/walfro90/Desktop/codes/ketzal-app`. Usa `git -C <repo>` siempre.

`$ARGUMENTS` = nombre del carril. Si viene vacío, **detente** y pídelo.

Pasos (detente y reporta ante cualquier fallo):

1. **Valida el nombre.** kebab-case (`[a-z0-9-]+`). Rechaza espacios/mayúsculas.
   Verifica que NO exista ya: `git -C <repo> worktree list` y
   `git -C <repo> branch --list worktree-<nombre>`. Si existe, detente.

2. **Base fresca.** `git -C <repo> fetch origin`.

3. **Crea el worktree** (misma convención que el harness y el lane existente):
   `git -C <repo> worktree add <repo>/.claude/worktrees/<nombre> -b worktree-<nombre> origin/main`

4. **Hereda lo no-trackeado** (la fricción real: `.env*` y `node_modules` NO viajan
   con el worktree). Copia los env reales del main al carril:
   `for f in .env.local .env.prod .env; do [ -f "<repo>/$f" ] && cp "<repo>/$f" "<repo>/.claude/worktrees/<nombre>/$f"; done`
   Luego instala deps **de verdad** en el carril (nunca symlinkees el node_modules
   top-level — Turbopack lo rechaza; los symlinks internos de pnpm sí son válidos):
   `cd <repo>/.claude/worktrees/<nombre> && pnpm install --prefer-offline`
   (El warning `ERR_PNPM_IGNORED_BUILDS` de esbuild es benigno.)

5. **Reporta** al usuario:
   - Ruta del carril y rama `worktree-<nombre>` (trackea origin/main).
   - **Cómo trabajarlo** (dos opciones):
     a) Abre una sesión nueva ahí: `cd <ruta> && claude` (modelo del doc, N terminales).
     b) O aísla ESTA sesión con el tool **EnterWorktree** (`path: <ruta>`) — requiere
        que la sesión haya arrancado en el repo git.
   - **Reglas del carril** (de `docs/WORKTREES.md`): commitea solo TUS rutas por
     nombre (nunca `git add -A`); no toques superficies compartidas
     (`database.types.ts`, migraciones, `package.json`, primitivos UI) salvo que seas
     el dueño; la BD Supabase es COMPARTIDA (coordina migraciones).
   - Al terminar: **`/integrar`** desde el carril.
