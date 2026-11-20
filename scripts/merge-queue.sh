#!/usr/bin/env bash
# scripts/merge-queue.sh — mergeia PRs paralelos um por vez, como o CLAUDE.md manda.
#
# Para cada PR, no worktree dele:
#   1. árvore limpa, troca para o branch, `git merge origin/main` (sem force-push);
#   2. conflito em CHANGELOG.md / .size-limit.checks.json é resolvido por
#      `scripts/merge-queue.mjs resolve` (concatenação; teto maior + registro dos
#      budgets que os dois lados mexeram); qualquer outro arquivo para a fila;
#   3. `npm run build` + `merge-queue.mjs remeasure`: remede os tetos do barrel e
#      os budgets tocados pelos dois lados, e anota em `### Budgets`;
#   4. `make check` inteiro; vermelho para a fila;
#   5. se a `main` andou durante o check, para (o próximo merge precisa dela);
#   6. push e `gh pr merge --merge`, conferindo que ficou MERGED.
#
# Uso:
#   scripts/merge-queue.sh <pr>:<worktree>:<branch> [...]
#   make merge-queue PRS="651:../wt-651:fix/x 652:../wt-652:fix/y"
#
# `worktree` é o caminho do worktree do PR (relativo à raiz deste checkout ou
# absoluto). O log do `make check` de cada PR fica em `.git/merge-queue-<pr>.log`
# do worktree. A fila para no primeiro problema e diz qual.

set -uo pipefail

QUEUE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$QUEUE_DIR/.." && pwd)"
TRAILER="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

fail() {
  echo "FAIL #$1: $2"
  exit 1
}

if [[ $# -eq 0 ]]; then
  echo "uso: scripts/merge-queue.sh <pr>:<worktree>:<branch> [...]" >&2
  exit 2
fi

for item in "$@"; do
  IFS=: read -r pr worktree branch <<<"$item"
  [[ -n "$pr" && -n "$worktree" && -n "$branch" ]] || fail "?" "item inválido '$item'"
  case "$worktree" in
    /*) dir="$worktree" ;;
    *) dir="$ROOT/$worktree" ;;
  esac
  echo "=== #$pr ($branch) $(date +%T)"
  cd "$dir" || fail "$pr" "worktree não existe: $dir"
  log="$(git rev-parse --git-path "merge-queue-$pr.log")"
  [[ -z "$(git status --porcelain)" ]] || fail "$pr" "árvore suja em $dir"
  git switch -q "$branch" || fail "$pr" "não consegui trocar para $branch"
  git fetch -q

  if ! git merge -q --no-edit origin/main >/dev/null 2>&1; then
    others="$(git diff --name-only --diff-filter=U | grep -vxE 'CHANGELOG\.md|\.size-limit\.checks\.json' || true)"
    [[ -z "$others" ]] || fail "$pr" "conflito fora do CHANGELOG/size-limit: $others"
    node "$QUEUE_DIR/merge-queue.mjs" resolve || fail "$pr" "resolve"
    npx prettier --write CHANGELOG.md .size-limit.checks.json >/dev/null
    git add -A && git commit -q --no-edit || fail "$pr" "commit do merge"
  fi

  if npm run build >/dev/null 2>&1 && node "$QUEUE_DIR/merge-queue.mjs" remeasure "$pr" | grep -q '^bumped'; then
    npx prettier --write CHANGELOG.md .size-limit.checks.json >/dev/null
    git add -A && git commit -q -m "chore: re-measure budgets over main for #$pr" -m "$TRAILER" \
      || fail "$pr" "commit da remedição"
    echo "  budgets remedidos"
  fi

  make check >"$log" 2>&1 || { tail -30 "$log"; fail "$pr" "make check (log em $log)"; }
  grep -E "make check verde" "$log" | tail -1 || tail -1 "$log"

  git fetch -q
  [[ -z "$(git log --oneline HEAD..origin/main)" ]] || fail "$pr" "a main andou durante o check"
  git push -q -u origin "$branch" 2>&1 | grep -v '^remote' || true
  sleep 3
  gh pr merge "$pr" --merge >/dev/null 2>&1
  state="$(gh pr view "$pr" --json state --jq .state)"
  echo "#$pr $state"
  [[ "$state" == "MERGED" ]] || fail "$pr" "não ficou MERGED ($state)"
done

echo "QUEUE DONE"
