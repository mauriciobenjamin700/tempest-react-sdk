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
  │  4. commit + RELEASES.md│
  │  5. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  6. push da branch      │
  │  7. abre PR via gh      │
  │     (sem tag)           │
  └─────────────────────────┘
       │ revisão + merge do PR na main
       ▼
  make release-tag TAG=X.Y.Z
  ┌─────────────────────────┐
  │ scripts/release-tag.sh: │
  │  1. acha o commit do    │
  │     merge na main       │
  │  2. tag vTAG nele       │
  │  3. push da tag         │──────────► tag push triggers
  └─────────────────────────┘            .github/workflows/release-npm.yml
                                                  │
                                                  ▼
                                       ┌────────────────────────────┐
                                       │ build (contents: read)     │
                                       │ 1. Checkout @ tag          │
                                       │ 2. tag == package.json, e  │
                                       │    o commit está na main?  │
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
                                       │    o dist-tag bate?        │
                                       │ release (contents: write)  │
                                       │ 9. GitHub Release da tag   │
                                       │    (notas = CHANGELOG,     │
                                       │     tarball anexado)       │
                                       └────────────────────────────┘
```

**As três superfícies andam juntas**: a git tag, a versão no npm e o GitHub
Release. O workflow falha se a tag não descrever a versão do `package.json`, e
falha se o registry não estiver servindo a versão sob o dist-tag dela — então "workflow
verde" significa de fato "publicado e visível".

Uma tag `vX.Y.Z` é a **única** coisa que publica — o disparo manual também roda sobre a tag, nunca sobre uma branch. O merge do PR de release não publica nada sozinho: ele leva o bump para a `main`, e **só depois** a tag nasce no commit do merge (`make release-tag`). O guard do workflow reprova tag em commit que não está na `main` (#472), então nada que não passou pela revisão do PR chega ao npm.

## Comandos

O release é **dois passos**, com a revisão do PR no meio:

```bash
make release TAG=0.1.5       # 1. abre o PR de release (não taggeia, não publica)
# ... revisão e merge do PR na main ...
make release-tag TAG=0.1.5   # 2. tag no commit do merge + push → publica
```

### `make release TAG=0.1.5`

Abre o PR de release: branch `release/v0.1.5`, bump, `[Unreleased]` fechado em `[0.1.5]`, `RELEASES.md` regenerado, validação local, push da branch e PR via `gh`. **Não cria nem empurra tag** — nada é publicado neste passo. Requer working tree limpo + tag inexistente local/remoto.

Bloqueia se `CHANGELOG.md` não mencionar `[TAG]` ou `[Unreleased]` (com prompt para forçar continuação).

!!! info "A tag provisória do `RELEASES.md`"
    `make releases-md` gera a tabela a partir das git tags, e a linha da versão nova precisa estar no commit que vai ser taggeado (é o que o `test/docs-counts.test.ts` confere). O script cria uma tag local provisória só durante esse comando e a apaga em seguida. A coluna Commit da linha nova aponta para o `chore: release` da branch; o próximo `make releases-md` a reescreve com o commit da tag de verdade.

### `make release TAG=0.1.5 DRY_RUN=1`

Idêntico, mas para antes do push — você inspeciona a branch local antes de continuar manualmente:

```bash
git push -u origin release/v0.1.5
gh pr create --base main --head release/v0.1.5 --title "chore: release v0.1.5"
# depois do merge:
make release-tag TAG=0.1.5
```

### `make release-tag TAG=0.1.5`

Roda **depois do merge** do PR de release. Busca `origin/main`, escolhe o commit e empurra a tag `v0.1.5` nele — o push é o que dispara o `release-npm.yml`.

O commit escolhido é o **primeiro** da história first-parent da `main` cujo `package.json` está em `0.1.5`: o merge (ou o squash) do PR de release. Um PR mergeado depois dele, ainda na mesma versão, fica de fora — está no `[Unreleased]` e não pode ir para o npm sob uma versão que não o documenta. Antes de taggear, o script confere a versão do `package.json`, a linha `| v0.1.5 |` no `RELEASES.md` desse commit e que a tag não existe, local nem no origin.

- `DRY_RUN=1` mostra o commit que seria taggeado e para, sem criar nada.
- `REF=<sha>` taggeia um commit específico, para quando a `main` já andou para outra versão antes do tag. O commit precisa estar na `main` e ter a versão certa.

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

Regenera `RELEASES.md` a partir das git tags. Chamado automaticamente pelo `scripts/release.sh`, com uma tag local provisória da versão nova que é apagada logo depois.

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

- **`push: tags: [v*.*.*]`** — fluxo principal. `make release-tag TAG=X`, depois do merge do PR de release, empurra a tag e o workflow dispara automaticamente.
- **`workflow_dispatch`** — manual, **sempre sobre a tag**: `gh workflow run release-npm.yml --ref vX.Y.Z`. Útil quando o publish de uma tag falhou e você quer re-rodar sem incrementar versão. Disparado de uma branch (`--ref main`), o guard do passo 3 reprova a run antes de instalar qualquer coisa — até a 0.76.0 ele derivava a tag do `package.json` da branch e publicava aquela árvore.

O workflow parte de `permissions: {}`, roda um release por vez, de qualquer tag (`concurrency` com grupo único `release-npm`, sem cancelar o que está em andamento — o publish dele pode já ter acontecido) e se divide em quatro jobs, cada um com só a permissão de que precisa. A divisão é o ponto: o único job que **pode** publicar não roda nada resolvido do registry na hora do release.

| Job       | Permissão         | O que roda                                                                 |
| --------- | ----------------- | -------------------------------------------------------------------------- |
| `build`   | `contents: read`  | guard de versão, `npm ci`, lint, format, typecheck, testes, build, `npm pack` |
| `smoke`   | `contents: read`  | os três smokes do tarball, com as instalações flutuantes do consumidor     |
| `publish` | `id-token: write` (environment `npm-release`) | npm CLI fixado + `npm publish` do tarball já testado + read-back           |
| `release` | `contents: write` | o GitHub Release, sem instalar nada                                        |

Passos, na ordem:

1. **Checkout** (`actions/checkout`, fixado por SHA como toda action do workflow) com `fetch-depth: 0` e `persist-credentials: false` — o `GITHUB_TOKEN` não fica gravado no `.git/config` para os passos seguintes.
2. **Node 22** + cache npm.
3. **Guard de ref** (`scripts/check-release-ref.sh`) — **aborta**, antes de qualquer instalação, se o ref da run não é uma tag `vX.Y.Z` (ou `vX.Y.Z-pre`), se a tag não descreve o `version` do `package.json`, se ela não aponta para o commit em checkout (`GITHUB_SHA`), ou se esse commit **não está na `main`** (não é ancestral de `origin/main`, #472) — o checkout com `fetch-depth: 0` é o que traz `origin/main`, e sem ela o guard falha fechado. Vale para tag push e para `workflow_dispatch`. Também deriva `prerelease` (versão com `-`) para marcar o Release corretamente, e escolhe o dist-tag comparando a versão com o `latest` atual do registry, que o passo anterior lê com `scripts/release-dist-tag.sh current-latest` (veja [Dist-tags](#dist-tags)).
4. **`npm ci`**, **lint**, **format check**, **typecheck**, **testes** e **build**.
5. **`npm pack`** — o tarball sobe como artifact `npm-tarball-<tentativa>` (um nome por `run_attempt`, para um re-run completo não colidir com o artifact da primeira tentativa) e o SHA-256 dele vira output do job. Output de job não pode ser reescrito por job posterior, então todo job que baixa o artifact confere o digest antes de usá-lo (`sha256sum --check`). O artifact leva **só o tarball**: o workspace do `build` já rodou `npm ci`, testes e build, e um arquivo dali pode ter sido reescrito por código de dependência — um digest tirado depois disso só atestaria a troca. Os jobs `publish` e `release` rodam `scripts/` de um checkout próprio do `GITHUB_SHA` (`persist-credentials: false`; no `publish`, checkout esparso só de `scripts/release-dist-tag.sh`, sem instalação nenhuma depois) e baixam o artifact em `$RUNNER_TEMP/npm-tarball`, fora do checkout, para ele não sobrescrever nada.
6. **Smoke** (job `smoke`) — instala o tarball em `/tmp/sdk-smoke` com `react@^19 react-dom@^19 react-router@^8` e empacota com esbuild, roda as mesmas asserções em Node cru com o `node-css-loader` publicado, e roda uma suíte Vitest de consumidor (`scripts/smoke-vitest.sh`). Essas instalações resolvem versões flutuantes do registry — por isso moram num job sem permissão de escrita nenhuma.
7. **`npm publish "./<tarball>" --provenance --access public`** (job `publish`) via **Trusted Publishing (OIDC)** — sem `NPM_TOKEN`. Publica **o arquivo** que o `build` empacotou e o `smoke` testou: publish de diretório re-rodaria o `prepublishOnly` (typecheck + lint + a suíte inteira + build) dentro do job com `id-token`, e mandaria um pack novo em vez do testado; publish de tarball não roda script de ciclo de vida nenhum. O `--tag` é escolhido de novo **imediatamente antes** do upload, relendo o `latest` do registry com o mesmo script do guard — o `build` leu minutos antes, e outro release pode tê-lo movido (veja [Dist-tags](#dist-tags)). O npm CLI é instalado em versão exata (`npm install -g npm@12.2.0`), não `@latest`.
8. **Read-back do registry** — confirma que o npm serve `tempest-react-sdk@<versão>` (até 30 minutos, porque o registry processa o upload de forma assíncrona) **e** que o dist-tag dela (`latest`, `next` ou `release-<major>.<minor>`) aponta para ela — com a mesma janela de 30 minutos, porque o dist-tag atrasa tanto quanto a versão. Falha o job caso contrário: publish que aterrissou em outra tag deixaria de parecer verde. A espera do dist-tag só roda quando esta run fez o upload: num re-run o publish é pulado, não aplica tag nenhuma, e a run que publicou já esperou pela dela.
9. **GitHub Release** (job `release`) — `gh release create <tag>` com o tarball do artifact anexado e as notas extraídas da seção do `CHANGELOG.md` (`scripts/changelog.mjs notes <versão> --allow-unreleased`), acrescidas do link para a versão no npm. Antes, confere que a tag ainda resolve para o `GITHUB_SHA` publicado e que o sha512 do tarball é o `dist.integrity` que o npm serve (lido com a mesma janela de 30 minutos); o `gh release create` leva `--verify-tag`, então nunca cria uma tag faltante na HEAD da branch padrão. Se o Release já existe, faz `gh release edit` + `upload --clobber` em vez de falhar — e o `--clobber` só re-sobe os mesmos bytes que o npm serve. Para recuperar uma run que publicou e falhou depois, use **Re-run failed jobs**: os jobs re-rodados herdam os outputs do `build` e baixam o artifact da tentativa que publicou. Um **Re-run all jobs** também roda (o artifact tem nome próprio), mas reempacota — e se o pack novo não for byte a byte o publicado, o job `release` não anexa nada e falha apontando para `make releases-sync` (cria o Release sem asset) ou para anexar à mão o tarball do próprio registry (`npm pack tempest-react-sdk@<versão>`).

!!! note "Por que o npm é fixado em 12.2.0"
    Trusted Publishing exige npm >= 11.5.1, e o Node 22 traz 10.x. Até a 0.76.0 o passo instalava `npm@latest`, e o `latest` mudou de major duas vezes debaixo do job sem ninguém escolher: os logs das runs da v0.74.0 à v0.76.0 mostram o npm 12 (`npm notice run …`, `allowScripts`). A 12.2.0 é a versão que publicou essas três releases. Subir o npm é uma mudança deliberada nessa linha, revisada como qualquer outra.

### Dist-tags

O `latest` é **monotônico**: só anda para a frente. A regra mora num script só, `scripts/release-dist-tag.sh`, chamado em três lugares: pelo guard no job `build`, pelo job `publish` imediatamente antes do `npm publish`, e pelo job `release` para marcar o GitHub Release.

| Versão da tag                                     | Dist-tag                   | Exemplo, com `latest` em `0.77.0` |
| ------------------------------------------------- | -------------------------- | --------------------------------- |
| prerelease (`X.Y.Z-algo`)                         | `next`                     | `v0.78.0-rc.1` → `next`           |
| estável, maior que o `latest` (ou sem `latest`)   | `latest`                   | `v0.78.0` → `latest`              |
| estável, igual ao `latest` (re-run da publicada)  | `latest`                   | `v0.77.0` → `latest`              |
| estável, menor que o `latest`                     | `release-<major>.<minor>`  | `v0.75.1` → `release-0.75`        |

Até a 0.77.0 toda versão estável ia para `latest`, então um backport `v0.75.1` cortado depois da 0.77.0 viraria o default de todo `npm install`. Quem quer a linha antiga instala pelo dist-tag dela: `npm install tempest-react-sdk@release-0.75`. "Igual" só acontece no re-run de uma versão já publicada (o npm não aceita publicar a mesma versão duas vezes), e por isso fica em `latest`.

Como o `latest` é lido:

- **Por `npm view <pacote> dist-tags --json`**, com a chave extraída em Node. Nunca `npm view <pacote> dist-tags.<nome>`: o npm trata o ponto como caminho, e `dist-tags.release-0.75` volta sempre vazio.
- **Só `E404` explícito é pacote novo** (sem `latest`). Resposta vazia com código 0, ou pacote que existe sem `latest`, **reprova a run** — tratar isso como pacote novo mandaria um backport para `latest`. Outras falhas do `npm view` são retentadas 10 vezes, com 15 s entre elas, e depois reprovam.

Duas runs nunca disputam o `latest`: o workflow tem um grupo de `concurrency` único, então releases de tags diferentes entram em fila. E o job `publish` relê o `latest` segundos antes do upload; se ele mudou desde o `build`, o publish usa o dist-tag novo e deixa um `::notice::`.

!!! warning "Fila do GitHub: só um pendente por grupo"
    O GitHub mantém **uma** run pendente por grupo de `concurrency`. Com um release rodando e duas tags enfileiradas, a terceira cancela a segunda enquanto ela ainda espera. A cancelada não publicou nada; dispare de novo com `gh workflow run release-npm.yml --ref vX.Y.Z`.

!!! warning "Backport precisa desta versão do workflow"
    Num tag push, o GitHub roda o `release-npm.yml` **do commit da tag**. Uma tag `v0.75.1` cortada de uma branch que parte da 0.75.0 roda o workflow antigo, que manda tudo para `latest`. A branch de backport precisa ter o `release-npm.yml`, o `scripts/check-release-ref.sh` e o `scripts/release-dist-tag.sh` desta versão em diante (cherry-pick do fix da #472).

!!! note "De onde um backport pode sair"
    Um commit fora da `main` só publica se for ancestral de `origin/release-<major>.<minor>` — a branch de manutenção da linha da própria versão, com o mesmo nome do dist-tag — **e** se o dist-tag escolhido for esse `release-<major>.<minor>`. O `v0.75.1` sai de `release-0.75`, mergeado por PR, com a tag no commit do merge (`make release-tag TAG=0.75.1 BASE_BRANCH=release-0.75`). Uma branch de manutenção nunca publica em `latest` nem em `next`: esses saem só da `main`. Proteja `release-*` como a `main` (PR obrigatório); sem isso, quem empurra na branch publica na linha antiga.

O **GitHub Release** segue o registry: o `gh release create` leva `--latest` quando o `latest` do npm **é** esta versão, e `--latest=false` caso contrário (backport, ou prerelease, que continua com `--prerelease`). O flag vem do registry, não do dist-tag escolhido, então um re-run que cria o Release de uma versão já publicada como `latest` ainda a marca. Release que já existe não tem o flag alterado: o re-run cai no `gh release edit` + `upload --clobber`, sem `--latest`.

!!! info "Por que `release-0.75` e não `v0.75`"
    O npm recusa dist-tag que seja range semver válido, e `v0.75` é um (`>=0.75.0 <0.76.0-0`): `npm publish --tag v0.75` sai com `Tag name must not be a valid SemVer range: v0.75` (medido no npm 12.2.0, o que o job `publish` instala).

O script roda offline: o guard recebe `CURRENT_LATEST` por variável de ambiente (ausente, ele falha em vez de assumir pacote novo), e `test/release-workflow.test.ts` exercita cada linha da tabela num repositório git de fixture e cada resposta do registry com um `npm` falso no `PATH`.

### Environment `npm-release`

O job `publish` roda no environment `npm-release`. Sem configuração, o GitHub o cria vazio e ele não barra nada — o workflow funciona igual. Ele é o gancho para dois controles que moram fora do repositório, e que continuam necessários:

- **Em Settings → Environments → `npm-release`**: _Required reviewers_ (o publish espera aprovação humana, mesmo depois de todos os gates verdes) e _Deployment branches and tags_ restrito a tags `v*`.
- **No Trusted Publisher do npmjs.com**: o campo _Environment_ preenchido com `npm-release`. Daí em diante o npm só aceita a troca OIDC de um job nesse environment — outro workflow ou outro job do mesmo arquivo não publica.

!!! tip "Ligue os dois juntos"
    O revisor obrigatório sem o vínculo no npm deixa um job fora do environment publicar; o vínculo sem o revisor deixa qualquer run do environment publicar sem ninguém olhar.

!!! warning "O guard confere a `main`; quem protege a `main` é o repositório"
    Desde a #472 o `check-release-ref.sh` só aceita tag em commit que já está na `main` (ou, no backport, na `release-<major>.<minor>` da linha). Até a 0.78.0 o `scripts/release.sh` empurrava a tag da branch de release antes do merge, e o guard aceitava: numa fixture, uma `v0.79.0` em commit fora da `main` saía com código 0 e `dist_tag=latest`. O guard vale tanto quanto a proteção da `main`: ele garante "está na `main`", e é a branch protection (PR obrigatório com revisão) que transforma isso em "foi revisado". Ainda ficam com o dono do repositório o revisor obrigatório no environment `npm-release`, uma regra de tag `v*` (_Settings → Rules → Rulesets_) restringindo quem cria a tag, e o campo Environment do Trusted Publisher — configuração do GitHub e do npm.

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
