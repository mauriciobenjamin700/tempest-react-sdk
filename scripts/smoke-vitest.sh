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
# Monta um projeto descartável com o `vite.config.ts` do scaffold
# (`createViteConfig`), importa o barril e renderiza um `Button`.
#
# A instalação roda no npm 11 mesmo sob Node 22: o npm 10.9.8 que vem com ele cai
# com `Cannot read properties of null (reading 'edgesOut')` em
# `npm install vitest@^4` num projeto vazio, sem o SDK no meio. `--loglevel=error`
# no lugar de `--silent`, que engolia esse erro e deixava só o exit 1.

set -euo pipefail

TARBALL="$(realpath "$1")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

npm init -y >/dev/null
npm pkg set type=module >/dev/null
npx --yes npm@11 install --loglevel=error --no-audit --no-fund "$TARBALL" \
    react@^19 react-dom@^19 react-router@^8 \
    vite@^8 @vitejs/plugin-react vitest@^4 happy-dom

mkdir src
cat > vite.config.ts <<'CONFIG'
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
    overrides: { test: { environment: "happy-dom" } },
});
CONFIG

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

npx vitest run
