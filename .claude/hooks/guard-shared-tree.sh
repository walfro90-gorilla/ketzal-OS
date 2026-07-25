#!/usr/bin/env bash
# Guard del árbol compartido de Ketzal (multi-agente sobre `main`).
# PreToolUse(Bash): bloquea comandos git que pueden pisar el WIP de otro agente.
# Bloquea, con exit 2, tres clases (documentadas en docs/WORKTREES.md):
#   1. staging de todo el árbol   → git add -A | --all | .
#   2. commit que auto-stagea todo → git commit -a | -am | --all
#   3. force push                 → git push --force | -f   (permite --force-with-lease)
# Deja pasar todo lo demás. La disciplina correcta: `git add <ruta>` explícito,
# `git commit` sin -a, y push normal tras `git fetch` + rebase.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

block() {
  echo "BLOQUEADO por guard del árbol compartido: $1" >&2
  echo "Árbol multi-agente en \`main\`: nunca stagees/commitees todo ni fuerces push." >&2
  echo "Usa: git add <rutas explícitas>  ·  git commit (sin -a)  ·  git fetch + rebase + push (sin --force)." >&2
  exit 2
}

# 1. git add de todo el árbol
if grep -Pq 'git\s+add\b' <<<"$cmd" \
   && grep -Pq '(\s-A\b|\s--all\b|\s\.(\s|$))' <<<"$cmd"; then
  block "git add de todo el árbol (-A/--all/.) arrastra cambios de otros agentes"
fi

# 2. git commit que auto-stagea (-a / -am / --all)
if grep -Pq 'git\s+commit\b' <<<"$cmd" \
   && grep -Pq '((^|\s)-[a-zA-Z]*a[a-zA-Z]*(\b|=)|\s--all\b)' <<<"$cmd"; then
  block "git commit -a/--all stagea cambios que no son tuyos; commitea rutas explícitas"
fi

# 3. force push (pero --force-with-lease sí se permite: es el seguro tras rebase)
if grep_push=$(grep -Pq 'git\s+push\b' <<<"$cmd" && echo 1 || echo 0); [ "$grep_push" = 1 ] \
   && grep -Pq '(\s-f\b|--force(?!-with-lease))' <<<"$cmd"; then
  block "git push --force sobreescribe lo que otro agente pusheó; usa fetch+rebase o --force-with-lease"
fi

exit 0
