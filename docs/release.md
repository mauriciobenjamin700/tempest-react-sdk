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
                                       │ build (contents: read)     │
                                       │ 1. Checkout @ tag          │
                                       │ 2. tag == package.json?    │
                                       │ 3. npm ci + lint + format  │
                                       │ 4. Typecheck + tests       │
                                       │ 5. Build + npm pack        │
                                       │ smoke (contents: read)     │
                                       │ 6. Bundler, Node cru e     │
                                       │    Vitest contra o tarball │
                                       │ publish (id-token: write)  │
                                       │ 7. npm publish <tarball>   │
                                       │    --provenance            │
                                       │ 8. read-back: registry     │
                                       │    serve a versão e o      │
                                       │    dist-tag latest bate?   │
                                       │ release (contents: write)  │
                                       │ 9. GitHub Release da tag   │
                                       │    (notas = CHANGELOG,     │
                                       │     tarball anexado)       │
                                       └────────────────────────────┘
```

**As três superfícies andam juntas**: a git tag, a versão no npm e o GitHub
Release. O workflow falha se a tag não descrever a versão do `package.json`, e
falha se o registry não estiver servindo a versão como `latest` — então "workflow
verde" significa de fato "publicado e visível".

Uma tag `vX.Y.Z` é a **única** coisa que publica — o disparo manual também roda sobre a tag, nunca sobre uma branch. Não há "publish via PR merge" — o merge do release PR é apenas para sincronizar `main` com `package.json` + `RELEASES.md` atualizados.

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
- **`workflow_dispatch`** — manual, **sempre sobre a tag**: `gh workflow run release-npm.yml --ref vX.Y.Z`. Útil quando o publish de uma tag falhou e você quer re-rodar sem incrementar versão. Disparado de uma branch (`--ref main`), o guard do passo 3 reprova a run antes de instalar qualquer coisa — até a 0.76.0 ele derivava a tag do `package.json` da branch e publicava aquela árvore.

O workflow parte de `permissions: {}` e se divide em quatro jobs, cada um com só a permissão de que precisa. A divisão é o ponto: o único job que **pode** publicar não roda nada resolvido do registry na hora do release.

| Job       | Permissão         | O que roda                                                                 |
| --------- | ----------------- | -------------------------------------------------------------------------- |
| `build`   | `contents: read`  | guard de versão, `npm ci`, lint, format, typecheck, testes, build, `npm pack` |
| `smoke`   | `contents: read`  | os três smokes do tarball, com as instalações flutuantes do consumidor     |
| `publish` | `id-token: write` (environment `npm-release`) | npm CLI fixado + `npm publish` do tarball já testado + read-back           |
| `release` | `contents: write` | o GitHub Release, sem instalar nada                                        |

Passos, na ordem:

1. **Checkout** (`actions/checkout`, fixado por SHA como toda action do workflow) com `fetch-depth: 0` e `persist-credentials: false` — o `GITHUB_TOKEN` não fica gravado no `.git/config` para os passos seguintes.
2. **Node 22** + cache npm.
3. **Guard de ref** (`scripts/check-release-ref.sh`) — **aborta**, antes de qualquer instalação, se o ref da run não é uma tag `vX.Y.Z` (ou `vX.Y.Z-pre`), se a tag não descreve o `version` do `package.json`, ou se ela não aponta para o commit em checkout (`GITHUB_SHA`). Vale para tag push e para `workflow_dispatch`. Também deriva `prerelease` (versão com `-`) para marcar o Release corretamente.
4. **`npm ci`**, **lint**, **format check**, **typecheck**, **testes** e **build**.
5. **`npm pack`** — o tarball sobe como artifact (`npm-tarball`) e o SHA-256 dele vira output do job. Output de job não pode ser reescrito por job posterior, então todo job que baixa o artifact confere o digest antes de usá-lo (`sha256sum --check`).
6. **Smoke** (job `smoke`) — instala o tarball em `/tmp/sdk-smoke` com `react@^19 react-dom@^19 react-router@^8` e empacota com esbuild, roda as mesmas asserções em Node cru com o `node-css-loader` publicado, e roda uma suíte Vitest de consumidor (`scripts/smoke-vitest.sh`). Essas instalações resolvem versões flutuantes do registry — por isso moram num job sem permissão de escrita nenhuma.
7. **`npm publish "./<tarball>" --provenance --access public`** (job `publish`) via **Trusted Publishing (OIDC)** — sem `NPM_TOKEN`. Publica **o arquivo** que o `build` empacotou e o `smoke` testou: publish de diretório re-rodaria o `prepublishOnly` (typecheck + lint + a suíte inteira + build) dentro do job com `id-token`, e mandaria um pack novo em vez do testado; publish de tarball não roda script de ciclo de vida nenhum. O npm CLI é instalado em versão exata (`npm install -g npm@12.2.0`), não `@latest`.
8. **Read-back do registry** — confirma que o npm serve `tempest-react-sdk@<versão>` (até 30 minutos, porque o registry processa o upload de forma assíncrona) **e** que `dist-tags.latest` aponta para ela. Falha o job caso contrário: publish que aterrissou em outra tag deixaria de parecer verde.
9. **GitHub Release** (job `release`) — `gh release create <tag>` com o tarball do artifact anexado e as notas extraídas da seção do `CHANGELOG.md` (`scripts/changelog.mjs notes <versão> --allow-unreleased`), acrescidas do link para a versão no npm. Antes, confere que a tag ainda resolve para o `GITHUB_SHA` publicado e que o sha512 do tarball é o `dist.integrity` que o npm serve; o `gh release create` leva `--verify-tag`, então nunca cria uma tag faltante na HEAD da branch padrão. Se o Release já existe, faz `gh release edit` + `upload --clobber` em vez de falhar — e o `--clobber` só re-sobe os mesmos bytes que o npm serve. Re-rodar o workflow para a mesma tag é seguro: use **Re-run failed jobs**, que reaproveita o artifact da run que publicou; um re-run completo reempacota, e o job falha se o pack novo não bater byte a byte com o publicado.

!!! note "Por que o npm é fixado em 12.2.0"
    Trusted Publishing exige npm >= 11.5.1, e o Node 22 traz 10.x. Até a 0.76.0 o passo instalava `npm@latest`, e o `latest` mudou de major duas vezes debaixo do job sem ninguém escolher: os logs das runs da v0.74.0 à v0.76.0 mostram o npm 12 (`npm notice run …`, `allowScripts`). A 12.2.0 é a versão que publicou essas três releases. Subir o npm é uma mudança deliberada nessa linha, revisada como qualquer outra.

### Environment `npm-release`

O job `publish` roda no environment `npm-release`. Sem configuração, o GitHub o cria vazio e ele não barra nada — o workflow funciona igual. Ele é o gancho para dois controles que moram fora do repositório, e que valem a pena:

- **Em Settings → Environments → `npm-release`**: _Required reviewers_ (o publish espera aprovação humana, mesmo depois de todos os gates verdes) e _Deployment branches and tags_ restrito a tags `v*`.
- **No Trusted Publisher do npmjs.com**: o campo _Environment_ preenchido com `npm-release`. Daí em diante o npm só aceita a troca OIDC de um job nesse environment — outro workflow ou outro job do mesmo arquivo não publica.

!!! tip "Ligue os dois juntos"
    O revisor obrigatório sem o vínculo no npm deixa um job fora do environment publicar; o vínculo sem o revisor deixa qualquer run do environment publicar sem ninguém olhar.

## Segredos necessários no GitHub

**Nenhum.** O publish usa **Trusted Publishing** do npm: o `npm publish` troca a identidade OIDC do GitHub Actions por um token de vida curta, então não existe `NPM_TOKEN` no repositório. O que precisa estar configurado é um **Trusted Publisher** em npmjs.com apontando para este repositório + o arquivo `release-npm.yml`.

O `GITHUB_TOKEN` (usado para criar o Release) é fornecido automaticamente pelo Actions runtime — só o `permissions: contents: write` do job precisa estar declarado, e está.

!!! warning "O `NPM_TOKEN` continua sendo assunto do fallback local"
    `make publish` publica da sua máquina e aí sim precisa de token no `~/.npmrc` (Classic Automation, ou Granular com "Allow bypass 2FA" marcado). Esse caminho **não** gera provenance e **não** cria o GitHub Release — se você usar o fallback, rode `make releases-sync` depois para o Release não ficar faltando.

## Provenance signing

O publish inclui `--provenance` quando rodado no CI. Isso requer:

- `permissions: id-token: write` no workflow (já configurado).
- npm >= 11.5.1 no runner (o job `publish` instala a 12.2.0, fixada).
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
