#!/usr/bin/env bash
# scripts/smoke-cli.sh — roda o bin `tempest` do tarball em Node puro, sem `--import`.
#
# O bin roda como o consumidor o chama (`npx tempest …`), em Node puro. Até a
# 0.77.0 o `gen icons` importava o barril `dist/icons.js`, que alcança um `.css`
# desde a 0.63.0, e falhava em todo app instalado com "Could not read the icon
# tables" (#485). A suíte do SDK roda sob Vitest, que carrega `.css` sozinho; só o
# pacote instalado mostra o caminho real.
#
# Uso:
#   scripts/smoke-cli.sh tempest-react-sdk-X.Y.Z.tgz
#
# A instalação roda no npm 11 pelo mesmo motivo do `smoke-vitest.sh` (npm 10.9.8
# cai com `edgesOut` sob Node 22).

set -euo pipefail

TARBALL="$(realpath "$1")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund "$TARBALL" \
    react@^19 react-dom@^19 react-router@^8

mkdir src
echo 'import { Icon } from "tempest-react-sdk"; export const x = <Icon name="check" />;' > src/a.tsx

echo "→ tempest gen icons (Node puro)"
node node_modules/tempest-react-sdk/bin/tempest.mjs gen icons
if ! grep -q '"check"' src/icons.generated.ts; then
    echo "::error::src/icons.generated.ts não registrou o slug check"
    cat src/icons.generated.ts
    exit 1
fi
echo "✓ gen icons gerou o registro em Node puro"
