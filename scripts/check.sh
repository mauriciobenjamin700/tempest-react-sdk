#!/usr/bin/env bash
# scripts/check.sh — todo gate que a CI rodava, na máquina local (`make check`).
#
# Desde 2026-10-26 a CI só publica: `ci.yml`, `size-limit.yml` e `e2e.yml` saíram,
# e este script é o único lugar onde a suíte, os budgets, os smokes do tarball e o
# e2e da gallery rodam antes de um merge ou de uma tag. `scripts/release.sh` o
# chama antes de empurrar o PR de release; `test/ci-policy.test.ts` reprova quem
# tirar um passo daqui ou devolver teste para a CI.
#
# Os tarballs dos smokes vão para um diretório temporário: `npm pack` sem destino
# deixa o `.tgz` na raiz, onde o `prettier --check .` e o `git status` o veem.
#
# Variáveis de ambiente:
#   SKIP_E2E=1   pula o e2e da gallery (o passo mais lento; use só em iteração)
set -euo pipefail

SKIP_E2E="${SKIP_E2E:-0}"
PACK_DIR="$(mktemp -d)"
trap 'rm -rf "$PACK_DIR"' EXIT

step() {
  local started=$SECONDS
  echo ""
  echo "→ $1"
  shift
  "$@"
  echo "  ✓ $((SECONDS - started)) s"
}

icons_match_lucide() {
  npm run gen:icons
  git diff --exit-code -- src/icons/generated docs/assets
}

pack() {
  npm pack --silent --pack-destination "$PACK_DIR" | tail -1
}

smoke_tarball() {
  local tarball
  tarball="$PACK_DIR/$(pack)"
  scripts/smoke-vitest.sh "$tarball"
  scripts/smoke-cli.sh "$tarball"
}

gallery_e2e() {
  npm ci --prefix examples/gallery --no-audit --no-fund
  npm --prefix examples/gallery run build
  npm run e2e
}

step "npm ci" npm ci
step "tabelas de ícones batem com o lucide instalado" icons_match_lucide
step "format" npm run format:check
step "lint" npm run lint
step "typecheck" npm run typecheck
step "testes + pisos de cobertura" npm run test:coverage
step "build" npm run build
step "size-limit" npx size-limit
step "capturas da gallery" npm run docs:gallery -- --check
step "smokes do tarball (Vitest do consumidor + CLI)" smoke_tarball
if [[ "$SKIP_E2E" == "1" ]]; then
  echo ""
  echo "→ e2e da gallery: PULADO (SKIP_E2E=1)"
else
  step "e2e da gallery (Playwright + axe)" gallery_e2e
fi

echo ""
echo "✓ make check verde em $SECONDS s"
