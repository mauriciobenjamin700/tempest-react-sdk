# Fluxo: comandos, docs, PR, CI e release

Leia antes de abrir PR, mexer em CI ou documentação, e antes de cortar release.

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
make release TAG=0.64.0            # branch + bump + validate + tag + push + PR
make release TAG=0.64.0 DRY_RUN=1  # local, sem push
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

Cinco workflows: `ci.yml` (PR: format + lint + typecheck + test + build, node
22/24), `size-limit.yml`, `e2e.yml` (gallery + axe), `docs.yml` (Pages) e
`release-npm.yml` (tag push → guard de versão + smoke + publish OIDC + read-back
do registry + GitHub Release).

O smoke do release empacota o tarball **com esbuild** e roda o resultado — que é
o caminho de todo consumidor — e depois roda as mesmas asserções em Node cru com
o loader publicado. Os dois guards antigos continuam medidos: peer faltando faz o
esbuild sair 1, export faltando faz o `node` sair 1.

## Release

Pipeline **tag-push**, sem Changesets. Três superfícies ficam sincronizadas: a
tag git, a versão no npm e o GitHub Release.

Antes de taggear:

- [ ] `CHANGELOG.md` com entrada `## [X.Y.Z] — YYYY-MM-DD` cobrindo toda mudança
      pública, com os números medidos.
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
`docs:` direto na `main`.
