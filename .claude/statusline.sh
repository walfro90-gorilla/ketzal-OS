#!/usr/bin/env bash
# Statusline de Ketzal: modelo · rama + adelante/atrás vs origin · costo de la sesión.
# El ↑/↓ vs origin es un NUDGE del árbol compartido multi-agente: te avisa que tu
# HEAD divergió antes de que pushees. Lee el ref remoto CACHEADO (sin `fetch`, sin
# red) → refleja el último fetch, no el estado vivo. El chequeo real lo hacen el hook
# guard-shared-tree.sh y /push-safe. Barato a propósito: solo refs locales.
set -uo pipefail
in=$(cat)
dir=$(jq -r '.workspace.current_dir // .cwd // empty' <<<"$in")
model=$(jq -r '.model.display_name // empty' <<<"$in")
cost=$(jq -r '.cost.total_cost_usd // empty' <<<"$in")

rst=$'\033[0m'; dim=$'\033[2m'
grn=$'\033[38;5;108m'; amb=$'\033[38;5;173m'; cyn=$'\033[38;5;73m'

out=""
[ -n "$model" ] && out+="${cyn}⬢ ${model}${rst}"

if [ -n "$dir" ] && git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git -C "$dir" symbolic-ref --short -q HEAD || git -C "$dir" rev-parse --short HEAD)
  ab=$(git -C "$dir" rev-list --count --left-right '@{u}...HEAD' 2>/dev/null || true)
  if [ -n "$ab" ]; then
    behind=${ab%%$'\t'*}; ahead=${ab##*$'\t'}
    tag="$branch"
    [ "$ahead" != 0 ] && tag+=" ↑${ahead}"
    [ "$behind" != 0 ] && tag+=" ↓${behind}"
    col=$grn; [ "$behind" != 0 ] && col=$amb   # atrás de origin ⇒ ámbar (rebase antes de pushear)
    out+="  ${col}${tag}${rst}"
  else
    out+="  ${dim}${branch}${rst}"             # sin upstream configurado
  fi
fi

[ -n "$cost" ] && out+="  ${dim}\$$(printf '%.2f' "$cost" 2>/dev/null || echo "$cost")${rst}"

printf '%s' "$out"
