# CLAUDE.md — tempest-react-sdk

SDK público da Tempest: componentes React, hooks e integrações reutilizáveis,
consumidos por todos os apps frontend Tempest.

Este arquivo é o **índice operacional**: o que vale em toda tarefa. O detalhe
longo mora em `docs/internal/` — **leia a página antes da tarefa
correspondente**, não improvise de memória. Padrões globais (template de PR
PT-BR, conventional commits, workaround do `gh pr edit`) vêm de
`~/.claude/CLAUDE.md` e continuam valendo.

| Antes de                                                                | Leia                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| criar arquivo, módulo, export ou subpath; mexer em barrel; medir bundle | [`docs/internal/architecture.md`](./docs/internal/architecture.md)           |
| escrever código, teste, docstring ou CSS; validar pixel                 | [`docs/internal/conventions.md`](./docs/internal/conventions.md)             |
| abrir PR, mexer em CI ou docs, cortar release                           | [`docs/internal/workflow.md`](./docs/internal/workflow.md)                   |
| propor algo que contraria uma decisão já tomada                         | [`docs/internal/decisions.md`](./docs/internal/decisions.md)                 |
| confiar num número, num gate ou numa frase da doc                       | [`docs/internal/lessons.md`](./docs/internal/lessons.md)                     |
| pegar uma issue                                                         | [`docs/internal/working-on-issues.md`](./docs/internal/working-on-issues.md) |

## As regras que valem sempre

1. **Meça antes de implementar.** Cinco das últimas oito issues estavam erradas
   sobre a própria causa, e em todas o defeito real era maior. Reproduza o número
   da issue antes de aceitar a explicação dela.
2. **Todo número publicado vem com o comando que o produziu** escrito ao lado.
   Número sem método não reproduz e vira folclore.
3. **Mudança que afeta pixel é validada em browser real** antes de ser reportada
   como concluída. Type-check e lint verificam código, não pixel. MCP
   indisponível: diga isso, não afirme que funciona.
4. **Doc bilíngue + CHANGELOG no mesmo commit** da mudança de superfície
   pública, comportamento, install, configuração ou versão.
5. **Aviso na doc é falta de superfície.** Regra de segurança que a doc manda o
   consumidor implementar é código que falta na lib.
6. **Um `git worktree` por tarefa**, de uma base limpa. `git fetch` e conferir a
   `main` antes de começar.
7. **Teste que fixa uma regressão se reescreve, não se apaga.** Quando a decisão
   é revista de propósito, inverta a asserção e escreva o porquê.
8. **Aspas duplas, tipagem total, JSDoc em inglês nos exports públicos, zero
   comentário inline explicativo.** PT-BR no resto da documentação.

## Stack

React 18/19 (peer) + TypeScript 6 · Vite 8 library mode + `vite-plugin-dts` ·
Vitest 4 + Testing Library + jsdom + fake-indexeddb · ESLint 10 +
typescript-eslint 8 + Prettier 3 · Husky 9 + lint-staged.

Peers obrigatórios: `react`, `react-dom` (`^18 || ^19`), `react-router`
(`^7 || ^8`) — os três carregam contexto React. Deps diretas:
`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`,
`lucide-react`, `fflate`. Peers opcionais por módulo: `recharts` (`/charts`),
`@tiptap/*` (`/editor`), `leaflet` (`geo`), `onnxruntime-web` (`/vision`,
`/tabular`), `vite` + `@vitejs/plugin-react` (`/vite`).

## Mapa do repositório

```text
src/            40 módulos de domínio (access, auth, br, components, forms, http,
                icons, offline, query, styles, theme, vision, webrtc, ws, …)
bin/            CLIs: create-tempest-app (scaffold) e tempest (doctor/lint/fix/gen)
loader/         loader de .css para Node cru, publicado como /node-css-loader
template/       scaffold Vite+React+TS · template-pwa/ o mesmo com service worker
docs/           site MkDocs bilíngue (publicado) + docs/internal/ (estas regras)
examples/gallery  app Vite real que consome o SDK via file:../..
test/           guards de superfície, docs, âncoras, paridade e scaffold
e2e/            Playwright sobre a gallery + baseline do axe
scripts/        release, changelog, gen-llms, docs-gallery, link-component-css, vendor
```

Fluxo de um componente: `src/components/<Nome>/` com `index.ts`, `<Nome>.tsx`,
`<Nome>.module.css` e `<Nome>.test.tsx` → re-export em
`src/components/index.ts` → doc em `docs/components/<grupo>.md` **e** `.en.md` →
seção na gallery (ou isenção escrita em `scripts/docs-gallery.mjs`).

## Gates que precisam passar

`npm run lint` · `npm run typecheck` · `npm run test:run` ·
`npm run format:check` · `npm run build` · `npx size-limit` ·
`npm run docs:gallery -- --check`.

