---
description: Integra el carril actual vía Pull Request (para gatear con la security review) — verifica, rebasa, pushea la rama y abre el PR a main
argument-hint: "(sin args — corre desde dentro del carril)"
---

Integra el **carril actual** hacia `main` **por Pull Request** (no push directo), para
que lo gateen `test.yml` (tsc + pnpm test) y `security-review.yml` (revisión de
seguridad de Claude) antes del merge. Úsalo para carriles que tocan RLS, ledger,
authz o dinero; para cambios triviales basta `/integrar`.

Raíz del worktree: `git rev-parse --show-toplevel`. Rama: `git branch --show-current`.
**Guarda dura:** si la rama es `main` o no es `worktree-*`, **detente**.

Pasos (detente y reporta ante cualquier fallo; NO fuerces nada):

1. **Working tree limpio.** `git status --short`. Si hay cambios sin commitear:
   commitéalos SOLO por rutas explícitas (nunca `git add -A`) o pide instrucción.

2. **Gate de calidad local** (para no abrir un PR que ya sabes roto):
   `pnpm exec tsc --noEmit` y `pnpm build`. Si algo falla, **detente** y reporta.

3. **Rebase sobre lo último de main.**
   `git fetch origin` → `git rebase origin/main`. Conflicto → **detente**, muestra
   `git status`, no resuelvas a ciegas.

4. **Confirma el alcance.** `git diff --stat origin/main..HEAD`. Si aparece una
   superficie compartida inesperada (`database.types.ts`, migraciones, `package.json`),
   avísalo antes de seguir.

5. **Pushea la RAMA del carril** (no a main): `git push -u origin <rama>` (sin force).
   Si la rechazan por divergencia remota de esa misma rama, `git fetch && git rebase
   origin/<rama>` y reintenta; si exige force, **detente** y pregunta.

6. **Abre el PR** con `gh` (ya autenticado). Título = resumen del carril; cuerpo = los
   commits (`git log --format='- %s' origin/main..HEAD`) + la línea de atribución:
   ```
   gh pr create --base main --head <rama> --title "<título>" --body "<cuerpo>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)"
   ```
   Si ya existe PR para la rama, `gh pr create` falla → muestra el existente:
   `gh pr view --json url -q .url`. Fallback sin `gh`: imprime
   `https://github.com/walfro90-gorilla/ketzal-OS/compare/main...<rama>?expand=1`.

7. **Reporta** la URL del PR. Ahí corren `test.yml` + `security-review.yml` (los
   comentarios de seguridad aparecen en el PR). **No borres el worktree** todavía: el
   PR sigue abierto y puede necesitar fixups (commitea más en el carril → se actualiza
   el PR solo).

8. **Después del merge** (en GitHub), limpia desde el repo main:
   `git -C /home/walfro90/Desktop/codes/ketzal-app worktree remove .claude/worktrees/<nombre>`
   `git -C /home/walfro90/Desktop/codes/ketzal-app branch -d <rama>` (`-d`: se niega si
   no está mergeada) y `worktree prune`.

Cierre: resume en 2-3 líneas el PR abierto (URL), qué gatea, y el paso de limpieza
post-merge.
