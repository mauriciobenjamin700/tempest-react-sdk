# Changelog

Todas as mudanças notáveis seguirão [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/).

## [0.11.0] — 2026-06-28

### Componentes novos (fecham os últimos gaps vs shadcn/ui)

- **`Slider`** — slider de um polegar (valor único) sobre `<input type="range">` nativo (acessível, sem libs). Complementa o `RangeSlider` de dois polegares. Props: `value`/`onChange`, `min`/`max`/`step`, `label`, `helperText`, `disabled`, `formatValue`.
- **`MultiSelect`** — dropdown multi-seleção com chips removíveis + busca filtrável. Teclado: ↑/↓ navega, Enter alterna, Esc fecha, Backspace (query vazia) remove o último chip. Props: `options`, `value: string[]`/`onChange`, `maxItems`, `filter`, `error`, etc. Tipo `MultiSelectOption`.
- **`DateRangePicker`** — seleção de intervalo de datas (1+ meses lado a lado) com preview no hover e auto-ordenação. `Date` puro, sem dependências. Props: `value: DateRange`/`onChange`, `numberOfMonths`, `minDate`/`maxDate`, `weekStartsOn`, `defaultMonth`. Tipo `DateRange = { start: Date | null; end: Date | null }`.
- Galeria: nova vitrine dos três em **Inputs avançados**; docs bilíngues em **Entrada de dados**.

### Widgets Material (fecham os gaps vs Flutter Material)

A lib já cobria os conceitos Material via equivalentes web; estes 5 não tinham equivalente direto:

- **`ListTile`** — linha Material (o widget mais usado): `leading` / `title` / `subtitle` / `trailing`, clicável (vira `<button>` quando há `onClick`), com `selected`/`disabled`.
- **`FloatingActionButton`** — FAB redondo (icon-only) ou estendido (`label`); `position` (`bottom-right` padrão / `bottom-left` / `none` inline), `size`, `variant`; espalha props de `<button>`.
- **`NavigationRail`** — navegação vertical compacta (rail de ícones) pra desktop: `items`/`value`/`onChange`, `header`/`footer`, `labelVisibility` (`all`/`selected`/`none`). Tipo `NavigationRailItem`.
- **`TimePicker`** — seletor de hora inline (colunas hora/minuto, opção 12h com AM/PM); emite sempre 24h `"HH:MM"`; `minuteStep`. Sem dependências.
- **`RefreshIndicator`** — pull-to-refresh (toque): puxar no topo além de `threshold` chama `onRefresh` (await) mostrando o `Spinner`.

Cada um: componente + CSS module (tokens `--tempest-*`) + testes + export no barrel. Docs bilíngues + vitrine na galeria ("Material"). Caps do `size-limit` ajustados (CJS 52 KB, styles.css 17 KB).

### Data Provider + hooks de recurso (estilo Refine, fiado ao tempest-fastapi-sdk)

- **`createDataProvider(client, options?)`** (em `src/data/`) — camada CRUD por recurso sobre o `createApiClient`, mapeada às convenções do `tempest-fastapi-sdk`: `getList` → `GET /{resource}?page&size&order_by&ascending&…filtros` (devolve `OffsetPage<T>`), `getOne`/`getMany`, `create` (POST), `update` (PATCH por padrão / PUT), `deleteOne` (DELETE). Opções pra nomes de params (`pageParam`/`sizeParam`/`sortFieldParam`/`sortOrderParam`/`sortOrderAsBoolean`), `updateMethod` e `buildPath`.
- **`<TempestDataProvider provider={…}>`** + `useDataProvider()` — injeta o provider no contexto.
- **Hooks de recurso** (sobre TanStack Query, com invalidação automática): `useList` / `useOne` / `useCreate` / `useUpdate` / `useDelete`.

### Access Control (RBAC) — além do AuthGuard

- **`<AccessControlProvider control={…}>`** + **`useCan({ action, resource })`** → `{ allowed, isLoading, reason }` + **`<Can action resource fallback>`**. Sem provider = libera tudo (documentado).
- **`createRoleAccessControl({ permissions, roles, role })`** — RBAC simples: casa `"<resource>:<action>"`, `"*"` e `"<resource>:*"`; expande roles→permissões.
- **`permissionsFromToken(token, { claim })`** — extrai permissões do JWT (claim `permissions` por padrão; fallback `scope`/`scopes`).

Cada módulo: implementação + testes (data 19, access 24). Docs bilíngues novas (Data Provider, Access Control). Caps do `size-limit` ajustados (CJS 52 KB, styles.css 17 KB).

### Charts — subpath `tempest-react-sdk/charts` (recharts)

- Novo subpath **`tempest-react-sdk/charts`** com wrappers finos e tematizados sobre **recharts v3**: `AreaChart`, `BarChart`, `LineChart`, `PieChart`, `RadarChart` + `DEFAULT_CHART_COLORS`. API enxuta (`data`/`index`/`categories`/`colors`/`height`/`stack`/`valueFormatter`…); prop `width` pula o `ResponsiveContainer` (SSR/teste).
- **`recharts` é peer opcional, externalizado** — apps que não usam charts não pagam nada (padrão "caller injeta a dep pesada", igual telemetry/feature-flags). Instale `recharts` só se for usar.
- Fecha o gap de charts (antes deixado de fora de propósito). Tipos `ChartData`, `CartesianChartProps`, `PieChartProps`. Docs bilíngues novas; entry de `size-limit` pro bundle do subpath (~1 KB sem recharts). Caps alinhados (CJS 52 KB, css 17 KB).

### DX pack (inspirado em Mantine)

- **+10 hooks utilitários**: `useDisclosure`, `useListState`, `useCounter`, `useDocumentTitle`, `useFavicon`, `useMap`, `useSet`, `useQueue`, `useClickOutside`, `useIsFirstRender` (SSR-safe, totalmente tipados).
- **`NProgress`** — barra de loading fixa no topo: controlador `nprogress` (`start`/`done`/`set`/`inc`/`subscribe`, com trickle automático) + `<NProgressBar color? height?>`. Ótimo com navegação de rota.
- **`Dropzone`** — área de drag-and-drop de arquivos: `<Dropzone onDrop accept? multiple? maxSize? onReject? disabled>` (clicável/teclado, estado de arraste).
- **`ModalsManager`** — modais imperativos: `<ModalsProvider>` + `useModals()` → `{ open, confirm, close, closeAll }` sobre o `Modal`/`ConfirmDialog` existentes.