Além deles, cinco guards que reprovam o que o compilador não vê:
`test/public-surface.test.ts` (todo export de runtime está documentado),
`test/docs-guard.test.ts` (mirror `.en.md`, entrada no `nav`, e **todo exemplo de
código compila**), `test/docs-anchors.test.ts` (âncora interna viva),
`test/docs-counts.test.ts` (**toda contagem escrita em prosa bate com o repo**) e
`scripts/check-dist-guards.mjs` (rodado no `postbuild`).

## Armadilhas que mais custam

Detalhe e medição em [`lessons.md`](./docs/internal/lessons.md); estas são as que
mais voltam:

- **Toque não dispara `contextmenu`** — medido em Chrome com emulação de Pixel 7
  e iPhone 13.
- **`getBoundingClientRect` devolve a caixa transformada**; para geometria de
  layout use `offsetWidth`/`offsetHeight`.
- **`Portal` monta num efeito**: um `useLayoutEffect` disparado pela abertura lê
  um ref vazio. Use callback ref em estado.
- **`axe` no jsdom desliga `color-contrast`** — contraste só se verifica em
  browser real, com `transition` desligada.
- **`size-limit` importa por caminho**, então não lê `sideEffects`: um número
  implausível se confere num app instalado, não mexendo no limite.
- **`vite preview` e `node_modules/.vite` servem CSS velho** — limpe, rebuilde e
  reinicie antes de concluir que a mudança de CSS não funcionou.
- **`[Unreleased]` conflita N-1 vezes** quando N PRs o tocam: é concatenação, o
  que está na `main` primeiro.

## Estado atual (snapshot pós-v0.64.0 — `[Unreleased]` abre o ciclo 0.65.0)

- **npm**: <https://www.npmjs.com/package/tempest-react-sdk> — 84 tags publicadas
  (0.1.0 → 0.64.0) com provenance assinada via OIDC. Histórico em `RELEASES.md`
  (gerado por `make releases-md`) e `CHANGELOG.md` — **não duplicar aqui**.
- **Superfície**: 40 módulos em `src/` (`ls -d src/*/`), 129 componentes
  (`ls -d src/components/*/`), 54 hooks `useX` no barrel de `hooks/`, 18 subpaths
  — os quatro aferidos por `test/docs-counts.test.ts`. Exports de runtime na
  raiz: **567 em 12/09/2026** (70 em `/br`, 21 em `/icons`); o método de
  contagem, e por que o `--import` não é opcional, está em
  [`architecture.md`](./docs/internal/architecture.md).
- **Testes**: 6262 em 575 arquivos, ~50 s, medido em 12/09/2026. Cobertura em
  05/09/2026: 99,73% linhas / 98,81% statements / 99,82% funções / 95,64%
  branches; pisos do CI em 99/98/99/95.
- **Empacotamento**: `dist/` com `preserveModules`; CSS por componente carregado
  pelo próprio componente (0.63.0); loader `/node-css-loader` para Node cru.
  Budgets do `size-limit` são por **fatia importada**.
- **Docs**: 97 páginas base (194 com as traduções `.en.md`) + `llms.txt` /
  `llms-full.txt`. Site MkDocs bilíngue no GitHub Pages; `docs/internal/` fica
  fora dele.
- **Demo vivo**: `examples/gallery`, app Vite com 66 seções consumindo o SDK via
  `file:../..`.

Os números acima envelhecem — quando divergirem do repo, o repo está certo e esta
seção está velha.

## Backlog

**Nas issues do GitHub**, não aqui: `gh issue list`. O que já saiu está no
`CHANGELOG.md`. Como uma issue é trabalhada — e por que ela costuma estar errada
sobre a própria causa — está em
[`working-on-issues.md`](./docs/internal/working-on-issues.md).

## Comandos chave

```bash
npm run dev            # vite build --watch
npm run test:run       # suíte inteira (~50 s)
npm run typecheck      # tsc -b --noEmit, cobre os testes
npm run lint
npm run format         # prettier --write .
npm run build          # ESM + CJS + d.ts + styles + guards de dist

npm run docs:llms                 # regenera llms.txt + llms-full.txt
npm run docs:gallery -- --check   # guard das capturas por seção
npx size-limit                    # budgets por fatia importada

make validate                     # sanidade completa, sem release
make release TAG=0.64.0           # branch + bump + validate + tag + push + PR
make releases-check               # audita tag ↔ npm ↔ GitHub Release
```

Gallery: `cd examples/gallery && npm install && npm run dev`.

## Como retomar

1. `git fetch`, ler o último commit da `main` e o `CHANGELOG.md`.
2. `npm install && npm run build && npm run test:run` — sanidade.
3. `gh issue list` — próxima frente.
