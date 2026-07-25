# Tooling de Claude Code (repo Ketzal)

> Automatizaciones para trabajar con varios agentes sobre este repo sin pisarse,
> pushear seguro, y revisar seguridad. Inspirado en `awesome-claude-code`.
> Todo vive versionado en `.claude/` y `.github/` → cada agente del repo lo hereda.

## Qué hay

| Componente | Archivo | Qué hace |
|---|---|---|
| **Guard anti-clobber** | `.claude/hooks/guard-shared-tree.sh` | Hook `PreToolUse(Bash)`. Bloquea `git add -A/--all/.`, `git commit -a/-am/--all`, `git push --force/-f`. Permite rutas explícitas, `--amend`, `--force-with-lease`, fetch/rebase. Falla-seguro (sobre-bloquea). |
| **`/push-safe`** | `.claude/commands/push-safe.md` | Ritual: fetch → no-clobber → rebase → push sin force → verifica deploy Vercel. |
| **Statusline** | `.claude/statusline.sh` | Barra: modelo · rama + ↑/↓ vs `origin` (nudge de divergencia, sin fetch) · costo. Ámbar si estás atrás. |
| **`/nuevo-carril <n>`** | `.claude/commands/nuevo-carril.md` | Crea worktree + rama desde `origin/main` con `.env*` copiado y `pnpm install` real (worktree que sí compila). |
| **`/integrar`** | `.claude/commands/integrar.md` | Desde un carril: gate tsc+build → rebase → `push HEAD:main` sin force (reintenta) → verifica deploy → limpia worktree. |
| **`/integrar-pr`** | `.claude/commands/integrar-pr.md` | Igual pero abre **PR** (lo gatean `test.yml` + `security-review.yml`). Para carriles que tocan RLS/ledger/authz. |
| **Security review** | `.github/workflows/security-review.yml` | En cada PR, `anthropics/claude-code-security-review` revisa el diff y comenta hallazgos (authz/RLS, secretos, injection). |

Config del hook + statusline: `.claude/settings.json` (versionado). Flujo de carriles
detallado en [`WORKTREES.md`](./WORKTREES.md).

## Activación (una vez por máquina/usuario)

- [ ] **Hook + statusline**: al abrir sesión en el repo, Claude Code **pide aprobar**
  el hook y el statusline versionados (no corre bash de un repo sin tu ok). Acéptalos.
  (Los slash commands no requieren aprobación.)
- [ ] **Security review**: crear el secreto `CLAUDE_API_KEY` en GitHub → repo Settings →
  Secrets and variables → Actions. La key debe estar habilitada para Claude API y
  Claude Code. Sin el secreto, la action falla en el PR.

## Flujo recomendado

```
/nuevo-carril <nombre>      # carril aislado
   … editas, commiteas solo TUS rutas …
   ├─ cambio trivial    → /integrar       # push directo a main (rápido)
   └─ RLS/ledger/authz  → /integrar-pr     # PR gateado por tests + security review
```

Regla: la BD Supabase es **un solo proyecto compartido** — worktrees aíslan archivos,
no la BD. Un solo "dueño de BD" aplica migraciones (ver `WORKTREES.md`, gotcha #1).