Cada item: implementação + testes (58 no total). Docs bilíngues (hooks + feedback/inputs/overlay). Caps do `size-limit` alinhados (CJS 52 KB, css 17 KB).

### Rich Text Editor — subpath `tempest-react-sdk/editor` (tiptap)

- Novo subpath **`tempest-react-sdk/editor`** com **`<RichTextEditor value onChange placeholder? editable? toolbar? />`** sobre **tiptap v3** (StarterKit): toolbar (negrito/itálico/strike/code/H1/H2/listas/citação/undo/redo), `value` HTML controlado, área editável tematizada por `--tempest-*`.
- **`@tiptap/react` + `@tiptap/starter-kit` são peers OPCIONAIS, externalizados** — apps que não usam o editor não pagam nada (padrão "caller injeta a dep pesada", igual charts). Instale só se for usar.
- Tests +5. Docs bilíngues novas; entry de `size-limit` (~1.3 KB sem tiptap). Caps alinhados (CJS 52 KB, css 17 KB).

## [0.10.0] — 2026-06-27

### Integração full-stack Tempest (React ⇄ FastAPI)

Conjunto de recursos que alinham o frontend aos contratos do `tempest-fastapi-sdk`, sem cola manual. Recipe bilíngue nova: **Integração FastAPI (full-stack)**.

- **Erro tipado (`TempestApiError`)**: toda resposta não-2xx de `createApiClient`/`uploadWithProgress` vira um `Error` real com `code`, `requestId` e `retryAfter`, espelhando o envelope `{ detail, code, details.request_id }` do backend. Novos exports `TempestApiError`, `isApiError`, `buildApiError`. `ApiError` ganhou os campos `code?`, `requestId?`, `retryAfter?`.
- **`X-Request-ID`**: `createApiClient` e `uploadWithProgress` enviam um id de correlação por request (config `requestId?: () => string`, default gerado), reusam o mesmo id no retry pós-refresh, e ecoam de volta em `ApiError.requestId` (body → header → enviado). Casa com o `RequestIDMiddleware` do backend.
- **`Retry-After`**: `buildApiError` parseia o header (segundos ou HTTP-date) em `ApiError.retryAfter`; `retry()` honra automaticamente em `429`/`503` (cap em `maxDelay`, flag `respectRetryAfter`).
- **Paginação**: novos `OffsetPage<T>` / `CursorPage<T>` + guards `isOffsetPage`/`isCursorPage` + `emptyOffsetPage`, e os hooks **`usePaginatedQuery`** (offset, `keepPreviousData`, `next`/`prev`/`setPage`, `hasNext`/`pageCount`; opção `sizeParam` para `size` — default, `fastapi-pagination` — ou `page_size`) e **`useCursorQuery`** (cursor → `useInfiniteQuery`, `next_cursor` → `getNextPageParam`).
- **Preset de auth (`createTempestAuth`)**: liga `createAuthStore` + `createRefreshQueue` + `createApiClient` ao contrato real — login `{ access_token, token_type }`, `Authorization: Bearer`, `401 → refresh → retry` deduplicado, refresh token em body ou cookie httpOnly (`withCredentials`), `mePath` opcional. Retorna `{ useAuthStore, api, login, logout, refresh, getToken }`.

### `tempest gen api` — ciente de paginação + hardening

- Detecta os envelopes de paginação offset (`items + total + pages + size|page_size`) e cursor, resolvendo `$ref`, e gera retornos `OffsetPage<T>` / `CursorPage<T>` importados do SDK.
- Validado contra uma API real (FastAPI, 20 grupos / 77 arquivos, compila limpo contra o SDK + zod v4). Correções vindas do teste real: `{type:"null"}` → `null` (era `Record<string, unknown>`, quebrava query params); query params narrowed a primitivos; dedup de nomes de método colididos; barrel raiz namespaced (`export * as <grupo>`); `z.record(z.string(), …)` (zod v4).

## [0.9.0] — 2026-06-27

### `create-tempest-app --pwa` — scaffold de PWA (paridade com `vite-plugin-pwa`, sem ele)

- Nova flag **`--pwa`** na CLI: gera o app já **instalável**, com **web push**, **offline-first** (precache + runtime cache), **ícones gerados** e **SW funcionando em dev**. Funciona em pasta nova e em modo merge (`.`).
- A flag sobrepõe um overlay `template-pwa/` por cima do template base: `public/manifest.webmanifest` (aponta pros PNGs gerados) + `public/icon.svg` (fonte), `index.html` com link do manifest + `theme-color` + metas apple, `src/sw.ts` (push + notificationclick + skip-waiting + cache), `vite.config.ts` (registra os plugins PWA), `vite.sw.config.ts` (build dedicado do SW → `dist/sw.js`), `main.tsx` registrando o SW em dev e produção, `Dashboard.tsx` com botão **Instalar** (`useBeforeInstallPrompt`) + toggle de notificações (`usePushSubscription`), `.env.example` com `VITE_VAPID_PUBLIC_KEY`, e `sharp` como `devDependency`. O `build` empacota o SW + gera os ícones.
- **Sem `vite-plugin-pwa` nem Workbox**: tudo montado com helpers do próprio SDK.
- Em modo merge, a CLI **nunca sobrescreve arquivos do usuário** — a cópia usa um snapshot dos arquivos pré-existentes como conjunto protegido, respeitado pelo template base e pelo overlay PWA.

### Offline, ícones e SW em dev (novos plugins/helpers)

