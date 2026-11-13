# Release pipeline

Como o `tempest-react-sdk` é publicado no npm e como o site de docs vai ao ar — tudo na máquina de quem mantém o pacote, sem GitHub Actions.

!!! info "Por que não tem mais workflow"
    Desde 13/11/2026 a regra do dono é: GitHub Actions só em repositório da org `7rc`. Este repositório está fora dela, então o custo no GitHub é zero — nenhum workflow, nenhum `gh run rerun`, nenhum `gh workflow run`. O `release-npm.yml` e o `docs.yml` foram **apagados**, não só desligados: workflow desligado volta com um clique, e os testes que fixavam o hardening deles continuariam atestando código que nunca roda. A última versão dos dois está no commit `2df6e4b`. O que eles faziam virou dois alvos do `Makefile`: `make release-tag` e `make docs-deploy`.

## Visão geral

```text
  make release TAG=X.Y.Z
  ┌──────────────────────────────┐
  │ scripts/release.sh           │
  │  1. branch release/vTAG      │
  │  2. npm version TAG          │
  │  3. fecha o CHANGELOG        │
  │  4. RELEASES.md + commit     │
  │  5. make check               │
  │  6. push da branch + PR      │
  └──────────────────────────────┘
       │ revisão + merge do PR na main
       ▼
  make release-tag TAG=X.Y.Z
  ┌──────────────────────────────────────────────────────┐
  │ scripts/release-tag.sh                               │
  │  1. working tree limpo, npm whoami, gh auth status   │
  │  2. acha o commit do merge na main                   │
  │  3. RELEASES.md tem a linha? a tag já existe?        │
  │  4. guard de ref + dist-tag (cópias de origin/main)  │
  │  5. worktree descartável do commit:                  │
  │     scripts/release-pack.sh (npm ci, lint, format,   │
  │     typecheck, testes, build, npm pack, 3 smokes)    │
  │  6. relê o latest, npm publish <tarball> --tag …     │
  │  7. read-back: registry serve versão e dist-tag?     │
  │  8. push da tag                                      │
  │  9. gh release create --verify-tag (+ tarball)       │
  └──────────────────────────────────────────────────────┘
```

**As três superfícies andam juntas**: a git tag, a versão no npm e o GitHub Release. Os passos irreversíveis — publish, push da tag, Release — vêm por último, então uma recusa nunca deixa meio release para trás. Uma run que parou no meio (o registry demorou, a rede caiu) se retoma rodando o mesmo comando de novo.

## Comandos

O release é **dois passos**, com a revisão do PR no meio:

```bash
make release TAG=0.1.5       # 1. abre o PR de release (não taggeia, não publica)
# ... revisão e merge do PR na main ...
make release-tag TAG=0.1.5   # 2. build + smokes + npm publish + tag + GitHub Release
```

### `make release TAG=0.1.5`

Abre o PR de release: branch `release/v0.1.5`, bump, `[Unreleased]` fechado em `[0.1.5]`, `RELEASES.md` regenerado, `make check`, push da branch e PR via `gh`. **Não cria nem empurra tag** e não publica nada. Requer working tree limpo + tag inexistente local/remoto.

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

Roda **depois do merge** do PR de release, de qualquer checkout limpo do repositório: o build acontece num `git worktree` descartável do commit publicado, então o seu checkout não é tocado. Precisa de `npm login` (é a **sua** credencial npm que publica) e de `gh auth login` (é o `gh` que cria o Release). Sem login no npm, o script para antes de buildar qualquer coisa.

