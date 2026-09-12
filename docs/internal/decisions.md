# Decisões consolidadas

Cada item aqui foi decidido com uma razão escrita. **Não revisitar sem um fato
novo** — um consumidor real que colidiu, uma medição que contradiz o racional.
Propor o oposto sem isso é refazer uma conversa que já aconteceu.

## Escopo

- **Client-side only, PWA offline-first.** O SDK **não** vai para SSR/RSC: nada
  de `"use client"`, nada de App Router do Next. O alvo é SPA Vite que roda
  offline (service worker, IndexedDB, outbox, install prompt). É escopo
  escolhido, não lacuna: suportar os dois mundos paga em cada API (dois caminhos
  de render, hidratação, `window` proibido no módulo) e o offline-first fica pior.
  Os guards `typeof window === "undefined"` continuam — eles servem para não
  explodir fora do browser (teste, service worker, plugin de build), não para
  prometer render no servidor.
- **Sem Storybook.** Docs em markdown + `examples/gallery` (app Vite real).
- **Sem Changesets.** Pipeline tag-push (`make release TAG=X`).
- **i18n minimalista in-house.** Quem precisa de plural avançado, namespace ou
  carga async usa `i18next` direto; o SDK cobre o caso simples (~1,5 kB gzip).

## Estilo e tema

- **CSS Modules com prefixo `tempest_`, e só isso.** Não existe modo headless
  para Tailwind/Stitches/Linaria: um segundo caminho de estilo dobraria a
  superfície de cada componente e diluiria os tokens. Um app com Tailwind
  convive lado a lado — o prefixo evita colisão.
- **Tokens `--tempest-*`** são a única forma de tema; o app customiza
  sobrescrevendo no `:root`.
- **Tema escuro por `data-tempest-theme="dark"`**, não `class="dark"` — permite
  escopo parcial numa subárvore.
- **Embutir tokens por componente foi medido e rejeitado**: custa +14 kB raw para
  devolver 351 B brotli, e põe N blocos `:root` de mesma especificidade contra o
  `:root` do app, com ordem que o bundler não garante — `createTheme` e todo
  override do consumidor parariam de mandar.

## Dependências

- **Peers de contexto, deps diretas para o resto** (v0.2.0+, revisado pós-0.42.1).
  O critério é contexto React. `react-router` virou peer `^7 || ^8` porque como
  dep direta gerava cópia aninhada em todo app que já tivesse router fora do
  range — o crash exato é `useNavigate() may be used only in the context of a
  <Router>`.
- **Dívida conhecida e decidida** (#210, fechada mantendo o estado):
  `@tanstack/react-query`, `zustand` e `react-hook-form` também carregam contexto
  e continuam como dep direta. A duplicação é rara na prática (ranges largos) e o
  onboarding pesa mais. Se um app real colidir, o caminho é o do router.

## Empacotamento

- **`dist` com grafo de módulos preservado** (`preserveModules`, v0.23.0+).
  Muitos arquivos em `dist` é esperado.
- **Servir um segundo build por condição `"node"` do `exports` foi rejeitado**:
  duplicaria os 126 módulos e mais um caminho no `link-component-css.mjs` para
  atender um consumidor que a decisão client-side-only já não tem. Em vez disso,
  o pacote ships o loader (`/node-css-loader`) e a exigência de bundler está na
  doc.
- **`noUncheckedIndexedAccess` fica desligado.** Medido em 29/08/2026: 221 erros
  no `src/`, 168 deles em `components/`; amostrados, são acessos dentro de laço
  limitado pelo próprio `length` ou protegidos por invariante já defendida.
  Adotar trocaria 221 guardas reais por 221 `!` — o operador que a flag existe
  para evitar. A **varredura** valeu como auditoria (achou paleta vazia em
  `quantizeScale`/`thresholdScale`, que virou `throw`); repetir a varredura vale,
  ligar a flag não. Na mesma passada: `noImplicitReturns` 1 erro (adotado),
  `exactOptionalPropertyTypes` 113 (muda o `.d.ts` do consumidor),
  `noPropertyAccessFromIndexSignature` 1130.

## Fora de escopo, com a conta que decide

- **Inverter um vídeo não é primitiva de SDK** (registrado no #278). Um frame
  1080p em RGBA é ~8,3 MB, então 10 s a 30 fps são ~2,5 GB de decode na rota
  WebCodecs. A rota por seek + `drawImage` paga o seek frágil uma vez **por
  frame**, leva mais que o tempo real e re-encoda com perda. Fazer certo é decode
  e encode intercalados por GOP, cientes de keyframe: editor de vídeo, não
  função. Reabre só com consumidor real trazendo duração máxima, resolução e
  tolerância de espera.
- **Widget redimensionável pelo usuário** ficou fora da camada de utilities:
  largura em pixel vinda de drag não convive com track de grid. Quem precisa usa
  `Resizable` numa área livre, ou guarda o span escolhido.