- **`installPrecache`** + **`installRuntimeCache`** (em `tempest-react-sdk/sw`): precache do app shell com `navigateFallback` offline (SPA), versão de cache + limpeza no `activate`, e caching por rota (`cache-first` / `network-first` / `stale-while-revalidate`) com `maxEntries` / `maxAgeSeconds` / `networkTimeoutSeconds`.
- **`tempestPwaManifest()`** (em `tempest-react-sdk/vite`): plugin Vite que emite `precache-manifest.json` (todos os assets do build + `version` por conteúdo) — o equivalente sem-dependência ao `__WB_MANIFEST` do Workbox.
- **`tempestPwaIcons()`** (em `tempest-react-sdk/vite`): rasteriza um SVG-fonte no set completo de ícones (`icon-192/512.png`, `maskable-512.png`, `apple-touch-icon.png`) via **`sharp`** (import preguiçoso e opcional — sem ele, avisa e pula em vez de falhar). Equivalente sem-dep ao `@vite-pwa/assets-generator`.
- **`tempestPwaDevSw()`** (em `tempest-react-sdk/vite`): serve `/sw.js` em `npm run dev` compilando `src/sw.ts` na hora com esbuild + um `precache-manifest.json` vazio — fecha o gap "SW em dev".
- Resultado: o `--pwa` atinge **paridade com o `vite-plugin-pwa`** no caso comum (precache, runtime caching, navigateFallback, cleanup, geração de ícones, SW em dev) sem dependência de runtime nova.

### PWA avançado: Background Sync, range requests e splash screens

- **`installBackgroundSync()`** (em `tempest-react-sdk/sw`): enfileira mutações (POST/PUT/PATCH/DELETE) que falham offline numa fila IndexedDB e as **reenvia quando a conexão volta** — via Background Sync API ou, sem ela, oportunisticamente no próximo request. `match`, `queueName`, `maxRetentionMinutes`; respostas 4xx são descartadas. Contrapartida sem-dep ao `BackgroundSyncPlugin` do Workbox.
- **Range requests**: opção `rangeRequests` em `installRuntimeCache` serve `206 Partial Content` fatiando o recurso cacheado (seek de áudio/vídeo offline), e o helper **`createPartialResponse(request, response)`** fica exportado pra uso manual. Equivalente ao `RangeRequestsPlugin`.
- **Splash screens (Apple)**: opção `appleSplash` em `tempestPwaIcons` gera as launch images por device (iPhone/iPad portrait) e injeta os `<link rel="apple-touch-startup-image">` no `index.html`. Tipo `AppleSplashSpec` exportado pra customizar a lista. Equivalente ao gerador de splash do `@vite-pwa/assets-generator`.
- Com isso o `--pwa` cobre **também** os três itens que antes ficavam só no `vite-plugin-pwa` — paridade praticamente total no caso comum.

### Novo subpath `tempest-react-sdk/sw`

- Os helpers de service worker (`installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener`, `installPrecache`, `installRuntimeCache`, `createPartialResponse`, `installBackgroundSync`, `registerServiceWorker`, `skipWaiting`, `unregisterAllServiceWorkers`) têm um **subpath dedicado e sem React**: `tempest-react-sdk/sw`. Ideal pra empacotar no seu `sw.ts` sem arrastar o grafo de componentes pro escopo do worker. O barrel raiz continua exportando tudo.

### CLI `tempest gen api` — OpenAPI → cliente tipado

- Novo subcomando **`tempest gen api`**: lê um schema OpenAPI (arquivo ou URL, ex. `/openapi.json`) e gera, por grupo de rotas (tag), schemas **Zod** + tipos TypeScript + classes de serviço tipadas. `--out <dir>` define o destino.
- Gerador em `bin/lib/openapi/` (ESM puro, com testes) — sem dependências novas.

## [0.8.0] — 2026-06-27

### CLI `tempest` — doctor + fix/lint/format

- Novo `bin` **`tempest`** no pacote (`npx tempest <comando>`), além do `create-tempest-app`:
  - **`tempest doctor`** — diagnóstico do projeto no estilo `flutter doctor` (Node, SDK instalado, `createViteConfig`, alias `@/*`, import do `styles.css`, ESLint/Prettier, `.env`). Sai com código 1 em problemas bloqueantes.
  - **`tempest fix`** — organiza imports, **remove imports não usados**, limpa linhas em branco extras/espaços no fim e roda Prettier (via `eslint --fix` + `prettier --write`).
  - **`tempest lint`** (report) e **`tempest format`** (só Prettier).
- Template do scaffold ganhou `eslint-plugin-simple-import-sort` + `eslint-plugin-unused-imports` + regras de whitespace, `prettier` + `.prettierrc.json`, e scripts `doctor`/`fix`/`format`.
- Dead-code profundo (funções/exports órfãos) fica fora — só imports/vars (seguro); report dedicado é trabalho futuro.

## [0.7.0] — 2026-06-27

> Inclui também tudo que foi preparado em `0.6.0` e `0.6.1` (nunca publicados no npm — ver entradas abaixo): **app foundation** (router/store/app/vite), **CLI `create-tempest-app`** embarcada como `bin`, migração do publish para **Trusted Publishing (OIDC)**.

### Utilitários genéricos novos (`src/utils/`)

- **Arrays**: `groupBy`, `uniqueBy`, `chunk`, `range`.
- **Objects**: `pick`, `omit`, `deepMerge`, `isEmpty`.
- **Type guards**: `isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever`.
- **Funções**: `debounce`, `throttle`, `once`, `memoizeOne` (funções puras — distintas dos hooks `useDebounce`/`useThrottle`).
- **Promises**: `sleep`, `withTimeout`.
- **Ids**: `randomId`.
- **Strings** (extras): `capitalize`, `camelCase`, `kebabCase`, `pluralize`.
- **Numbers** (extras): `formatBytes`, `formatCompactNumber`.
- `src/utils/index.ts` agora exporta toda a superfície; o barrel raiz passou a `export * from "./utils"`.

### Componentes genéricos novos (`src/components/`)

- **Display**: `CopyButton`, `RelativeTime`, `Money`, `TruncateText`, `VisuallyHidden`.
- **Headless / lógicos**: `Portal`, `ClickOutside`, `ConditionalWrapper`, `For`, `ErrorText`.
- **Mídia / conteúdo**: `Image` (fallback + lazy), `DataList`, `DescriptionList`.

### Componentes shadcn-parity novos (`src/components/`)

Preenchem as lacunas vs shadcn/ui — sem dependências novas (construídos sobre Popover/DropdownMenu/Modal/Table/Portal + hooks existentes):

- **Essenciais**: `Toggle`, `ToggleGroup` (+ `ToggleGroupItem`), `Label`, `Collapsible`, `ContextMenu`, `HoverCard`, `Command` (palette ⌘K).
- **Layout/UX**: `ScrollArea`, `Resizable`, `Calendar` (grid de mês standalone).
- **Navegação/conteúdo**: `NavigationMenu`, `Menubar`, `Carousel`.
- **DataTable**: wrapper com sort/filtro/paginação client-side sobre o `Table` (sem dep tanstack).
- `Chart` ficou de fora de propósito — o app injeta recharts/visx direto (padrão "caller injeta").

