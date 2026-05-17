# Release pipeline

Como o `tempest-react-sdk` é publicado no npm — workflow tag-push automático, com fallback manual.

## Visão geral

```text
Local:                                  GitHub Actions:
  make release TAG=X.Y.Z
       │
       ▼
  ┌─────────────────────────┐
  │ scripts/release.sh:     │
  │  1. branch release/vTAG │
  │  2. npm version TAG     │
  │  3. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  4. commit + tag local  │
  │  5. push branch + tag   │──────────► tag push triggers
  │  6. abre PR via gh      │            .github/workflows/release-npm.yml
  └─────────────────────────┘                     │
                                                  ▼
                                       ┌────────────────────────┐
                                       │ 1. Checkout @ tag      │
                                       │ 2. Lint + format-check │
                                       │ 3. Typecheck           │
                                       │ 4. Tests (vitest)      │
                                       │ 5. Build (vite + dts)  │
                                       │ 6. Smoke install       │
                                       │ 7. npm publish         │
                                       │    --provenance        │
                                       └────────────────────────┘
```

Tag push é a **única** forma de publicar. Não há "publish via PR merge" — o merge do release PR é apenas para sincronizar `main` com `package.json` + `RELEASES.md` atualizados.

## Comandos

### `make release TAG=0.1.5`

Pipeline completo. Requer working tree limpo + tag inexistente local/remoto.

Bloqueia se `CHANGELOG.md` não mencionar `[TAG]` ou `[Unreleased]` (com prompt para forçar continuação).

### `make release TAG=0.1.5 DRY_RUN=1`

Idêntico, mas para antes do push — você inspeciona a branch e o tag locais antes de continuar manualmente:

```bash
git push -u origin release/v0.1.5
git push origin v0.1.5
gh pr create --base main --head release/v0.1.5 --title "chore: release v0.1.5"
```

### `make release TAG=0.1.5 SKIP_VALIDATE=1`

Pula a validação local (`npm ci`, lint, format-check, typecheck, test, build, pack dry-run). Use apenas em emergências — o CI vai validar novamente do zero.

### `make validate`

Roda toda a validação local sem fazer release. Equivalente ao bloco de validação do CI.

### `make publish`

Fallback manual. Requer `NPM_TOKEN` no `~/.npmrc` (token com bypass 2FA) ou `npm login` interativo. **Não dispara workflow** — publish direto.

```bash
npm config set //registry.npmjs.org/:_authToken=npm_xxx... --location=user
npm run build
make publish
```

Sem token com bypass 2FA, npm exige OTP:

```bash
npm publish --access public --otp=123456
```

### `make releases`

Lista todas as tags `v*.*.*` ordenadas por versão (mais recentes primeiro).

### `make releases-md`

Regenera `RELEASES.md` a partir das git tags. Chamado automaticamente pelo `scripts/release.sh` após criar a tag.

## CI workflow (`.github/workflows/release-npm.yml`)

Disparado por:

- **`push: tags: [v*.*.*]`** — fluxo principal. `make release TAG=X` push uma tag e o workflow dispara automaticamente.
- **`workflow_dispatch`** — manual via `gh workflow run release-npm.yml --ref main`. Útil quando o publish de uma tag falhou e você quer re-rodar sem incrementar versão.

Passos do job `publish`:

1. **Checkout** (`actions/checkout@v5`) com `fetch-depth: 0`.
2. **Node 22** + `registry-url: https://registry.npmjs.org` + cache npm.
3. **`npm ci`**.
4. **Lint** (`npm run lint`).
5. **Format check** (`npm run format:check`).
6. **Typecheck** (`npm run typecheck`).
7. **Tests** (`npm run test:run`).
8. **Build** (`npm run build`).
9. **Smoke install** — gera tarball via `npm pack`, instala em `/tmp/sdk-smoke` com **todos** os optional peers (`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`) + `react@^19 react-dom@^19`, importa o pacote dinamicamente, valida que 20 exports core estão presentes.
10. **`npm publish --provenance --access public`** usando `NPM_TOKEN` secret. `id-token: write` permission permite o OIDC necessário para o sigstore provenance attestation.

## Segredos necessários no GitHub

Apenas um:

- **`NPM_TOKEN`** — token npm com permissão de publicar tempest-react-sdk + bypass 2FA habilitado. Configurar:
  ```bash
  gh secret set NPM_TOKEN --body "npm_xxx..."
  ```
  Tipo recomendado: **Classic Automation token** (bypass 2FA por default) OU **Granular Access Token** com flag "Allow bypass 2FA" marcada explicitamente.

`GITHUB_TOKEN` é fornecido automaticamente pelo Actions runtime.

## Provenance signing

O publish inclui `--provenance` quando rodado no CI. Isso requer:

- `permissions: id-token: write` no workflow (já configurado).
- `NPM_CONFIG_PROVENANCE=true` env var (já configurado).
- Token npm com permissão `publish`.

O resultado: cada versão publicada carrega um attestation assinado pelo sigstore, ligando o tarball ao commit + workflow run que o produziram. Visível no [registry](https://www.npmjs.com/package/tempest-react-sdk) como badge "Verified provenance".

Publish manual local **não** consegue provenance — não há OIDC provider fora do CI. `make publish` sempre roda sem `--provenance`.

## Histórico

Veja [`RELEASES.md`](../RELEASES.md) (auto-gerado via `make releases-md`) e [`CHANGELOG.md`](../CHANGELOG.md) (escrito à mão antes de cada release).

## Veja também

- [`CHANGELOG.md`](../CHANGELOG.md) — registro de mudanças por versão
- [`RELEASES.md`](../RELEASES.md) — tabela de tags com data e commit
- [`Makefile`](../Makefile) — definição dos alvos
- [`scripts/release.sh`](../scripts/release.sh) — script bash do pipeline
