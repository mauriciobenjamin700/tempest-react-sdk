#!/usr/bin/env bash
# scripts/release-pack.sh — valida, builda, empacota e testa o tarball do release.
#
# Uso (na raiz de um checkout do commit taggeado):
#   scripts/release-pack.sh <diretório-do-pack>
#
# É o que os jobs `build` e `smoke` do `release-npm.yml` faziam até 2026-11-13,
# quando o publish saiu do GitHub Actions. O `scripts/release-tag.sh` o roda num
# `git worktree` descartável do commit que vai ser taggeado, depois do guard de
# ref, e publica **o** `.tgz` que este script deixa no diretório — o mesmo
# arquivo que os smokes exercitaram, nunca um pack novo.
#
# Roda `npm ci`, lint, format, typecheck, a suíte e o build sobre a árvore
# taggeada: o PR de release passou no `make check` na branch, mas o commit do
# merge é outra árvore quando a `main` andou no meio. Depois empacota e roda os
# três smokes do consumidor (bundler + Node cru, Vitest, CLI). O diretório do pack
# termina com exatamente um `.tgz`; outra contagem reprova.

set -euo pipefail

PACK_DIR="${1:?uso: scripts/release-pack.sh <diretório-do-pack>}"
mkdir -p "$PACK_DIR"
PACK_DIR="$(realpath "$PACK_DIR")"

step() {
  local started=$SECONDS
  echo ""
  echo "→ $1"
  shift
  "$@"
  echo "  ✓ $((SECONDS - started)) s"
}

step "npm ci" npm ci --no-audit --no-fund
step "lint" npm run lint
step "format" npm run format:check
step "typecheck" npm run typecheck
step "testes" npm run test:run
step "build" npm run build
step "npm pack" npm pack --silent --pack-destination "$PACK_DIR"

mapfile -t TARBALLS < <(find "$PACK_DIR" -maxdepth 1 -name '*.tgz')
if [[ ${#TARBALLS[@]} -ne 1 ]]; then
  echo "ERROR: $PACK_DIR tem ${#TARBALLS[@]} tarballs, esperado 1" >&2
  exit 1
fi

step "smoke: bundler + Node cru" scripts/smoke-bundle.sh "${TARBALLS[0]}"
step "smoke: Vitest do consumidor" scripts/smoke-vitest.sh "${TARBALLS[0]}"
step "smoke: CLI" scripts/smoke-cli.sh "${TARBALLS[0]}"
