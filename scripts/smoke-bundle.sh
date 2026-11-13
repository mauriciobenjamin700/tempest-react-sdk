#!/usr/bin/env bash
# scripts/smoke-bundle.sh — importa o tarball do jeito que o consumidor importa.
#
# Dois caminhos, as mesmas asserções (`scripts/smoke-imports.mjs`):
#
# 1. **Bundler.** O tarball é instalado num projeto descartável e o entry é
#    empacotado com esbuild (`--loader:.css=empty`), que é o que Vite, webpack e
#    Rspack fazem com as folhas que cada componente importa desde a 0.63.0. Node
#    cru não serve aqui: `.css` não é formato que o Node carrega, e o
#    `import("tempest-react-sdk")` morre com ERR_UNKNOWN_FILE_EXTENSION antes de
#    qualquer asserção. Peer faltando faz o esbuild sair 1 (`Could not resolve
#    "react-router"`); export faltando faz o `node` sair 1.
# 2. **Node cru com o loader publicado.** As mesmas asserções rodam com
#    `node --import tempest-react-sdk/node-css-loader`, a saída que o pacote
#    oferece para script, Jest sem transform de stylesheet ou introspecção.
#
# react, react-dom e react-router entram explicitamente, para o smoke nunca
# depender da instalação automática de peers do npm.
#
# Até 2026-11-13 este passo morava inline no `release-npm.yml`; saiu do GitHub
# Actions junto com o publish e roda no `make check` e no `make release-tag`.
#
# A instalação roda no npm 11 pelo mesmo motivo do `smoke-vitest.sh` (npm 10.9.8
# cai com `edgesOut` sob Node 22).
#
# Uso:
#   scripts/smoke-bundle.sh tempest-react-sdk-X.Y.Z.tgz

set -euo pipefail

TARBALL="$(realpath "$1")"
ENTRY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/smoke-imports.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund "$TARBALL" \
    react@^19 react-dom@^19 react-router@^8 esbuild
cp "$ENTRY" entry.mjs

echo "→ esbuild bundle do barril"
npx --no-install esbuild entry.mjs --bundle --format=esm --platform=node \
    --loader:.css=empty --outfile=smoke.mjs --log-level=warning
node smoke.mjs

echo "→ Node cru com o node-css-loader publicado"
node --import tempest-react-sdk/node-css-loader entry.mjs
