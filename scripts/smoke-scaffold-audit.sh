#!/usr/bin/env bash
# scripts/smoke-scaffold-audit.sh — o app que o `create-tempest-app` gera nasce sem
# aviso no `npm audit`.
#
# Até a 0.85.0 um projeto recém-criado mostrava 7 avisos moderados
# (GHSA-g3hv-75wg-m249, `minimatch <11.0.1` sob `@typescript-eslint/typescript-estree`)
# no primeiro `npm install`, e o `npm audit fix --force` sugerido rebaixava o
# `typescript-eslint`. Nenhum teste olhava a árvore que o template resolve: o
# lockfile do SDK não é o do consumidor, e o template não tem lockfile — cada
# scaffold resolve o `latest` do dia.
#
# Este smoke faz o que o consumidor faz: roda a CLI do tarball numa pasta vazia,
# aponta `tempest-react-sdk` para o próprio tarball (a versão ainda não está no
# registry no momento do release), resolve a árvore com `--package-lock-only` (sem
# baixar os pacotes) e reprova em qualquer aviso moderado ou pior. Ele usa o
# registry, então um advisory publicado hoje reprova o `make check` de amanhã —
# é o ponto: o template se corrige antes de chegar em alguém.
#
# Correção típica: `overrides` escopado em `template/package.json` (merge mode da
# CLI carrega o bloco junto) ou subir o piso da dependência no template.
#
# Uso:
#   scripts/smoke-scaffold-audit.sh tempest-react-sdk-X.Y.Z.tgz

set -euo pipefail

TARBALL="$(realpath "$1")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/cli" "$WORK/app"
cd "$WORK/cli"
npm init -y >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund --ignore-scripts "$TARBALL"

cd "$WORK/app"
node "$WORK/cli/node_modules/tempest-react-sdk/bin/create-tempest-app.mjs" . >/dev/null
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.dependencies["tempest-react-sdk"] = "file:" + process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$TARBALL"

npx --yes npm@11 install --package-lock-only --loglevel=error --no-audit --no-fund

if ! npx --yes npm@11 audit --audit-level=moderate; then
    echo "::error::o app gerado pelo create-tempest-app tem aviso no npm audit; corrija template/package.json (overrides ou piso da dependência)"
    exit 1
fi
echo "✓ scaffold novo: npm audit limpo"