### Docs

- Nova página **Utilitários** (`utilities.md`) e **Utilitários & headless** (`components/utility.md`) — bilíngues PT-BR + EN-US.
- Catálogo **Overlays & avançados** (`components/advanced.md`) — bilíngue — para os componentes shadcn-parity.

## [0.6.1] — 2026-06-21

### CLI `create-tempest-app` embarcada na lib

- A CLI de scaffolding agora **vem dentro do pacote `tempest-react-sdk`** como `bin` (`create-tempest-app`) — não é mais um pacote npm separado. Instala a lib e o comando fica disponível:
  - Projeto novo: `npx -p tempest-react-sdk create-tempest-app my-app`.
  - Projeto existente (já com a lib): `npx create-tempest-app .` escreve `src/` + configs no diretório atual, **pulando arquivos que já existem** e fazendo **merge** dos scripts/deps no `package.json` existente (preserva `name`/`version`/scripts próprios).
- O `bin` carimba no `package.json` gerado a **versão do SDK que o produziu** (`tempest-react-sdk: ^<versão>`), em vez de pin fixo.
- `template/` e `bin/` entram no tarball publicado (`files`).
- O app gerado já vem com **ESLint 9** (flat config react-hooks + react-refresh, scripts `lint`/`lint:fix`) e `tsconfig` estrito (`noImplicitOverride` + `forceConsistentCasingInFileNames`).

## [0.6.0] — 2026-06-21

Estrutura de aplicação: o SDK passa a oferecer uma fundação opinativa para projetos React — Vite com alias `@`, roteamento declarativo (React Router v7), estado com Zustand e cache com TanStack Query já fiados —, além de uma CLI de scaffolding.

### Módulos novos

