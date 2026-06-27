# Roadmap — tempest-react-sdk

> Snapshot: 2026-06-23 · Última versão **publicada no npm: `0.5.1`** · `package.json`: `0.6.1` (não publicada) · branch de trabalho: `feat/app-foundation`.

Backlog operacional vive aqui. `CLAUDE.md` mantém só as decisões consolidadas e o guia de contribuição.

---

## ✅ Pronto, aguardando publish (sairá como `0.7.0`)

Tudo abaixo está commitado e validado (typecheck · lint 0 erros · 998 testes · build · `mkdocs --strict`), mas **não foi ao npm** — ver bloqueio.

- **App foundation** — `src/router/` (React Router v7 declarativo: `defineRoutes`, `<AppRouter>`, `<RouteGuard>` + re-exports), `src/store/` (`createStore`, `createSelectors`), `src/app/` (`<AppProviders>`), `src/vite/` (subpath `tempest-react-sdk/vite` → `createViteConfig`). `react-router-dom@7` virou dep direta; `vite`/`@vitejs/plugin-react` peers opcionais. Validado rodando no browser (app local).
- **CLI `create-tempest-app`** — embarcada como `bin` do pacote (+ `template/` no tarball). `npx -p tempest-react-sdk create-tempest-app my-app` (projeto novo) ou `npx create-tempest-app .` (merge no dir atual). Carimba a versão do SDK no app gerado.
- **Utils genéricos** — arrays (`groupBy`/`uniqueBy`/`chunk`/`range`), objects (`pick`/`omit`/`deepMerge`/`isEmpty`), guards (`isDefined`/`isString`/`isNumber`/`isPlainObject`/`assertNever`), functions (`debounce`/`throttle`/`once`/`memoizeOne`), promises (`sleep`/`withTimeout`), `randomId`, strings (`capitalize`/`camelCase`/`kebabCase`/`pluralize`), numbers (`formatBytes`/`formatCompactNumber`).
- **Componentes genéricos** (13) — `CopyButton`, `RelativeTime`, `Money`, `TruncateText`, `VisuallyHidden`, `Portal`, `ClickOutside`, `ConditionalWrapper`, `For`, `ErrorText`, `Image`, `DataList`, `DescriptionList`.
- **Componentes shadcn-parity** (14) — `Toggle`, `ToggleGroup`, `Label`, `Collapsible`, `ContextMenu`, `HoverCard`, `Command`, `ScrollArea`, `Resizable`, `Calendar`, `NavigationMenu`, `Menubar`, `Carousel`, `DataTable`.
- **Docs** — páginas bilíngues novas: routing, state, app-providers, vite-config, scaffold, utilities, components/utility, components/advanced.

## 🔴 Bloqueado

- **Publish no npm** — migrado pra **Trusted Publishing (OIDC + GitHub Actions)**: o workflow `release-npm.yml` não usa mais `NPM_TOKEN` (publish de `v0.6.0`/`v0.6.1` com token falhou `E404`). Falta **configurar o Trusted Publisher no npmjs.com** (uma vez):
  - <https://www.npmjs.com/package/tempest-react-sdk/access> → **Trusted Publisher** → **GitHub Actions**:
    - Organization/user: `mauriciobenjamin700`
    - Repository: `tempest-react-sdk`
    - Workflow filename: `release-npm.yml`
    - Environment: (em branco)
  - npm CLI ≥ 11.5.1 (o workflow já faz `npm install -g npm@latest`) + `id-token: write` (já presente). Provenance automática. Push de release segue **congelado** até o dono liberar.

## 🟡 Próximos (priorizado)

1. **Bundle / size-limit** — CJS em **43.76 KB / teto 45**. Decidir: subir teto **ou** criar subpaths (`tempest-react-sdk/components`, `/utils`, `/forms`, `/http`) pra tree-shaking refinado (casa com P2 antigo). Não cabe mais ~2-3 componentes sem isso.
2. **Auditar `docs/components/data.md`** — drift nos nomes de prop do `Table` (doc usa `rows`/`label`; código atual usa `data`/`header`/`emptyMessage`).
3. **Smoke no browser** dos pesados novos (Command ⌘K, DataTable, Calendar, Resizable) no app local `tempest-app-local`.

## ⚪ Backlog

- Cobertura de branches 95%+ (gaps SSR-safe; custo > valor — só pra cravar badge).
- CSS opcional `data-tempest-classname` (consumidores Tailwind/Stitches/Linaria).
- Versionamento de tokens CSS (`--tempest-*` é API pública → mudança bumpa minor/major).
- **Chart**: fora de escopo — caller injeta recharts/visx (padrão "caller injeta", como os adapters).

---

## 🚀 Release readiness (quando o token voltar)

A branch está verde e pronta. Passos pra publicar **`0.7.0`**:

1. Configurar o **Trusted Publisher** no npmjs.com (ver Bloqueado) — uma vez só. Sem secret.
2. No `CHANGELOG.md`, renomear a seção `## [Unreleased]` → `## [0.7.0] — <data>` (consolida 0.6.0/0.6.1 que nunca foram ao npm).
3. `make release TAG=0.7.0` (branch + bump + validate + tag + push → workflow `release-npm.yml` publica via OIDC com provenance).
4. Conferir `gh run list --workflow=release-npm.yml` e `npm view tempest-react-sdk@0.7.0`.
5. Atualizar o snapshot deste arquivo + `CLAUDE.md`.

> Tags `v0.6.0`/`v0.6.1` ficaram com publish falho. `v0.6.0` foi deletada; `v0.6.1` ainda existe (PR #14 aberto). Decidir na hora: deletar `v0.6.1` + fechar PR #14 e ir direto pro `0.7.0`, ou re-aproveitar.
