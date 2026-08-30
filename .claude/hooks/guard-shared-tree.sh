#!/usr/bin/env bash
# Guard del árbol compartido de Ketzal (multi-agente sobre `main`).
# PreToolUse(Bash): bloquea comandos git que pueden pisar el WIP de otro agente.
# Bloquea, con exit 2, tres clases (documentadas en docs/WORKTREES.md):
#   1. staging de todo el árbol    → git add con -A / --all / .
#   2. commit que auto-stagea todo → git commit con -a / -am / --all
#   3. force push                  → git push --force o -f (permite --force-with-lease)
# Deja pasar todo lo demás. La disciplina correcta: `git add <ruta>` explícito,
# `git commit` sin -a, y push normal tras `git fetch` + rebase.
#
# El match es POR SUB-COMANDO, no por bloque. Antes cada regla hacía dos greps
# independientes sobre el comando completo, así que bastaba con que el verbo y
# la bandera aparecieran en cualquier parte —aunque fueran de comandos
# distintos— para bloquear. El caso real que lo destapó:
#
#     git worktree remove .claude/worktrees/x --force
#     git push origin --delete rama-vieja
#
# Ahí el --force es de `worktree remove` y el push es un borrado de rama normal,
# pero el guard leía "hay git push" + "hay --force" y bloqueaba. Es justo la
# secuencia de cerrar un carril, así que mordía a diario. También bloqueaba
# heredocs que solo MENCIONAN estas banderas (escribir este archivo, por
# ejemplo). Ahora el comando se parte por separadores de shell y cada trozo se
# evalúa por su cuenta.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

block() {
  echo "BLOQUEADO por guard del árbol compartido: $1" >&2
  echo "Árbol multi-agente en \`main\`: nunca stagees/commitees todo ni fuerces push." >&2
  echo "Usa: git add <rutas explícitas>  ·  git commit (sin -a)  ·  git fetch + rebase + push (sin --force)." >&2
  exit 2
}

# Parte el comando en sub-comandos por los separadores de shell (saltos de
# línea, ; && || |). No es un parser: un separador dentro de comillas también
# corta, y eso solo puede provocar un bloqueo de más, nunca de menos — falla
# del lado seguro, que es lo que un guard debe hacer.
#
# El verbo se ancla al INICIO del sub-comando, para que mencionarlo dentro de
# una cadena (un echo, un heredoc que escribe documentación) no cuente como
# ejecutarlo. Escribir este mismo archivo disparaba el guard viejo.
# ponytail: con el ancla, un verbo lanzado por `xargs` o `sh -c` se escapa. Es
# un guard contra el descuido propio, no contra un adversario; si algún día hay
# que cubrir eso, la salida es un parser de verdad y no más regex.
sub_comandos() {
  printf '%s\n' "$1" | sed -E 's/(\|\||&&|[;|])/\n/g'
}

while IFS= read -r sub; do
  [ -z "${sub// }" ] && continue

  if grep -Pq '^\s*(\w+=\S+\s+)*(sudo\s+)?git\s+add\b' <<<"$sub" \
     && grep -Pq '(\s-A\b|\s--all\b|\s\.(\s|$))' <<<"$sub"; then
    block "git add de todo el árbol (-A/--all/.) arrastra cambios de otros agentes"
  fi

  if grep -Pq '^\s*(\w+=\S+\s+)*(sudo\s+)?git\s+commit\b' <<<"$sub" \
     && grep -Pq '((^|\s)-[a-zA-Z]*a[a-zA-Z]*(\b|=)|\s--all\b)' <<<"$sub"; then
    block "git commit -a/--all stagea cambios que no son tuyos; commitea rutas explícitas"
  fi

  if grep -Pq '^\s*(\w+=\S+\s+)*(sudo\s+)?git\s+push\b' <<<"$sub" \
     && grep -Pq '(\s-f\b|--force(?!-with-lease))' <<<"$sub"; then
    block "git push --force sobreescribe lo que otro agente pusheó; usa fetch+rebase o --force-with-lease"
  fi
done < <(sub_comandos "$cmd")

exit 0