- **`src/router/`** — roteamento React Router v7 (modo declarativo) embrulhado pelo SDK:
  - `defineRoutes(routes)` — helper tipado pra árvore de rotas declarativa (`TempestRouteObject`: `path`/`index`/`element`/`lazy`/`children`/`guard`/`redirectTo`/`caseSensitive`).
  - `<AppRouter routes router? basename? initialEntries? fallback? />` — monta o router (`browser`/`hash`/`memory`), o boundary `<Suspense>` pra rotas `lazy` e os redirects de `guard` por rota.
  - `<RouteGuard when redirectTo? replace? />` — guarda declarativa standalone (combina com `createAuthStore`).
  - Re-exporta os primitivos declarativos (`Link`, `NavLink`, `Outlet`, `Navigate`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError`, `redirect`, `BrowserRouter`/`HashRouter`/`MemoryRouter`/`Routes`/`Route`) — apps importam toda a superfície de rotas do próprio SDK.
- **`src/store/`** — fábricas Zustand genéricas:
  - `createStore<T>(initializer, { persist? })` — contraparte genérica do `createAuthStore`, com `persist` opcional (`name`/`storage`/`partialize`/`version`/`migrate`).
  - `createSelectors(store)` — gera `store.use.<campo>()` (assinatura por slice, menos re-renders).
- **`src/app/`** — `<AppProviders query? theme? i18n? errorBoundary? />` compõe ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider num único bloco. Query e theme ligados por padrão; i18n e error boundary opt-in.
- **`src/vite/`** (subpath novo `tempest-react-sdk/vite`) — `createViteConfig(options?)`: liga `@vitejs/plugin-react`, alias `@` → `src` e defaults de dev server (porta, host, proxy com shorthand string, `overrides`). Entry Node-only, separada do barrel do browser.

### CLI nova: `create-tempest-app`

- Pacote separado (`npm create tempest-app my-app`) que gera um projeto Vite + React 19 + TypeScript já fiado com o SDK: `vite.config.ts` com `createViteConfig`, `App.tsx` com `AppProviders` + `AppRouter`, `routes.tsx` com `defineRoutes` (incluindo rota `lazy` + `guard`), `stores/auth.ts` com `createAuthStore` + `createSelectors`, `lib/api.ts` com `createApiClient` + `createQueryKeys`. Zero dependências de runtime.

### Dependências

- `react-router-dom@^7` agora é **dependency direta** (instalada junto com o SDK; externalizada no bundle).
- `vite` e `@vitejs/plugin-react` viram **peer dependencies opcionais** (só pro helper `tempest-react-sdk/vite`; já presentes em qualquer app Vite).

### Docs

- Nova seção **Estrutura de aplicação** no site (bilíngue PT-BR + EN-US): `scaffold`, `vite-config`, `routing`, `state`, `app-providers`.

## [0.5.1] — 2026-05-17

### Documentação

- **Catálogo de componentes reorganizado em `docs/components/`** (8 arquivos por categoria) com props detalhadas + exemplos + notas de a11y para cada componente:
  - [inputs.md](./docs/components/inputs.md) — 17 controles (Input, Select, Combobox, PinInput, PasswordInput, StepperInput, etc.).
  - [actions.md](./docs/components/actions.md) — Button, Tooltip, DropdownMenu, Popover, ConfirmDialog.
  - [navigation.md](./docs/components/navigation.md) — Navbar, Sidebar, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl.
  - [overlay.md](./docs/components/overlay.md) — Modal, Drawer, BottomSheet.
  - [layout.md](./docs/components/layout.md) — AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show/Hide + responsive value pattern.
  - [data.md](./docs/components/data.md) — Table, VirtualList, Accordion, Timeline.
  - [feedback.md](./docs/components/feedback.md) — Alert, Banner, Badge, Tag, Stat, Progress, Spinner, Skeleton, Toast, EmptyState, ErrorState.
  - [identity.md](./docs/components/identity.md) — Avatar, Card, Kbd.
- **`docs/testing.md`** — doc dedicada ao subpath `tempest-react-sdk/testing` com integração MSW + vitest fetch stub.
- `docs/components.md` virou stub apontando pra `docs/components/`.
- `docs/README.md` atualizado com índice por subpasta.

## [0.5.0] — 2026-05-17

### Hooks novos

- **`usePrevious<T>(value)`** — valor da renderização anterior.
- **`useInterval(fn, delay | null)`** — setInterval reativo, `null` pausa, callback em ref (sem reassinar).
- **`useTimeout(fn, delay | null)`** — equivalente pra timeout.
- **`useThrottle<T>(value, ms)`** — throttle leading + trailing.
- **`useWindowSize()`** — `{ width, height }` SSR-safe.
- **`useHover<T>(ref)`** — boolean reativo pra mouseenter/leave.
- **`useLongPress(ref, fn, { delay, moveThreshold })`** — long-press gesture com cancelamento por movimento ou pointerup precoce.

### Componentes novos

- **`PinInput`** — OTP/one-time-code style com N células, paste support, auto-advance, backspace/arrow nav, masked option, sizes `sm/md/lg`, `type: numeric|alphanumeric`.
- **`PasswordInput`** — toggle show/hide + strength meter opcional (5 níveis). Helper `estimatePasswordStrength(value)` exposto.
- **`SegmentedControl`** — iOS-style pill bar, 2-5 opções mutuamente exclusivas, sizes, fullWidth, ícones por opção.
- **`StepperInput`** — `+ / −` numeric com clamp em `min/max`, custom `format()`, sizes, disabled.
- **`Timeline`** — feed vertical com markers coloridos (primary/success/warning/danger/neutral), conector entre items, slots title/description/meta/icon.

### Utils

- **`slugify(str)`** — URL-safe slug, strip diacritics, collapse separators, lowercase.
- **`truncate(str, max, suffix?)`** — corta strings com ellipsis (`…` default) ou suffix custom.
- **`clamp(value, min, max)`** — bounded numeric, NaN-safe, swap-tolerant.
- **`relativeTime(date, { locale?, now? })`** — "agora há pouco" / "5 min atrás" / "em 3 dias". Locales `pt-BR` (default) + `en`. Aceita `Date | string | number`.

### Stats

- 758 testes em 225 arquivos (era 682 / 210).
- 7 hooks novos, 5 componentes novos, 4 utils novos.

## [0.4.0] — 2026-05-17

### Navegação mobile/desktop

- **`Navbar`** — app bar superior, slots `logo`/`nav`/`actions`, sticky default, tones `surface/primary/transparent`, safe-area top.
- **`Sidebar`** — desktop nav, `items: SidebarItem[]`, `collapsed`, slots `header`/`footer`, badge support, width controlável.
- **`BottomNavigation`** — tab bar mobile fixa no rodapé, 3-5 itens, badges, safe-area bottom.
- **`BottomSheet`** — slide-up modal mobile com drag handle, portal, scroll lock, dismissOnBackdrop/Esc.
- **`AppShell`** — composer responsivo: navbar + sidebar (desktop) / bottomNav (mobile) + main + footer. `sidebarBreakpoint` ajusta switch.
- **`Page`** — page wrapper com header (`title`/`eyebrow`/`description`/`actions`) + `toolbar` + content + `footer`.

### Conteúdo

- **`Banner`** — banner persistente top-of-page. `variant: info/success/warning/danger`, dismissible, action slot.
- **`Tag`** — chip removível pra filter tokens. `variant`, `size`, `onRemove`.
- **`Stat`** — KPI card. `label`, `value`, `delta` (trend up/down inferido por `+`/`-`), `hint`, `icon`.
- **`SafeArea`** — `env(safe-area-inset-*)` padding por edge — wrap content que esbarra em chrome iOS/Android.

### Forms

- **`FormField`** — wrapper RHF `Controller` + zod auto. Aceita qualquer control que receba `{ value, onChange, error, label }` via `cloneElement`. Funciona com `FormProvider` (preferido) ou `control` prop explícita.
- **`useFieldArray`** re-export tipado (já vinha do user, agora documentado).

### OAuth (novo módulo `src/oauth/`)

- **`GoogleSignIn`** — wrapper sobre `@react-oauth/google`'s `<GoogleLogin>`. Aceita o componente Google via prop `component` (não vira peer dep). Normaliza `onSuccess` → `OAuthCredential` (`idToken`, `provider`, `raw`), `onError` → `OAuthError` (`provider`, `code`, `message`, `raw`).
- **`useOAuthCallback<T>`** — hook pra `/callback` route. Exchange one-shot com `{ loading, data, error, status }`. StrictMode-safe (ref guard).
- Tipos: `OAuthCredential`, `OAuthError`, `GoogleSignInTheme/Text/Shape/Size`, `UseOAuthCallbackOptions`, `UseOAuthCallbackResult`.

### Testing (novo subpath `tempest-react-sdk/testing`)

- **`createMockHandlers`** — factory MSW-shaped (`method/path/status/body/headers/delayMs`). MSW não é peer dep; output é puro data-shape que o consumidor passa pra `http.<method>` ou similar.
- Bundle separado (~0.3KB ESM) — não polui o main bundle.

### Build / CI

- **Subpath entries**: vite multi-entry config. `tempest-react-sdk` (main) + `tempest-react-sdk/testing` (standalone).
- `package.json` `exports` mapeia `./testing` para `dist/testing.{js,cjs,d.ts}`.
- **`.size-limit.json`** + **`.github/workflows/size-limit.yml`** — bundle size budget enforcement. Main ESM ≤ 50KB, CJS ≤ 45KB, testing ≤ 2KB, styles.css ≤ 15KB.

### Documentação

- `docs/hooks.md` reescrito — todos 22 hooks (DOM/viewport + estado), exemplos pra `useBreakpoint`, `useLocalStorage`, `useAsync`, `useEventListener`, `useToggle`, `useStableCallback`.
- `docs/components.md` reescrito — catálogo completo reorganizado em 9 categorias (Entrada / Ação / Navegação / Overlay / Layout / Dados / Status / Texto / Identidade) + seções OAuth + Testing.

### Stats

- 682 testes em 210 arquivos (era 670 / 206).
- Main bundle: ESM ~149KB / CJS ~106KB (gzip 42/36KB).
- Testing bundle: 0.31KB ESM (0.23KB gzip).
- CSS bundle: 86KB / 13KB gzip.

## [0.3.0] — 2026-05-17

Trabalho de estilos + responsive + componentes novos.

### Tokens

- **Cor**: scale `--tempest-primary-50..900`, `--tempest-gray-50..900`, status triplets `*-fg/bg/border/solid` (`success`/`warning`/`danger`/`info`), focus ring tokens (`--tempest-focus-ring-color/width/offset`), shadow `xs`/`xl`/`inner`, radius `xs`/`2xl`. Dark theme atualizado.
- **Typography**: `typography.css` novo — `--tempest-text-2xs..6xl`, line-heights, weights, tracking, **fluid type** `--tempest-text-fluid-*` com `clamp()`.
- **Motion**: `motion.css` novo — durations `instant/fast/base/slow/slower`, easings (`out`/`in-out`/`emphasized`/`bounce`), composite transitions, `prefers-reduced-motion` global.
- **Density**: `density.css` novo — `data-tempest-density="compact|comfortable|spacious|touch"` ajusta heights/padding/font/radius dos controles. Auto-bump em `@media (pointer: coarse)`.
- **Breakpoints**: `--tempest-bp-xs/sm/md/lg/xl/2xl` (480/640/768/1024/1280/1536).
- **Safe-area**: `--tempest-safe-area-top/right/bottom/left` com fallback 0.

### Componentes novos

- `Alert` — variants `neutral/info/success/warning/danger` × `appearance="soft|solid|outline"` + icon/dismiss.
- `Kbd` — chave de teclado estilizada, sizes `sm/md/lg`.
- `Divider` — horizontal/vertical, solid/dashed, label com align.
- `Accordion` — single/multiple mode, controlled/uncontrolled.
- `Popover` — anchor + outside-click + Esc dismiss.
- `DropdownMenu` — entries `item`/`separator`/`label`, keyboard nav.
- `RatingStars` — radio group, sizes, readonly.
- `RangeSlider` — dual-thumb, clamp low ≤ high, format callback.
- `Combobox` — Select com search/filter, keyboard nav.
- `<Show>` / `<Hide>` — breakpoint-conditional render (SSR-safe).
- `Spacer` — flex push (`axis="both|x|y"`) — substitui `<div style={{ flex: 1 }}>`.
- `Center` — centraliza children (`axis="both|horizontal|vertical"` + `minHeight`).
- `AspectRatio` — preserva proporção pra media (`ratio={16/9}` default, aceita qualquer número).

### Componentes refatorados

- `Button` — variants novos `success`/`soft`/`outline`/`link`, sizes `xs`/`xl`, props `iconOnly`/`pill`, hover-only gated, touch hit-slop em pointer-coarse.
- `Badge` — `appearance="soft|solid|outline"`, `shape="pill|square"`, `dot`, prop `primary` variant, sizes `sm/md/lg`.
- `Card` — `elevation="flat|default|raised|elevated"`, prop `interactive`, slot `footer`.
- `Modal` — sizes `2xl`/`3xl`, props `fullscreen`/`fullscreenOnMobile`, padding interno reduzido < 640px, `dvh` fallback, safe-area.
- `Drawer` — props `mobilePlacement` (auto-switch para bottom-sheet) + `showHandle` (drag indicator), safe-area, motion tokens.
- `Table` — `priority="tablet|desktop"` por coluna + prop `stackOnMobile` (rows viram cards label/value).
- `Toast` — prop `position` (top/bottom × left/center/right), auto-stretch full-width < 480px, safe-area.
- `Input` — prop `size="sm|md|lg"`.
- `Spinner` — sizes `xs`/`xl` novos.
- `Tabs` — fade-edge mask em overflow horizontal.
- `Container` — padding responsivo (16/24/32px por bp).
- `Stack`/`Grid` — `direction`/`columns`/`gap` aceitam `{ mobile, tablet, desktop }`.
- Todos componentes restantes (ChipInput/ConfirmDialog/DatePicker/EmptyState/ErrorState/FileUpload/Form/Progress/SearchBar/Avatar/Stepper/Pagination/Breadcrumbs/Select/Textarea/Checkbox/Switch/Radio/Tooltip/Skeleton) refatorados para usar tokens novos (typography/motion/focus ring/density).

### Hooks novos

- `useBreakpoint()` — retorna `current/width/above/below/isMobile/isTablet/isDesktop`.
- `useEventListener(name, handler, target?, options?)` — wrap genérico SSR-safe.
- `useLocalStorage<T>(key, default)` — state sincronizado com cross-tab via `storage` event.
- `useToggle(initial?)` — açúcar pra boolean state.
- `useAsync(fn, deps?, { immediate? })` — track `idle/pending/success/error`.

### Estilos globais

- `styles/responsive.css` — utilities `tempest-hide-mobile/tablet/desktop`, `tempest-show-only-*`, `tempest-hide-touch`, `tempest-hide-print`.
- `styles/print.css` — esconde overlays/portais, grayscale, page-break, `(href)` em links.
- `reset.css` modernizado (`modern-normalize` style).
- Hover effects atrás de `@media (hover: hover) and (pointer: fine)`.

### Documentação

- `docs/styles.md` — guia completo: 14 seções cobrindo tokens, variants, responsive, touch, safe-area, fluid type, print, política de versionamento.

### Numbers

- 225 módulos transformados na build (era 191 em v0.2.0).
- **628 tests passando em 196 arquivos** (era 487 em v0.1.4, 510 em v0.2.0).
- CSS bundle: 74 KB → **10.6 KB gzip**.
- JS bundle: 133 KB → **37.5 KB gzip** (CJS 95 KB → 32.1 KB gzip).

## [0.2.0] — 2026-05-17

### Mudança arquitetural — child deps agora são `dependencies`

Decisão original do v0.1.x ("peer deps opcionais") **revertida**. A partir de v0.2.0, as dependências filhas são instaladas automaticamente junto com o SDK.

**Antes (v0.1.x):**

```bash
npm install tempest-react-sdk react react-dom \
  @tanstack/react-query zod zustand react-hook-form lucide-react
```

**Agora (v0.2.0+):**

```bash
npm install tempest-react-sdk react react-dom
```

`zod`, `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `lucide-react` saíram de `peerDependencies` (+ `peerDependenciesMeta.optional`) e entraram em `dependencies`. Continuam externalizadas no `vite.config.ts` Rollup config — o bundle publicado do SDK **não cresce** (ESM ~114KB, CJS ~82KB).

`react` e `react-dom` continuam como peer dep (regra de uma única instância React).

### Por que

- Onboarding mais simples — `npm install tempest-react-sdk` traz tudo. Apps que usam alofans/transport patterns não precisam mais lembrar a lista de peers.
- Versões de child deps são gerenciadas pelo SDK — apps não precisam atualizar manualmente quando o SDK bumps `zod` ou `zustand`.
- Apps que querem versão diferente continuam pinando no próprio `package.json`; npm dedup resolve quando ranges são compatíveis.

### Conflitos de versão

Se o app já pina `zod@3.20` por exemplo, npm dedup quando range é compatível. Se ranges divergem (`^3.23` do SDK vs `^3.20` do app), npm pode instalar duas cópias — o app deve forçar uma versão única no seu `package.json` ou abrir issue se o range do SDK for muito apertado.

### Workflow CI ajustado

Smoke install simplificado em `.github/workflows/release-npm.yml` — instala apenas `react@^19 react-dom@^19`; as outras chegam via dependência transitiva do tarball.

### Outras mudanças desta release

- **Stack responsivo**: `Stack.direction` agora aceita `ResponsiveValue<StackDirection>` (`{ base, sm, md, lg, xl }`) — combina com `useMediaQuery` interno pra trocar de vertical/horizontal por breakpoint.
- **Table priority**: `TableColumn.priority: "always" | "tablet" | "desktop"` esconde colunas por viewport.
- Re-exports faltando: `ResponsiveValue` / `StackDirection` em `src/components/Layout/index.ts`, `TablePriority` em `src/components/Table/index.ts`.
- Novos style modules: `src/styles/print.css` (estilos para `@media print`), `src/styles/responsive.css` (breakpoint tokens). `index.css` importa ambos.
- Refresh visual contínuo em vários componentes (Button, Card, Drawer, ...).
- CSS bundle: 54 → 59 KB (gzip 8 → 9 KB).

## [0.1.6] — 2026-05-17

### Adicionado

- **`Alert`** — banner inline com `variant: info/success/warning/danger` e `appearance: filled/subtle`. Slot pra título, descrição e ação.
- **`Divider`** — separador horizontal/vertical com `variant: solid/dashed/dotted` e `align: start/center/end` para texto inline.
- **`Kbd`** — `<kbd>` styled pra atalhos. `size: sm/md/lg`. Compose: `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`.
- **`docs/styles.md`** — referência de tokens CSS + estratégia de customização.

### Atualizado

- Refresh visual em ~14 componentes (Breadcrumbs, Checkbox, Drawer, Pagination, Radio, Select, Skeleton, Spinner, Stepper, Switch, Table, Tabs, Textarea, Toast, Tooltip) usando density/motion/typography tokens.
- `docs/components.md` inclui Alert/Divider/Kbd.
- `CLAUDE.md` snapshot v0.1.6 (499 testes, 39+ componentes).

### Stats

- 499 testes (+12), 172 arquivos (+3).
- ESM ~104KB / CJS ~78KB / CSS 40 → 54KB (gzip 7 → 8KB).

## [0.1.5] — 2026-05-17

### Componentes

- **`Input.size`**: nova prop tipada `InputSize = "sm" | "md" | "lg"` (default `"md"`). Substitui o `size?: number` herdado do HTMLInputAttributes via `Omit<..., "size">`. Drive height/padding/font via tokens density-aware.
- **Button / Card / Badge / Modal**: refresh visual (CSS expandido — variantes / hover / focus states / size scale via tokens).
- **Estilos globais** (`src/styles/`):
  - Expansão de `colors.css` (paleta completa light/dark com semânticos).
  - Novos arquivos: `density.css` (tokens de spacing/sizing escalados), `motion.css` (tokens de transição/animation), `typography.css` (tokens font-family/size/weight/line-height).
  - `reset.css` ampliado e `index.css` importa os novos.
  - CSS bundle: 33KB → 40KB (gzip 6 → 7KB).

### Documentação

- `docs/telemetry.md`: reescrita completa com adapters concretos (Sentry, PostHog), interface formal, exemplo Datadog custom.
- `docs/feature-flags.md`: reescrita completa com adapters GrowthBook e LaunchDarkly, interface formal, exemplo Unleash custom.
- `docs/forms.md`: nova seção "Layout — `Form` + subcomponentes" cobrindo `Form` / `FormSection` / `FormRow` / `FormActions` (stack/inline/grid variants).
- `docs/components.md`: tabela completa reorganizada por categoria (Entrada, Ação, Overlay, Dados, Status, Identidade, Layout). Cobre todos os 36+ componentes.
- `docs/auth.md`: cobre todos os 5 exports (`createAuthStore`, `AuthGuard`, JWT helpers, `lazyWithRetry`, `createRefreshQueue`) com pattern de uso completo.
- `docs/release.md`: novo doc descrevendo pipeline tag-push + comandos make + workflow CI + provenance signing + segredos.
- `docs/README.md`: index inclui release.md.
- `CLAUDE.md`: snapshot atualizado para v0.1.4 (publicado), changeset refs removidos, comandos de release refletem `make release TAG=X`.

### Corrigido

- `DatePicker`: `Omit<InputHTMLAttributes<HTMLInputElement>, "size">` — necessário após `Input.size` mudar de `number` para `InputSize` union.

## [0.1.4] — 2026-05-17

### Adicionado

- **`createPostHogTelemetryAdapter`** — `TelemetryAdapter` wrapping `posthog-js`. `identify` → `posthog.identify(id, traits)` (ou `reset()` quando `null`), `track` → `posthog.capture(name, props)`, `captureException` → `posthog.captureException(err, ctx)` quando disponível com fallback para `capture("$exception", { ... })`, `init` opcional para chamar `posthog.init(apiKey, options)` no mount do provider. 8 testes novos.
- **`createGrowthBookFeatureFlagsAdapter`** — `FeatureFlagsAdapter` wrapping uma instância `GrowthBook`. `isEnabled` → `growthbook.isOn`, `get` → `growthbook.getFeatureValue`, `onChange` instala `setRenderer` lazy na primeira inscrição e multiplexa para todos os listeners. 5 testes novos.
- **`createLaunchDarklyFeatureFlagsAdapter`** — `FeatureFlagsAdapter` wrapping `launchdarkly-js-client-sdk`. `isEnabled` → `client.variation(key, default) === true`, `get` → `client.variation`, `onChange` → `client.on("change", listener)` + `client.off` no unsubscribe. 5 testes novos.
- Tipos exportados: `PostHogLike`, `CreatePostHogTelemetryAdapterOptions`, `GrowthBookLike`, `CreateGrowthBookFeatureFlagsAdapterOptions`, `LDClientLike`, `CreateLaunchDarklyFeatureFlagsAdapterOptions`.
- Nenhuma das três SDKs (`posthog-js`, `@growthbook/growthbook`, `launchdarkly-js-client-sdk`) é peer dep — apps instalam só o que usam, adapter só toca na instância fornecida.

## [0.1.3] — 2026-05-17

### Adicionado

- **`createSentryTelemetryAdapter`** — concrete `TelemetryAdapter` para `@sentry/browser`. Mapeia `identify` → `Sentry.setUser`, `track` → `Sentry.addBreadcrumb`, `captureException` → `Sentry.captureException`, `flush` → `Sentry.flush`. Aceita `initOptions` (chamado em `provider.init`), `flushTimeout` (default 2000ms), `breadcrumbCategory` (default `"app"`).
- `@sentry/browser` é injetado pelo caller (não vira peer dep) — apps que já inicializam Sentry no startup passam a instância existente; apps que não usam não pagam pelo bundle.
- Tipo `SentryLike` exporta a interface mínima da SDK Sentry usada — útil para mocks.
- 11 testes novos cobrindo init com/sem initOptions, identify mapping (incluindo traits), null user, breadcrumb props, custom category, captureException context, flush + flush no-op quando ausente.

### Corrigido

- README telemetry recipe: `consoleTelemetryAdapter` é **value** (não função) — uso correto `adapter={consoleTelemetryAdapter}`. `track` aceita `{ name, properties }`, não `(name, properties)`.
- README telemetry recipe: `useTelemetry()` retorna `null` quando provider ausente — call sites devem optional-chain.

## [0.1.2] — 2026-05-17

### Adicionado

- **`Form` component** com 3 variantes de layout: `stack` (default, fields verticais), `inline` (linha horizontal com wrap, alinhada ao fim), `grid` (N colunas via `columns` prop). Aceita `gap` (number → escala 4px ou CSS string).
- **`FormSection`** — subgrupo titulado com `title`/`description` e layout independente do pai (stack/inline/grid + columns/gap próprios).
- **`FormRow`** — força side-by-side row dentro de forms stacked (útil pra agrupar CEP+cidade, expiry+CVV). Children dividem largura igualmente.
- **`FormActions`** — footer row de botões com `align` (start/center/end/between).
- 13 testes novos cobrindo layouts, gap conversion, grid template columns, alignment, submit handler.

## [0.1.1] — 2026-05-17

### Documentado

- README: nova seção **Recommended stack** declarando Vite + React + TypeScript como stack suportada, com link para [vite.dev/guide](https://vite.dev/guide/) e comando bootstrap (`npm create vite@latest my-app -- --template react-ts`).
- README: expansão completa do README (TOC, peer-deps table, architecture diagram, quickstart com providers, 31 recipes cobrindo todos os módulos, theming reference, conventions, dev & release sections) modelada no padrão `tempest-fastapi-sdk`.

### Infra

- Pipeline de release reescrito: substituído fluxo changesets por tag-push workflow (`.github/workflows/release-npm.yml`) + `Makefile` + `scripts/release.sh` adaptados de `localm-web`. Push de tag `v*.*.*` → CI valida (lint + format + typecheck + test + build + smoke-install) → `npm publish --provenance` com `NPM_TOKEN`.
- `prepublishOnly` script garante typecheck + lint + test + build antes de `npm publish` manual.
- Workflow CI smoke step instala **todos** peer deps opcionais (`@tanstack/react-query`, `zod`, `zustand`, `dexie`, `react-hook-form`, `lucide-react`) — ESM eager-resolve quebrava o import sem isso.
- Repo-wide `prettier --write` aplicado em 126 arquivos (husky pre-commit só formatava staged via lint-staged).
- `RELEASES.md` gerado automaticamente a partir das git tags via `make releases-md`.

### Corrigido

- Typecheck: removidos `@ts-expect-error` órfãos em 11 arquivos de teste; `KeyBuilder` em `src/query/create-query-keys.ts` aceita assinaturas tipadas mais estreitas; `ErrorBoundary.reset.test.tsx` não declara mais `namespace JSX { interface Element {} }` (conflitava com jsx-runtime).
- `package.json`: `author`, `homepage`, `repository`, `bugs` apontam para `mauriciobenjamin700/tempest-react-sdk` (antes era placeholder `tempest/`).

## [0.1.0] — Inicial

### Adicionado

- **HTTP**: `createApiClient`, `parseResponse`, `uploadWithProgress`.
- **Auth**: `createAuthStore` (zustand), `AuthGuard` router-agnostic.
- **Query**: `QueryProvider`, `createQueryKeys`, `STALE_TIME` / `CACHE_TIME` / `REFETCH_TIME`.
- **SSE**: `createEventStream`, `useEventStream` (reconnect exponencial, heartbeat).
- **WebSocket**: `createWebSocket`, `useWebSocket`.
- **Web Push**: `WebPushClient`, `usePushSubscription`.
- **Service Worker**: `registerServiceWorker`, `installPushHandler`, `installNotificationClickHandler`, `installSkipWaitingListener`.
- **Audio**: `createAudioPlayer`, `playAudio`, `useAudio`.
- **Offline (Dexie)**: `createOfflineStore` (owner-scoped).
- **Forms**: `validateForm`, `zodResolver`, `useZodForm`.
- **Error Boundary**: `ErrorBoundary`, `useErrorHandler`.
- **Tema**: `ThemeProvider`, `useTheme`, `themeInitScript`.
- **i18n**: `I18nProvider`, `useI18n`, `useTranslate`, `createI18n`.
- **Componentes**: Button, Input, Select, Textarea, Modal, ConfirmDialog, Table, Pagination, Badge, Card, Spinner, Skeleton, EmptyState, ErrorState, SearchBar, Toast.
- **Hooks**: `useDebounce`, `usePagination`, `useClientFilter`, `useMediaQuery`.
- **Utils**: `cn`, formatadores BR, `storage`.
- **Styles**: tokens `--tempest-*`, dark via `data-tempest-theme="dark"`.
- **Docs**: 15 markdowns + 3 diagramas drawio.
- **Gallery**: app Vite em `examples/gallery`.
