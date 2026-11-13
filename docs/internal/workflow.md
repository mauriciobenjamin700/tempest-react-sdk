# Fluxo: comandos, docs, PR, CI e release

Leia antes de abrir PR, mexer em release ou documentação, e antes de cortar release.

## Comandos

```bash
npm run dev            # vite build --watch
npm test               # vitest watch
npm run test:run       # vitest run (suíte inteira, ~50 s)
npm run test:coverage
npm run typecheck      # tsc -b --noEmit (cobre os testes)
npm run lint
npm run format         # prettier --write .
npm run build          # ESM + CJS + d.ts + styles + guards de dist

npm run docs:llms      # regenera llms.txt + llms-full.txt
npm run docs:gallery -- --check   # guard das capturas por seção
npx size-limit         # budgets por fatia importada

make validate          # sanidade completa, sem release
make release TAG=0.64.0            # branch + bump + validate + push + PR (sem tag)
make release TAG=0.64.0 DRY_RUN=1  # local, sem push
make release-tag TAG=0.64.0        # depois do merge: build + smokes + npm publish + tag + Release
make docs-deploy                   # site da main na gh-pages (DRY_RUN=1 só builda)
make releases-check                # audita tag ↔ npm ↔ GitHub Release
```

Gallery: `cd examples/gallery && npm install && npm run dev`.

## Documentação

O site MkDocs em `docs/` é **bilíngue e obrigatório**: toda página PT tem mirror
`.en.md`, e **toda página está no `nav`** — é o que `test/docs-guard.test.ts`
afere. `docs/internal/` (esta pasta) é a exceção declarada: fica fora do build e
fora dos guards.

- Mudança de superfície pública, comportamento, install, configuração ou versão
  atualiza `README.md` + site **no mesmo commit**.
- Exemplo de código na doc **compila** contra o SDK (guard `docs examples`) —
  escreva exemplo completo, não fragmento.
- Todo export de runtime da raiz aparece na doc (`test/public-surface.test.ts`).
- Componente novo mapeia para uma seção da gallery, ou entra na lista de isentos
  de `scripts/docs-gallery.mjs` **com o motivo escrito**.
- `test/docs-anchors.test.ts` guarda toda âncora interna — vale mais que o
  `mkdocs build --strict`, que reporta âncora morta só como `INFO`.

## PR

Título com prefixo de conventional commit; corpo no template PT-BR global
(tabela `Tem Script? | Novas Env Vars`, bloco `NOTA`, Problema, Solução,
Screenshots, Outras mudanças, Notas sobre deploy + as três listas finais).

- **Keyword de fechamento é só em inglês**: `Closes #148` em linha própria.
  `Fecha #148` é prosa — a issue fica aberta.
- Um `git worktree` por tarefa, sempre. Árvore compartilhada deixa um agente
  trocar `HEAD` no meio da execução de outro.
- **`[Unreleased]` conflita N-1 vezes** quando N PRs o tocam. É concatenação, não
  escolha de lado: o que já está na `main` primeiro, a entrada do branch depois.
  Merjar primeiro o PR com o maior diff de dado evita rebasear megabytes.
- Em repo com Projects (classic), `gh pr edit` aborta com erro de GraphQL. Use
  `gh api -X PATCH /repos/<owner>/<repo>/pulls/<n> -F body=@arquivo.md`.

## CI

**Não existe CI** (decisão de 13/11/2026). Regra global do dono: GitHub Actions só
em repositório da org `7rc` — a conta foi travada por cobrança em 09/11/2026 e o
release parou. `docs.yml` e `release-npm.yml` foram **apagados** (não só
desligados: workflow desligado volta com um clique, e os testes de hardening deles
atestariam código que não roda). A última versão dos dois está em `2df6e4b`. Nada de
`gh run rerun`, `gh workflow run` nem workflow novo; `test/ci-policy.test.ts`
reprova `.github/workflows/` com qualquer arquivo e script que chame
`gh run rerun`/`gh workflow run|enable`.

