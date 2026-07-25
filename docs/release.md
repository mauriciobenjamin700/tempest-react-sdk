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
  │  3. fecha o CHANGELOG   │
  │     ([Unreleased] →     │
  │      [TAG] — data)      │
  │  4. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  5. commit + tag local  │
  │  6. push branch + tag   │──────────► tag push triggers
  │  7. abre PR via gh      │            .github/workflows/release-npm.yml
  └─────────────────────────┘                     │
                                                  ▼
                                       ┌────────────────────────────┐
                                       │ 1. Checkout @ tag          │
                                       │ 2. tag == package.json?    │
                                       │ 3. Lint + format-check     │
                                       │ 4. Typecheck               │
                                       │ 5. Tests (vitest)          │
                                       │ 6. Build (vite + dts)      │
                                       │ 7. Smoke install           │
                                       │ 8. npm publish             │
                                       │    --provenance            │
                                       │ 9. read-back: registry     │
                                       │    serve a versão e o      │
                                       │    dist-tag latest bate?   │
                                       │ 10. GitHub Release da tag  │
                                       │     (notas = CHANGELOG,    │
                                       │      tarball anexado)      │
                                       └────────────────────────────┘
```

**As três superfícies andam juntas**: a git tag, a versão no npm e o GitHub
Release. O workflow falha se a tag não descrever a versão do `package.json`, e
falha se o registry não estiver servindo a versão como `latest` — então "workflow
verde" significa de fato "publicado e visível".

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

### `make releases-check`

Relatório de sincronia das três superfícies — uma linha por git tag, dizendo se a versão existe no npm e se a tag tem GitHub Release:

```text
TAG          NPM      RELEASE  STATUS
v0.24.0      ok       ok       sincronizado
v0.23.0      ok       FALTA    DESSINCRONIZADO
```

Só leitura, seguro de rodar sempre. Use antes e depois de um release.

### `make releases-sync` / `make releases-sync-dry`

Cria os **GitHub Releases faltantes** para tags que já existem (backfill), com as notas vindas da seção correspondente do `CHANGELOG.md`. Tags que já têm Release são puladas — o script é idempotente e nunca reescreve um Release existente.

```bash
make releases-sync-dry   # lista o que faria, sem criar nada
make releases-sync       # cria de verdade
```

Necessário porque o publish no npm e a criação do Release passaram a andar juntos só a partir da v0.24.0: as tags anteriores existiam no git e no npm, mas sem Release no GitHub.

!!! info "Notas de um backfill nunca herdam `[Unreleased]`"
    O `scripts/changelog.mjs notes <versão>` só cai no bloco `[Unreleased]` quando recebe `--allow-unreleased` (o que o workflow faz, para o caso de um release cortado antes de datar a seção). No backfill a flag **não** é passada — assim uma tag antiga nunca recebe as notas do ciclo seguinte; sem seção, o Release sai com um ponteiro para o `CHANGELOG.md`.

## CI workflow (`.github/workflows/release-npm.yml`)

Disparado por:

- **`push: tags: [v*.*.*]`** — fluxo principal. `make release TAG=X` push uma tag e o workflow dispara automaticamente.
- **`workflow_dispatch`** — manual via `gh workflow run release-npm.yml --ref main`. Útil quando o publish de uma tag falhou e você quer re-rodar sem incrementar versão.

Passos do job `publish`:

1. **Checkout** (`actions/checkout@v5`) com `fetch-depth: 0`.
2. **Node 22** + `registry-url: https://registry.npmjs.org` + cache npm, e `npm install -g npm@latest` (Trusted Publishing exige npm >= 11.5.1).
3. **Guard de versão** — compara a tag (`GITHUB_REF_NAME` sem o `v`) com o `version` do `package.json` e **aborta** se divergirem, antes de qualquer publish. Também deriva `prerelease` (versão com `-`) para marcar o Release corretamente. Em `workflow_dispatch` a tag é derivada do `package.json`.
4. **`npm ci`**.
5. **Lint** (`npm run lint`).
6. **Format check** (`npm run format:check`).
7. **Typecheck** (`npm run typecheck`).
8. **Tests** (`npm run test:run`).
9. **Build** (`npm run build`).
10. **Smoke install** — gera tarball via `npm pack`, instala em `/tmp/sdk-smoke` com `react@^19 react-dom@^19` (as demais deps vêm como dependências diretas do pacote), importa o pacote dinamicamente e valida que 20 exports core estão presentes.
11. **`npm publish --provenance --access public`** via **Trusted Publishing (OIDC)** — sem `NPM_TOKEN`. `id-token: write` é o que permite o attestation de provenance no sigstore.
12. **Read-back do registry** — confirma que o npm serve `tempest-react-sdk@<versão>` (com até 5 tentativas, porque o registry demora a propagar) **e** que `dist-tags.latest` aponta para ela. Falha o job caso contrário: publish que aterrissou em outra tag deixaria de parecer verde.
13. **GitHub Release** — `gh release create <tag>` com o tarball anexado e as notas extraídas da seção do `CHANGELOG.md` (`scripts/changelog.mjs notes <versão> --allow-unreleased`), acrescidas do link para a versão no npm. Se o Release já existe, faz `gh release edit` + `upload --clobber` em vez de falhar, então re-rodar o workflow para a mesma tag é seguro. Exige `contents: write` no job.

## Segredos necessários no GitHub

**Nenhum.** O publish usa **Trusted Publishing** do npm: o `npm publish` troca a identidade OIDC do GitHub Actions por um token de vida curta, então não existe `NPM_TOKEN` no repositório. O que precisa estar configurado é um **Trusted Publisher** em npmjs.com apontando para este repositório + o arquivo `release-npm.yml`.

O `GITHUB_TOKEN` (usado para criar o Release) é fornecido automaticamente pelo Actions runtime — só o `permissions: contents: write` do job precisa estar declarado, e está.

!!! warning "O `NPM_TOKEN` continua sendo assunto do fallback local"
    `make publish` publica da sua máquina e aí sim precisa de token no `~/.npmrc` (Classic Automation, ou Granular com "Allow bypass 2FA" marcado). Esse caminho **não** gera provenance e **não** cria o GitHub Release — se você usar o fallback, rode `make releases-sync` depois para o Release não ficar faltando.

## Provenance signing

O publish inclui `--provenance` quando rodado no CI. Isso requer:

- `permissions: id-token: write` no workflow (já configurado).
- npm >= 11.5.1 no runner (o step de upgrade cuida disso).
- Um Trusted Publisher configurado no npmjs.com para este repositório.

O resultado: cada versão publicada carrega um attestation assinado pelo sigstore, ligando o tarball ao commit + workflow run que o produziram. Visível no [registry](https://www.npmjs.com/package/tempest-react-sdk) como badge "Verified provenance".

Publish manual local **não** consegue provenance — não há OIDC provider fora do CI. `make publish` sempre roda sem `--provenance`.

## Histórico

Veja [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) (auto-gerado via `make releases-md`) e [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) (escrito à mão antes de cada release).

## Veja também

- [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) — registro de mudanças por versão
- [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) — tabela de tags com data e commit
- [`Makefile`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/Makefile) — definição dos alvos
- [`scripts/release.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release.sh) — script bash do pipeline
