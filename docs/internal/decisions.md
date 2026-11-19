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
- **Sem Changesets.** Pipeline tag-push: `make release TAG=X` abre o PR,
  `make release-tag TAG=X` taggeia depois do merge.
- **A tag nasce depois do merge, no commit da `main`** (#472). Até a 0.78.0 o
  `release.sh` empurrava a tag da branch de release antes do merge e o guard
  aceitava qualquer commit — publicar código não revisado era o fluxo normal. O
  `check-release-ref.sh` agora reprova commit que não é ancestral de
  `origin/main`. Única exceção: backport abaixo do `latest` do registry, de
  `origin/release-<maj>.<min>` (o nome do dist-tag), e só para esse dist-tag —
  branch de manutenção nunca publica em `latest`/`next`. Prerelease também sai só
  da `main`. Alternativas rejeitadas: só-`main` sem exceção (mataria o dist-tag
  `release-<maj>.<min>` que a #472 acabou de criar) e qualquer branch `release-*`
  para qualquer versão (abriria `latest` a quem empurra numa branch sem PR).
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
- **Condição `"node"` só para as folhas de componente também foi rejeitada**
  (#556, medido em 02/11/2026 sobre o tarball da `main`, Vitest 4.1.12, Vite 8,
  Node 24.15.0). No `exports` não faz nada: o `*.module.js` importa a folha por
  caminho relativo, e condição de `exports` não se aplica a ele. Pelo campo
  `imports` (`#tempest-css/*` → vazio sob `node`) resolve Vitest sem plugin, Node
  sem loader e SSR externalizado, com build de cliente idêntico — mas o Vitest com
  `tempestVitest()` e `css: true` passa a carregar **zero** folhas (126 → 0
  `<style>`), sem erro. Trocar a falha barulhenta (`Unknown file extension ".css"`)
  por estilo sumido em silêncio é pior; o caminho é o plugin, com o `tempest doctor`
  avisando e o `scripts/smoke-vitest.sh` exigindo a falha sem ele. Reabre se o
  Vitest deixar de aplicar `node` a dependência inlined em ambiente DOM.
  Como reproduzir: `npm pack`, instalar o `.tgz` num projeto descartável com
  `vitest@^4 happy-dom vite@^8`, aplicar o `imports` e reescrever as importações
  em `node_modules/tempest-react-sdk/dist/**/*.module.{js,cjs}`; contar
  `document.querySelectorAll("style")` num teste que renderiza `Button` com
  `css: true`, e comparar o `sha256sum` do CSS de `npx vite build` de um app que
  importa só `Button`, antes e depois.
- **`noUncheckedIndexedAccess` fica desligado.** Medido em 29/08/2026: 221 erros
  no `src/`, 168 deles em `components/`; amostrados, são acessos dentro de laço
  limitado pelo próprio `length` ou protegidos por invariante já defendida.
  Adotar trocaria 221 guardas reais por 221 `!` — o operador que a flag existe
  para evitar. A **varredura** valeu como auditoria (achou paleta vazia em
  `quantizeScale`/`thresholdScale`, que virou `throw`); repetir a varredura vale,
  ligar a flag não. Na mesma passada: `noImplicitReturns` 1 erro (adotado),
  `exactOptionalPropertyTypes` 113 (muda o `.d.ts` do consumidor),
  `noPropertyAccessFromIndexSignature` 1130.

## Mapa de ruas a partir do GPS (#667)

- **O mapa é híbrido: OpenStreetMap como base, GPS da frota como camada viva.**
  Nome de rua, número e ruas por onde ninguém passou não saem de posição; saem
  de cadastro, e o cadastro livre é o OSM (já usado por `createOSRMBackend` e
  `tileUrl`). Decidido na fase 0 (19/11/2026), medindo com
  `node scripts/bench-gps-map.mjs` sobre o dataset de Kubicka et al. (Zenodo
  57731, CC BY-SA 4.0): 100 trajetos reais, 247 251 fixes, rota verdadeira e
  trecho de rede do OSM por trajeto.
- **Sem filtro de Kalman no rastro.** Distância do GPS cru até a rua percorrida:
  mediana 3,7 m, p90 32,5 m, p99 188 m. Um Kalman de velocidade constante, só
  para a frente (o mapa ao vivo não olha adiante), em 12 combinações de ruído
  (σ medição 5/10/20 m × σ aceleração 0,5/1/2/4 m/s²), **nunca** melhorou: a
  melhor iguala o cru (mediana 3,7 m), as outras pioram até 5,7 m — o receptor
  já suaviza, e o filtro só atrasa na curva. O erro que importa é a cauda, e ele
  não mexe nela. A limpeza do rastro fica em rejeição de outlier e simplificação.
- **O ganho está no map-matching (HMM, Newson & Krumm 2009).** Encaixar cada fix
  na rua mais próxima acerta a rua da rota em 85,7% dos fixes: um em cada sete
  cai na rua errada. É o problema que o HMM resolve, e é a fase seguinte.
- **9,4% dos fixes ficam a mais de 20 m de qualquer rua do trecho** — o sinal
  bruto de "rua que a base não tem", misturado com estacionamento e erro de GPS.
  Separar os dois é trabalho da inferência no backend, não do SDK.
- **Validar no Brasil antes da fase de backend:** só 1 dos 100 trajetos tem
  centroide no Brasil. Reabre a decisão do Kalman se rastros brasileiros (cânion
  urbano, aparelho de entrada) mostrarem outro perfil de erro.
- **Fase 2 entregue: HMM no SDK, padrões por medição** (19/11/2026,
  `npm run build && node --expose-gc scripts/bench-map-matching.mjs`, mesmo dataset).
  `matchToRoads` acerta a rua em **92,33%** das 247 251 posições (contra 85,7% do encaixe
  ingênuo), **98,53% nos 97 trajetos sem a marca `hives`**, mediana por trajeto 99,9% e 88 de 100
  trajetos ≥ 97%; recupera 99,27% do comprimento da rota com 0,78% a mais; 48 quebras; 8,1 µs por
  posição (Node 24, i9-13900F). A meta de 97% passa fora dos `hives` e não passa no total: os
  trajetos 33 e 54 (25 157 posições, 10% do dataset) andam por pátios sem rua no recorte do OSM e
  acertam 18% e 43% — nenhum parâmetro os salva, e é o mesmo sinal de "rua que a base não tem" da
  fase 4.
- **Padrões: σ 7 m, β 3 m, raio 200 m, k 16 ruas, desvio máximo 100 m, `lag` 5.** Varridos raio ×
  k, σ × β e desvio, com a tabela inteira impressa. Raio 50 m deixava 7,2% das posições sem
  candidata (`null`); k 4 multiplicava as quebras por 9 (48 → 416); desvio 1000 m custava 2,5× o tempo sem ganho. σ 7
  descarta mais posições paradas (pré-filtro de `2σ`) e foi o mais estável entre os β. O ao vivo
  com `lag` 5 fica a 0,1 pp do lote; `lag` 0 perde 3,3 pp.
- **Posição descartada pelo pré-filtro volta projetada na aresta da anterior** (`inferred: true`),
  não `null`: o veículo andou menos que o ruído, então aquela aresta é a resposta honesta. Tirar o
  pré-filtro piora (98,53% → 96,97% sem `hives`) e dobra o tempo.
- **Rejeição de outlier e Douglas–Peucker ficaram fora da fase 2.** Rejeitar posição com
  velocidade implícita acima de 40/50/70 m/s antes do HMM mexeu ±0,05 pp (o modelo já absorve o
  outlier pela transição); simplificar reduz amostra, que é o oposto do que o matcher quer. As duas
  servem ao envio para o backend (fase 3), e entram lá, medidas contra o que economizam de rede.
- **Desempenho no aparelho: medido em desktop, não em celular.** Grafo de 16 mil arestas: 8 ms e
  ~1 MB; o maior do dataset (307 mil): 68 ms e 47 MB — por isso o grafo vem em tiles. Uma hora a
  1 Hz: 11 ms, ~30 MB transitórios; ao vivo, ~3 µs por posição.

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
