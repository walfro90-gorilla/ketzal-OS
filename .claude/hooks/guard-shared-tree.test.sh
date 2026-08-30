#!/usr/bin/env bash
# Tests del guard del árbol compartido.
#
# Corre:  .claude/hooks/guard-shared-tree.test.sh
#
# Existe porque el guard se rompió de forma silenciosa: matcheaba el verbo y la
# bandera en cualquier parte del bloque, así que bloqueaba secuencias legítimas
# (cerrar un carril con `worktree remove --force` seguido de un borrado de rama)
# y hasta heredocs que solo mencionaban las banderas. Un guard que bloquea de
# más se vuelve ruido y la gente busca rodeos — que es justo lo que pasó.
#
# La regla del harness: cada caso dice qué DEBE pasar, y se prueban las dos
# direcciones. Un test que solo verifica que lo prohibido se bloquee da verde
# sobre un guard que bloquea todo.
set -uo pipefail
cd "$(dirname "$0")/../.."
H=".claude/hooks/guard-shared-tree.sh"
fallos=0

# $1 = rc esperado (0 pasa, 2 bloquea) · $2 = comando · $3 = descripción
caso() {
  local esperado="$1" cmd="$2" desc="$3" rc
  printf '%s' "$cmd" | jq -Rs '{tool_input:{command:.}}' | "$H" >/dev/null 2>&1
  rc=$?
  if [ "$rc" = "$esperado" ]; then
    echo "   ✔ $desc"
  else
    echo "   ✘ FALLA: $desc (esperaba rc=$esperado, dio rc=$rc)"
    fallos=$((fallos+1))
  fi
}

echo "── Debe BLOQUEAR (lo que el guard existe para frenar) ──"
caso 2 "git add -A"                              "add -A"
caso 2 "git add --all"                           "add --all"
caso 2 "git add ."                               "add ."
caso 2 "git commit -am 'x'"                         "commit -am"
caso 2 "git commit --all -m 'x'"                    "commit --all"
caso 2 "git push --force origin main"             "push --force"
caso 2 "git push -f origin main"                  "push -f"
caso 2 "git fetch && git push --force origin main" "force push tras otro comando"
caso 2 "/usr/bin/git push --force origin main"    "force push por ruta absoluta"
caso 2 "./git push --force origin main"          "force push por ruta relativa"

echo "── Debe PASAR (trabajo legítimo del día a día) ──"
caso 0 "git add src/app/page.tsx"                "add de una ruta"
caso 0 "git commit -m 'mensaje'"                    "commit sin -a"
caso 0 "git push origin main"                     "push normal"
caso 0 "git push --force-with-lease origin main"  "--force-with-lease (el seguro tras rebase)"
caso 0 "git push origin --delete rama-vieja"      "borrar rama remota"
caso 0 "git push origin :rama-vieja"              "borrar rama con refspec vacío"
caso 0 "git worktree remove x --force"           "cerrar worktree"
caso 0 "ls -a && git commit -m 'x'"                 "un -a de OTRO comando no cuenta"
caso 0 "echo 'documentacion: no uses git add -A nunca'" "mención en texto, no ejecución"

echo "── El caso que destapó el bug ──"
caso 0 "git worktree remove .claude/worktrees/x --force
git push origin --delete rama-vieja" "cerrar carril: worktree remove --force + push --delete"

echo
if [ "$fallos" = 0 ]; then
  echo "🟢 todos los casos pasan"
else
  echo "🔴 $fallos caso(s) fallando"
fi
exit "$fallos"