1. **Credenciais e árvore.** `npm whoami` e `gh auth status`; working tree limpo.
2. **O commit.** O **primeiro** da história first-parent de `origin/main` cujo `package.json` está em `0.1.5`: o merge (ou o squash) do PR de release. Um PR mergeado depois dele, ainda na mesma versão, fica de fora — está no `[Unreleased]` e não pode ir para o npm sob uma versão que não o documenta.
3. **Conferências.** A linha `| v0.1.5 |` no `RELEASES.md` desse commit. Tag já existente — local ou no origin — precisa apontar para esse mesmo commit: no mesmo commit é **retomada**; em outro, recusa.
4. **Guard de ref** (`scripts/check-release-ref.sh`) e regra do dist-tag (`scripts/release-dist-tag.sh`), **copiados de `origin/main`** (veja [Quem decide quem publica](#quem-decide-quem-publica)), contra o `latest` que o registry serve agora (`npm view`, só leitura). O guard recusa versão que não bate com o `package.json` do commit, commit fora da `main` (#472) e backport de linha não aberta (#527) — antes de qualquer instalação.
5. **Build e smokes** (`scripts/release-pack.sh` do commit, no worktree descartável): `npm ci`, lint, format, typecheck, a suíte, build, `npm pack` e os três smokes do tarball — bundler + Node cru com o `node-css-loader` (`scripts/smoke-bundle.sh`), Vitest de consumidor (`scripts/smoke-vitest.sh`) e o bin `tempest` (`scripts/smoke-cli.sh`). A suíte roda de novo porque o commit do merge é outra árvore quando a `main` andou durante a revisão.
6. **Publish.** O `latest` é relido e o dist-tag escolhido de novo segundos antes do upload; depois `npm publish <tarball> --access public --tag <dist-tag>` publica **o arquivo** que os smokes exercitaram, não um pack novo — publish de tarball não roda script de ciclo de vida nenhum. Versão que o registry já serve não é publicada de novo (retomada). Com 2FA no npm, o `npm publish` pede o código.
7. **Read-back.** O registry serve `tempest-react-sdk@0.1.5`, e o dist-tag dela aponta para ela. A janela é de 30 minutos (`RELEASE_READBACK_ATTEMPTS=120` × `RELEASE_READBACK_SECONDS=15`): o npm processa o upload de forma assíncrona, e a v0.76.0 levou 18 minutos para aparecer. Se a janela acabar, a tag **não** é empurrada; rode o mesmo comando quando a versão aparecer.
8. **Push da tag** `v0.1.5` no commit publicado.
9. **GitHub Release.** Confere que a tag no GitHub resolve para o commit publicado e cria o Release com `gh release create --verify-tag` (chamada de API; GitHub Actions não entra), notas da seção do `CHANGELOG.md` e o tarball anexado **só** quando o sha512 dele é o `dist.integrity` que o npm serve. Release existente vira `gh release edit` + `upload --clobber`, sem mexer na marca _Latest_.

Variáveis:

- `DRY_RUN=1` roda os passos 1 a 5 e um `npm publish --dry-run`; não cria tag, não publica, não cria Release, e não exige login.
- `REF=<sha>` publica um commit específico, para quando a `main` já andou para outra versão. Ele precisa estar na `main` e ter a versão certa.
- `BASE_BRANCH=release-0.75` e `BACKPORT_LINES=release-0.75` publicam um backport (veja [Dist-tags](#dist-tags)).

!!! warning "Sem provenance"
    Provenance (o selo _Verified provenance_ do npm) exige a identidade OIDC de um runner de CI, que não existe na máquina local. As versões até a v0.82.0 saíram com provenance; as publicadas pelo `make release-tag` saem sem. A procedência agora se confere pelo GitHub Release: ele aponta para o commit da tag e anexa o tarball cujo sha512 é o `dist.integrity` do npm.

### `make release TAG=0.1.5 SKIP_VALIDATE=1`

Pula o `make check` local — o único lugar onde budgets, cobertura e o e2e da gallery rodam. O `make release-tag` ainda roda lint, format, typecheck, testes, build e os smokes antes de publicar, mas não o `size-limit` nem o e2e. Use apenas em emergências.

### `make validate`

Subconjunto rápido do `make check`, sem release.

### `make publish`

**Recusa e sai com código 1** (#532). Um `npm publish` solto pula o guard de ref, a conferência com a `main`, os smokes do tarball, o read-back e o GitHub Release. Publicar é só pelo `make release-tag`. `make publish-dry` continua: roda `npm publish --dry-run` e não publica nada.

### `make docs-deploy`

Publica o site MkDocs no GitHub Pages, da máquina local (`scripts/docs-deploy.sh`):

1. busca `origin/main` e abre um worktree descartável dela — o site é sempre o da `main`, nunca o do seu checkout;
2. cria um venv descartável com `uv` e instala `docs/requirements.txt` com `--require-hashes` (#532): versão e hash de toda dependência fixados;
3. `node scripts/gen-llms.mjs` e `mkdocs build --strict`;
4. confere que as duas línguas saíram (`index.html` e `en/index.html`);
5. empurra **esse** diretório para a branch `gh-pages` com o `ghp-import` do mesmo venv. Não é `mkdocs gh-deploy`, que buildaria uma segunda vez;
6. lê a configuração do Pages (`gh api`, só leitura) e avisa se ela ainda não serve a `gh-pages`.

`DRY_RUN=1 make docs-deploy` para depois do passo 4. Medido em 13/11/2026: o build com dry-run leva ~13 s com o cache do `uv` quente e gera as páginas das duas línguas (`time DRY_RUN=1 make docs-deploy`).

Mudança docs-only continua sendo commit `docs:` direto na `main`; o site muda quando alguém roda `make docs-deploy`, não no push.

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

!!! info "Notas de um backfill nunca herdam `[Unreleased]`"
    O `scripts/changelog.mjs notes <versão>` só cai no bloco `[Unreleased]` quando recebe `--allow-unreleased` (o que o `make release-tag` faz, para o caso de um release cortado antes de datar a seção). No backfill a flag **não** é passada — assim uma tag antiga nunca recebe as notas do ciclo seguinte.

## Dist-tags

O `latest` é **monotônico**: só anda para a frente. A regra mora num script só, `scripts/release-dist-tag.sh`, chamado pelo guard, logo antes do `npm publish` e na hora de marcar o GitHub Release.

| Versão                                            | Dist-tag                   | Exemplo, com `latest` em `0.77.0` |
| ------------------------------------------------- | -------------------------- | --------------------------------- |
| prerelease (`X.Y.Z-algo`)                         | `next`                     | `v0.78.0-rc.1` → `next`           |
| estável, maior que o `latest` (ou sem `latest`)   | `latest`                   | `v0.78.0` → `latest`              |
| estável, igual ao `latest` (retomada)             | `latest`                   | `v0.77.0` → `latest`              |
| estável, menor que o `latest`                     | `release-<major>.<minor>`  | `v0.75.1` → `release-0.75`        |

Quem quer a linha antiga instala pelo dist-tag dela: `npm install tempest-react-sdk@release-0.75`.

Como o `latest` é lido:

- **Por `npm view <pacote> dist-tags --json`**, com a chave extraída em Node. Nunca `npm view <pacote> dist-tags.<nome>`: o npm trata o ponto como caminho, e `dist-tags.release-0.75` volta sempre vazio.
- **Só `E404` explícito é pacote novo** (sem `latest`). Resposta vazia com código 0, ou pacote que existe sem `latest`, **reprova** — tratar isso como pacote novo mandaria um backport para `latest`. Outras falhas do `npm view` são retentadas 10 vezes, com 15 s entre elas.

!!! info "Por que `release-0.75` e não `v0.75`"
    O npm recusa dist-tag que seja range semver válido, e `v0.75` é um (`>=0.75.0 <0.76.0-0`): `npm publish --tag v0.75` sai com `Tag name must not be a valid SemVer range: v0.75` (medido no npm 12.2.0).

!!! note "De onde um backport pode sair"
    Um commit fora da `main` só publica se for ancestral de `origin/release-<major>.<minor>` — a branch de manutenção da linha da própria versão —, se o dist-tag escolhido for esse `release-<major>.<minor>` **e** se a linha estiver aberta **nesta run** (#527): `make release-tag TAG=0.75.1 BASE_BRANCH=release-0.75 BACKPORT_LINES=release-0.75`. Criar a branch não abre a linha. Uma branch de manutenção nunca publica em `latest` nem em `next`: esses saem só da `main`.

O **GitHub Release** segue o registry: `--latest` quando o `latest` do npm **é** esta versão, `--latest=false` caso contrário (backport, ou prerelease, que leva `--prerelease`).

`test/release-workflow.test.ts` exercita tudo isto numa fixture: um `origin` bare local, um `npm` e um `gh` falsos no `PATH` e um `release-pack.sh` de mentira no commit — sem rede e sem registry.

## Quem decide quem publica

Até a v0.82.0, empurrar uma tag `v*` disparava o publish, e a pergunta das issues #472 e #527 era "quem pode empurrar tag publica?" — a resposta dependia de environment, Trusted Publisher e rulesets do GitHub. **Desde que o publish saiu do GitHub Actions, uma tag não publica nada.** Publicar exige a credencial npm de um mantenedor do pacote, na máquina de quem roda o `make release-tag`.

O guard de ref continua barrando **engano**: commit fora da `main`, versão que não bate, backport de linha não aberta. Ele roda da cópia que está em `origin/main`, não da do commit publicado (#527): numa fixture, um commit que reescrevia o próprio `check-release-ref.sh` para aprovar tudo é recusado. Mas ele não é fronteira de autorização — quem tem a credencial npm pode rodar `npm publish` à mão. A fronteira é a conta npm.

### Checklist do dono do repositório

Estado lido em 13/11/2026, só leitura (`gh api repos/mauriciobenjamin700/tempest-react-sdk/pages`, `…/environments`, `…/actions/secrets`, `…/actions/permissions`). Nada disto se configura pelo repositório:

| # | Onde | O que fazer | Estado em 13/11/2026 |
| - | ---- | ----------- | -------------------- |
| 1 | _Settings → Pages → Source_ | **Deploy from a branch → `gh-pages` / (root)**, depois do primeiro `make docs-deploy` (a branch precisa existir antes). Ou: `gh api -X PUT repos/mauriciobenjamin700/tempest-react-sdk/pages -f build_type=legacy -f 'source[branch]=gh-pages' -f 'source[path]=/'` | `build_type: workflow` — o site publicado está parado na última run do `docs.yml` |
| 2 | npmjs.com → conta | 2FA no modo _Authorization and writes_: o `npm publish` pede o código, e um token de sessão vazado sozinho não publica | não observável daqui |
| 3 | npmjs.com → `tempest-react-sdk` → _Settings → Trusted Publisher_ | **remover** a entrada que aponta para `release-npm.yml`: nenhum workflow publica mais, e ela só serve para reabrir um caminho de publish via Actions | configurada desde a 0.7.0 |
| 4 | _Settings → Secrets and variables → Actions_ e _Environments_ | apagar o secret `NPM_TOKEN`, os environments `NPM_TOKEN`, `npm-release` e `github-pages`, a variável `RELEASE_BACKPORT_LINES` se existir, e revogar o token no npmjs.com | **existem** o secret `NPM_TOKEN` e os três environments |
| 5 | _Settings → Actions → General_ | **Disable actions**: a regra passa a valer no GitHub, não só por convenção | `enabled: true`, `allowed_actions: all` |
| 6 | _Settings → Rules → Rulesets_, alvo `main` e `release-*` | PR obrigatório, bloquear _force push_ e _deletion_ — é o que faz "está na `main`" significar "foi revisado" | `main` sem proteção |

!!! warning "A máquina do mantenedor agora é o perímetro"
    Sem runner, não há separação entre o código que instala dependências e a credencial que publica: o `npm ci` do `make check` e do `make release-tag` roda na mesma máquina onde o `npm login` guardou o token. Prefira o login de sessão (`npm login`) a um token de automação de vida longa no `~/.npmrc`, e deixe o 2FA pedir o código no publish (item 2).

## Histórico

Veja [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) (auto-gerado via `make releases-md`) e [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) (escrito à mão antes de cada release).

## Veja também

- [`Makefile`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/Makefile) — definição dos alvos
- [`scripts/release.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release.sh) — abre o PR de release
- [`scripts/release-tag.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release-tag.sh) — publica
- [`scripts/docs-deploy.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/docs-deploy.sh) — site na `gh-pages`