Os testes já tinham saído da CI em 26/10/2026 (`ci.yml`, `size-limit.yml`,
`e2e.yml`: cada PR esperava 8–12 min por checks que nenhuma branch protection
exigia). O que eles rodavam é o `make check` (`scripts/check.sh`) — ~6 min medido em
26/10/2026, dos quais 169 s são o e2e e 89 s a suíte com cobertura. É o gate de merge
e o último passo do `make release` antes do push. A matriz de node vira
`make test-matrix`. Desde 13/11/2026 o `make check` também roda o smoke de bundler +
Node cru (`scripts/smoke-bundle.sh`), que antes só existia no workflow de release.

**Publicar é `make release-tag`, na máquina do mantenedor** (`scripts/release-tag.sh`).
Ordem: credenciais (`npm whoami` — sem login para antes de buildar —, `gh auth
status`), working tree limpo, commit do merge na `main`, linha no `RELEASES.md`, tag
existente só no mesmo commit (retomada), guard de ref + dist-tag **copiados de
`origin/main`** (#527) contra o `latest` do registry, `scripts/release-pack.sh` do
commit num `git worktree` descartável (npm ci, lint, format, typecheck, testes,
build, pack, três smokes), re-pick do dist-tag, `npm publish <tarball>` (o arquivo
smokado; sem `--provenance`, que exige OIDC de CI), read-back de versão e dist-tag
(30 min), push da tag, `gh release create --verify-tag` com o tarball só se o sha512
bate com o `dist.integrity` do npm. Rodar de novo retoma uma run que parou no meio.
`test/release-workflow.test.ts` exercita isso numa fixture com `origin` bare, `npm` e
`gh` falsos no `PATH` e um `release-pack.sh` stub no commit.

O guard (`scripts/check-release-ref.sh`) lê `RELEASE_TAG`/`RELEASE_SHA`,
`CURRENT_LATEST` e `BACKPORT_LINES` e escreve `key=value` na stdout. Recusa versão que
não bate com o `package.json` **do commit** (`git show`), tag local em outro commit,
commit que não é ancestral de `origin/main` (#472; backport só de
`origin/release-<maj>.<min>`, só para esse dist-tag e só com a linha em
`BACKPORT_LINES` na linha de comando, #527), e falha fechado sem `origin/main`. O
dist-tag é monotônico (#472), regra única em `scripts/release-dist-tag.sh` (`pick`,
`current-latest`, `get`): `latest` para versão maior ou igual, prerelease `next`,
menor `release-<maj>.<min>` — `v0.75` não serve, o npm recusa dist-tag que é range
semver. Dist-tag se lê de `npm view <pkg> dist-tags --json`; só `E404` é pacote
novo.

**O guard barra engano, não ator.** Desde que o publish saiu do Actions, empurrar tag
não publica nada: publicar exige a credencial npm de um mantenedor. A fronteira é a
conta npm (2FA em _auth-and-writes_), e o perímetro é a máquina de quem publica —
sem runner, o `npm ci` roda ao lado do token. O checklist do dono (Pages para a
`gh-pages`, remover Trusted Publisher e `NPM_TOKEN`, desligar Actions no repo) está em
`docs/release.md`.

**Docs: `make docs-deploy`** (`scripts/docs-deploy.sh`): worktree descartável de
`origin/main`, venv descartável com `uv` + `docs/requirements.txt`
`--require-hashes` (gerado com hash, cooldown de 14 dias; o comando está no
cabeçalho), `gen-llms` + `mkdocs build --strict`, confere as duas línguas e empurra
esse build para a `gh-pages` com `ghp-import`. `DRY_RUN=1` só builda. O Pages ainda
estava em `build_type: workflow` em 13/11/2026: trocar a fonte para a `gh-pages` é
ação do dono, depois do primeiro deploy.

O `make publish` recusa: `npm publish` solto pula guard, smokes, read-back e Release.

## Release

Pipeline local, sem Changesets nem CI. Três superfícies ficam sincronizadas: a
tag git, a versão no npm e o GitHub Release.

O release é **dois comandos**, com a revisão do PR no meio (#472):

1. `make release TAG=X.Y.Z` — branch `release/vX.Y.Z`, bump, `[Unreleased]`
   fechado, `RELEASES.md`, validação, push da branch, PR. **Não taggeia.**
2. Revisão e merge do PR na `main`.
3. `make release-tag TAG=X.Y.Z` — busca `origin/main`, escolhe o **primeiro**
   commit first-parent com a versão (o merge do PR; PR mergeado depois fica de
   fora), confere a linha no `RELEASES.md`, builda e smoka esse commit, publica no
   npm com a sua credencial, empurra a tag e cria o GitHub Release. `DRY_RUN=1`
   roda tudo até um `npm publish --dry-run`; `REF=<sha>` quando a `main` já andou
   de versão.
4. `make docs-deploy` quando o site precisa refletir a release.

A ordem dentro do `scripts/release.sh` importa, e custou duas tentativas: o bump e
o fechamento do `[Unreleased]` vêm primeiro, depois o commit, **o `RELEASES.md`**,
e só então a validação. Invertido, `test/docs-counts.test.ts` reprova todo release
novo, porque a versão que acabou de ganhar seção no CHANGELOG ainda não aparece no
`RELEASES.md`. Ovo e galinha, não defeito do guard. `make releases-md` lê as git
tags, então o script cria uma tag local **provisória** só para esse comando e a
apaga logo depois — a tag de verdade nasce no merge commit. A coluna Commit da
linha nova aponta para o `chore: release` da branch; o próximo `releases-md` a
reescreve.

**A árvore que a tag aponta é a única que o publish builda e testa** — validar a
branch não substitui isso. Na v0.65.0 a tag apontava para o commit anterior ao
refresh do `RELEASES.md` e o "Run tests" do antigo `release-npm.yml` reprovou; com a
tag no merge commit, a árvore taggeada é a do PR mergeado, `RELEASES.md` incluído, e
o `release-tag.sh` recusa commit sem a linha da versão.

A terceira coisa que o pipeline não faz por você: **o snapshot do `CLAUDE.md`
entra no commit de release**, não depois. `test/docs-counts.test.ts` afere a
contagem de tags escrita em prosa contra as linhas do `RELEASES.md`, e o
`RELEASES.md` ganha a linha nova junto com a tag — então a contagem escrita lá
vira falsa no instante em que a tag existe, e a suíte do `make release-tag` reprova. Atualize
tags, exports de runtime e a linha de testes antes de taggear.

(E não escreva o número de exemplo aqui: o guard varre **esta** página também, e
uma frase explicando o problema com um número literal dentro reprova o release
que ela tenta evitar. Aconteceu.)

Antes do `make release` (tudo isto entra no PR, e o PR mergeado é a árvore taggeada):

- [ ] `CHANGELOG.md` com entrada `## [X.Y.Z] — YYYY-MM-DD` cobrindo toda mudança
      pública, com os números medidos.
- [ ] snapshot do `CLAUDE.md` atualizado: tags publicadas, exports de runtime,
      contagem de testes.
- [ ] `docs/` reflete a superfície nova; `mkdocs build --strict` limpo.
- [ ] snippets de install referenciam a versão nova onde aplicável.
- [ ] `npx size-limit` sem estouro.

Depois do push, valide o **artefato publicado**, não a árvore local: venv/dir
limpo, instale a versão exata, exercite a superfície nova.

**Run vermelho de release cuja causa não está escrita vale zero na próxima
tentativa.** Apagar a tag é a limpeza, não a conclusão — a conclusão é a linha no
CHANGELOG.

Mudança **docs-only** (`docs/`, `README.md`, redação de docstring sem delta de
assinatura) não bumpa versão, não entra no CHANGELOG e não ganha tag: commit
`docs:` direto na `main`, e `make docs-deploy` para o site refletir.
