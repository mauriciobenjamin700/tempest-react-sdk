# Roadmap — tempest-react-sdk

> Snapshot: 2026-06-27 · Última versão **publicada no npm: `0.7.0`** (via Trusted Publishing/OIDC, sem token) · branch de release: `release/v0.7.0` (PR #15 → main).

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

## ✅ Publish resolvido

- **`0.7.0` publicado** via **Trusted Publishing (OIDC + GitHub Actions)** — `release-npm.yml` sem `NPM_TOKEN`, provenance automática, npm CLI ≥ 11.5.1 no runner. Trusted Publisher configurado no npmjs.com (repo + `release-npm.yml`, environment vazio). Próximos releases: só `make release TAG=X`.
- Falhas anteriores (`v0.6.0`/`v0.6.1`, `E404`) eram do token/config; tags deletadas, PRs #13/#14 fechados.

## 🟡 Próximos (priorizado)

1. **Bundle / size-limit** — CJS em **43.76 KB / teto 45**. Decidir: subir teto **ou** criar subpaths (`tempest-react-sdk/components`, `/utils`, `/forms`, `/http`) pra tree-shaking refinado (casa com P2 antigo). Não cabe mais ~2-3 componentes sem isso.
2. ~~Auditar `docs/components/data.md`~~ ✅ feito — props do `Table` corrigidas (`data`/`header`/`emptyMessage`).
3. **Smoke no browser** dos pesados novos (Command ⌘K, DataTable, Calendar, Resizable) no app local `tempest-app-local`.
4. ~~OpenAPI → geração de serviços (in-house)~~ ✅ **feito** — `tempest gen api <url|file> --out src/api`: por grupo de rotas (tag) gera `schemas.ts` (Zod), `types.ts` (`z.infer`) e `service.ts` (classe com método por rota + validação Zod do body), sobre o `createApiClient`. Gerador em `bin/lib/openapi/`. v1 cobre o comum de FastAPI (JSON). Futuro: YAML, validação opcional de resposta, query keys geradas.

## 🔗 Integração full-stack Tempest (react SDK ⇄ fastapi SDK)

> Origem: análise dos recipes do [`tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/). Objetivo: front feito com nosso react SDK fala com API feita com nosso fastapi SDK **sem cola manual** — mesmos contratos dos dois lados.

Contratos do backend (referência):

- **Erro** `{ "detail": str, "code": "ERROR_CODE", "details": { "request_id": str } }`
- **Paginação offset** `{ items, total, page, page_size, pages }` · filtros `?page&page_size&order_by&ascending`
- **Paginação cursor** `{ items, next_cursor, has_more, limit }` · filtros `?cursor&limit&order_by&ascending` (cursor opaco base64, repassar literal até `null`)
- **Auth** login → `{ access_token, token_type: "bearer" }` · header `Authorization: Bearer <token>` · refresh com TTL separado
- **Correlação** middleware lê/gera `X-Request-ID`; vem de volta no `details.request_id` do erro
- **Rate limit** `429 Too Many Requests` + `Retry-After: <segundos>`

Itens (priorizado):

6. ~~**Contrato de erro Tempest**~~ ✅ **feito** — `ApiError` ganhou `code` + `requestId` + `retryAfter`; `class TempestApiError` (Error real) + `isApiError` + `buildApiError` em [src/http/errors.ts](src/http/errors.ts); parseado em api-client + upload. `if (err.code === "EMAIL_TAKEN")` tipado.
7. ~~**`X-Request-ID` propagation**~~ ✅ **feito** — `createApiClient`/`uploadWithProgress` enviam `X-Request-ID` por request (config `requestId?: () => string`, default `randomId()`), reusam o mesmo id no retry pós-refresh, e ecoam de volta no `ApiError.requestId` (body → header → enviado).
8. ~~**`Retry-After` no retry**~~ ✅ **feito** — `buildApiError` parseia `Retry-After` (segundos ou HTTP-date) → `ApiError.retryAfter`; `retry()` honra (cap em `maxDelay`, flag `respectRetryAfter`).
9. ~~**Tipos + hooks de paginação**~~ ✅ **feito** — `OffsetPage<T>`/`CursorPage<T>` + guards + `emptyOffsetPage` em [src/query/pagination.ts](src/query/pagination.ts); `usePaginatedQuery` (offset, `keepPreviousData`, `next`/`prev`/`setPage`, `hasNext`/`pageCount`) e `useCursorQuery` (cursor → `useInfiniteQuery`, `next_cursor`→`getNextPageParam`).
10. ~~**Preset de auth Tempest**~~ ✅ **feito** — `createTempestAuth({ baseURL, loginPath, refreshPath, mePath })` em [src/auth/create-tempest-auth.ts](src/auth/create-tempest-auth.ts): liga `createAuthStore` + `createRefreshQueue` + `createApiClient`, login `{access_token}`, Bearer, 401→refresh→retry, refresh token em body ou cookie httpOnly (`withCredentials`).
11. ~~**Codegen OpenAPI ciente do Tempest**~~ ✅ **feito + validado na API real** ([api.buscar.app.br](https://api.buscar.app.br/openapi.json), 20 grupos / 77 arquivos, **compila limpo** contra o SDK + zod v4). Detecta envelopes offset (`items+total+pages+size|page_size`) / cursor → `OffsetPage<T>`/`CursorPage<T>`. Erro já vira `TempestApiError` em runtime. **Hardening do teste real**: `{type:"null"}`→`null` (era `Record<unknown>`, quebrava query params), dedup de nomes de método colididos, barrel raiz namespaced (`export * as <grupo>`, casa com a doc), `z.record(z.string(), …)` (zod v4). Futuro: opção `--query-keys`.

**Doc transversal** ✅ — recipe bilíngue [integration-fastapi.md](docs/integration-fastapi.md) (+`.en`) mostrando o loop completo: backend fastapi SDK → `tempest gen api $API/openapi.json` → service tipado → auth preset → paginação → erros correlacionados por `request_id`. Inclui tabela de recursos pareados (SSE/WebPush/BR helpers). Na nav em Receitas.

## 📝 Docs a melhorar

- **Tutorial de routing — múltiplos layouts**: enriquecer `tutorial/routing` (e/ou `routing.md`) com o caso comum de **vários layouts**: mobile vs desktop, e área **não-autenticada vs autenticada** (ex.: `<AuthLayout>` público + `<AppLayout>` protegido com `RouteGuard`, e troca de shell por `useBreakpoint`). Mostrar a árvore de rotas aninhada com layouts por seção.

## 🟢 Em progresso

- **CLI `tempest`** (bin novo no pacote): `tempest doctor` (health-check estilo flutter doctor) + `tempest fix`/`lint`/`format` (ESLint --fix com import-sort + unused-imports + whitespace, e Prettier). Template ganha os plugins.

5. **Recursos de SEO** — primitivos pra meta tags / `<head>` por rota (title, description, Open Graph, Twitter card, canonical, JSON-LD), `robots`/`sitemap` helpers e dicas de SSR/pre-render. Provável `<Seo>` / `useSeo()` (sem dep tipo react-helmet — in-house) integrado ao router.

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
