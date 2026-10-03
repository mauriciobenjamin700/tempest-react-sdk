#!/usr/bin/env bash
# scripts/smoke-vitest.sh — roda uma suíte Vitest de consumidor contra o tarball.
#
# Desde a 0.63.0 cada componente importa a própria folha, e o Vitest externaliza
# para o Node um pacote ESM de node_modules — que não carrega `.css`. Sem o
# `tempestVitest()` (incluído no `createViteConfig`), importar o barril quebra a
# suíte do consumidor com `Unknown file extension ".css"` (#397). A suíte do SDK
# testa `src/`, que o Vite transforma; só o pacote instalado mostra esse caminho.
#
# Uso:
#   scripts/smoke-vitest.sh tempest-react-sdk-X.Y.Z.tgz
#
# Monta dois projetos descartáveis e, em cada um, importa o barril e renderiza
# um `Button`:
#
# 1. o `vite.config.ts` do scaffold (`createViteConfig`), com `@vitejs/plugin-react`;
# 2. um `vitest.config.ts` só com `tempestVitest()` e **sem** `@vitejs/plugin-react`,
#    que é peer opcional. Até a 0.73.0 o barril `tempest-react-sdk/vite` importava o
#    plugin React no topo, e esse projeto nem carregava a config
#    (`ERR_MODULE_NOT_FOUND`, #401). O cenário 1 instala o plugin, então não via isso.
#
# A instalação roda no npm 11 mesmo sob Node 22: o npm 10.9.8 que vem com ele cai
# com `Cannot read properties of null (reading 'edgesOut')` em
# `npm install vitest@^4` num projeto vazio, sem o SDK no meio. `--loglevel=error`
# no lugar de `--silent`, que engolia esse erro e deixava só o exit 1.

set -euo pipefail

TARBALL="$(realpath "$1")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

write_test() {
    mkdir -p src
    cat > src/sdk.test.tsx <<'TEST'
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import * as sdk from "tempest-react-sdk";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("the barrel imports and a component renders", async () => {
    expect(Object.keys(sdk).length).toBeGreaterThan(500);
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => createRoot(host).render(<sdk.Button>Salvar</sdk.Button>));
    expect(host.querySelector("button")?.textContent).toBe("Salvar");
});
TEST
}

echo "→ cenário 1: createViteConfig, com @vitejs/plugin-react"
mkdir "$WORK/scaffold" && cd "$WORK/scaffold"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund "$TARBALL" \
    react@^19 react-dom@^19 react-router@^8 \
    vite@^8 @vitejs/plugin-react vitest@^4 happy-dom

cat > vite.config.ts <<'CONFIG'
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
    overrides: { test: { environment: "happy-dom" } },
});
CONFIG
write_test
npx vitest run

echo "→ cenário 2: tempestVitest(), sem @vitejs/plugin-react"
mkdir "$WORK/no-react-plugin" && cd "$WORK/no-react-plugin"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund "$TARBALL" \
    react@^19 react-dom@^19 react-router@^8 \
    vite@^8 vitest@^4 happy-dom
if [ -d node_modules/@vitejs/plugin-react ]; then
    echo "::error::@vitejs/plugin-react was installed anyway; this scenario would prove nothing"
    exit 1
fi

cat > vitest.config.ts <<'CONFIG'
import { defineConfig } from "vitest/config";
import { tempestVitest } from "tempest-react-sdk/vite";

export default defineConfig({
    plugins: [tempestVitest()],
    test: { environment: "happy-dom" },
});
CONFIG
write_test
npx vitest run
