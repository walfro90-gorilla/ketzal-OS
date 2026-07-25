---
description: Push seguro al árbol compartido — fetch, no-clobber, rebase, push (sin force) y verifica el deploy Vercel
argument-hint: "[mensaje de commit — solo si quedan cambios sin commitear]"
---

Ejecuta el ritual de push seguro para el árbol multi-agente de Ketzal (`main` compartido).
Repo real: `/home/walfro90/Desktop/codes/ketzal-app` (el de `~/codes/` es caché stale, sin git).
Trabaja SIEMPRE con `git -C /home/walfro90/Desktop/codes/ketzal-app`.

Sigue los pasos en orden y **detente** ante cualquier anomalía, reportándola:

1. **Estado local.** `git status --short` y `git log --oneline -5`. Si hay cambios sin
   commitear: si se pasó un mensaje en `$ARGUMENTS`, commitea SOLO rutas explícitas
   (nunca `git add -A`/`.`/`commit -a` — el guard los bloquea); si no hay mensaje y hay
   cambios, detente y pregunta qué commitear.

2. **Fetch.** `git fetch origin`.

3. **¿Divergió `origin/main`?**
   - Míos por subir:  `git log --oneline origin/main..HEAD`
   - Suyos entrantes: `git log --oneline HEAD..origin/main`
   - Si no hay entrantes → salta al paso 5 (push directo).

4. **No-clobber + rebase.** Antes de rebasar, verifica solapamiento de archivos:
   - Míos:   `git diff --name-only origin/main...HEAD`
   - Suyos:  `git diff --name-only HEAD...origin/main`
   - Si un mismo archivo aparece en ambas listas, avísalo (rebase puede conflictuar).
   - `git rebase origin/main`. Si hay conflicto: **detente**, muestra `git status`, NO
     resuelvas a ciegas ni abortes sin permiso. Si limpia, sigue.

5. **Push sin force.** `git push origin main` (jamás `--force`; el guard lo bloquea).
   Reporta el rango publicado (p.ej. `a4f3579..db8e8e2`).

6. **Verifica el deploy Vercel.** El push a `main` auto-despliega el proyecto `ketzal-os`.
   Consulta el deployment más reciente (MCP Vercel `list_deployments`/`get_deployment` o
   `vercel ls`) y reporta **READY** o **ERROR** con la URL. Si sigue *Building*, dilo y
   ofrece re-chequear.

Al terminar, resume en 2-3 líneas: qué se pusheó, si hubo rebase, y el estado del deploy.
