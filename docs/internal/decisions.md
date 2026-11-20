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

- **`size-limit` 14 mede com o plugin de esbuild, não com o preset**
  (`@size-limit/esbuild` + `@size-limit/file`, auditoria de 20/11/2026). O
  `@size-limit/preset-small-lib` 14 trocou o esbuild pelo rolldown, e as 61
  checagens mediram, sobre o mesmo `dist` da `main` em `3576adc`, números que não
  medem a mesma coisa: o rolldown recusa CSS (`UNSUPPORTED_FEATURE`, rolldown#4271),
  então as checagens de folha passam a medir o arquivo cru em vez do minificado
  (`utilities.css` 1 360 → 3 451 B), e as de JS mudam de −25 kB (barrel CJS
  202 195 → 177 149) a +11 kB (`{ IconPicker }` 23 947 → 35 067) e +89 kB
  (`br entry` 544 536 → 633 323) sem uma linha do SDK mudar. Além disso o
  `@size-limit/rolldown` pede `rolldown ^1.2.15`, e o `overrides.rolldown` 1.2.14
  (que segura o `core.css`) o forçaria para fora da faixa. Com o plugin de esbuild,
  as 61 checagens dão **o mesmo byte** que no 13. **Reabre quando** o
  `overrides.rolldown` sair e alguém quiser trocar de método de propósito: aí
  remede tudo e reescreve os tetos num PR só disso.

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
  urbano, aparelho de entrada) mostrarem outro perfil de erro. Validado com rastros
  públicos do OSM em 19/11/2026 (ver "Validação no Brasil" abaixo): **não reabre**.
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
- **Validação no Brasil: o Kalman continua fora e os padrões do matcher ficam** (19/11/2026,
  `npm run build && node scripts/bench-br-osm.mjs [cache-dir]`, ~15 s com cache). Rastros GPS
  públicos do OSM e a rede de ruas do OSM via Overpass (© OpenStreetMap contributors, ODbL), em
  cinco recortes de 2–4 km registrados no script: centro de São Paulo e do Rio (cânion urbano),
  Teresina (capital média), São Carlos e Parnaíba (cidades menores). Corridas com velocidade
  mediana < 3 m/s saem como a pé/bicicleta: ficam 161 de 179, 19 806 posições, 218 km. Sem rota
  verdadeira, as medidas são indicadores:
  - **Distância à rua mais próxima:** 94,5% / 99,0% das posições a ≤10 / ≤20 m de qualquer rua
    (Kubicka: 85,8% / 90,6%), mediana 2,9 m, p90 8,0 m, p99 19,5 m. O recorte de centro é denso —
    um ponto sorteado no recorte já cai a ≤10 m de rua em 34,5% das vezes —, então a comparação só
    diz que o perfil brasileiro **não é pior**. A cauda de cânion existe e é pequena: p99 de 62 m
    no centro de São Paulo, concentrada nas corridas lentas; nas corridas a ≥ 6 m/s de lá, 98,2% a
    ≤10 m.
  - **Kalman:** nas 12 combinações da fase 0, filtrar nunca melhora — nem a distância à rua, nem a
    distância posição → ponto encaixado (cru: mediana 3,7 m, p90 11,6 m; o melhor filtro empata, o
    pior vai a 4,6 / 16,5 m), nem as quebras. Mesmo resultado do Kubicka.
  - **`matchToRoads` com os padrões:** 100% das posições encaixadas, mediana posição → ponto
    encaixado 3,7 m (Kubicka, posição → rota verdadeira: 3,7 m), 0 ping-pong entre ruas paralelas e
    0,11 troca para rua paralela por km de trecho reto — as 13 listadas pelo script são pista dupla
    da mesma avenida, elevado × túnel × superfície (o GPS não separa nível) e dois casos em área de
    calçadão.
  - **Quebras:** 1,06 por 1000 posições (Kubicka: 0,19), mas 0,05 com todas as ruas em mão dupla e
    0,34 só nas corridas a ≥ 6 m/s: a quebra é contramão em centro de 65–76% de mão única
    (bicicleta que passou do corte de 3 m/s, ou `oneway` errado no OSM), não o modelo.
  - **Amostragem esparsa:** 35% dos intervalos passam de 1,5 s, e os traços nativos a 2 s
    (Teresina, Parnaíba) encaixam sem quebra. Raleando as corridas de 1 Hz para 5 / 10 / 30 s,
    contra o encaixe denso da mesma corrida: mesma via em 94,9% / 93,6% / 89,8%, rota recuperada
    98,6% / 97,2% / 89,8%, quebras 5,7 / 10,1 / 24,2 por 1000. Desvio máximo de 1000 m divide as
    quebras por ~3 e quintuplica a rota a mais (1,3% → 6,1% a 5 s). O padrão de 100 m fica
    (calibrado e certo a 1 Hz); para fonte esparsa, ver "Fonte esparsa: desvio que cresce com o
    intervalo" abaixo.
  - **55% das posições saem `inferred`:** o pré-filtro de `2σ` (14 m) a 1 Hz descarta toda posição
    abaixo de ~50 km/h, e o trânsito de centro é lento. É o comportamento decidido, não defeito.
  - **Limite:** amostra pequena e desigual — São Carlos tem 63% das posições; Teresina, um traço
    (740 posições); Rio, 10 corridas. Quem sobe traço no OSM é mapeador, com aparelho bom e muitas
    vezes log a 10 Hz suavizado (reamostrado a 1 Hz pelo script): o perfil "aparelho de entrada" da
    frota **não** está coberto. A decisão reabre com rastro real da frota.
- **Fonte esparsa: desvio que cresce com o intervalo** (20/11/2026). A posição passa a aceitar
  `timestamp` (`RoadFix`; `TrackPoint` serve), e com tempo nas duas posições o limite vira
  `maxDetourM + detourPerSecondM · min(Δt, maxIntervalS)`, padrões **2 m/s e 60 s**. Sem tempo, o
  limite é o fixo de antes, idêntico (teste). Vale no `matchToRoads`, no `createRoadMatcher` e no
  `LiveRouteMap` com `roads` (vehicle e trail repassam o `timestamp`). Medido com
  `npm run build && node --expose-gc scripts/bench-map-matching.mjs [cache-dir]` (Kubicka, cada
  trajeto raleado pelo próprio relógio, contra a rota verdadeira) e
  `npm run build && node scripts/bench-br-osm.mjs [cache-dir]` (Brasil, contra o encaixe denso
  da mesma corrida), Node 24, máquina carregada (tempos ~2× os da fase 2):
  - **A causa das quebras esparsas não é o limite fixo, é contramão.** Com todas as ruas em mão
    dupla, o padrão antigo quebra 0,3 / 0,6 / 5,2 vezes por 1000 posições a 5 / 10 / 30 s (contra
    5,7 / 10,1 / 24,2). O desvio de 1000 m "resolve" essas quebras inventando a volta no quarteirão
    para respeitar a mão única — é daí que vem a rota a mais de 6,1%. Nenhuma folga separa as duas
    coisas; o que se pode é não inventar a volta onde as posições são densas.
  - **Forma escolhida: soma** (`maxDetourM + v·Δt`). Varridas também `max(linha reta + desvio,
    v·Δt)` (teto físico de velocidade: 20 m/s dá 5,1 quebras e 2,2% a mais a 5 s) e folga só acima
    de 2 s (5,4 e 1,9%): mesma fronteira quebras × rota a mais, com um parâmetro a mais. β escalado
    com Δt não mexe nas quebras (5,7 / 10,1 / 24,2). A soma é a proposta do #667, com um parâmetro.
  - **Taxa 2 m/s:** a maior que não piora o 1 Hz com tempo (Kubicka 92,33% / 98,53% / 99,27% /
    48 quebras → 92,34% / 98,54% / 99,30% / 43); 3 m/s perde 0,05 pp; 15 m/s perde 2,3 pp (os
    `hives`). Brasil, todas as corridas, 5 / 10 / 30 s: quebras 5,7 → 5,4, 10,1 → 8,9, 24,2 → 13,8;
    rota a mais 1,3% → 1,6%, 1,4% → 1,9%, 3,6% → 4,4% (meta de ≤ +1,5 pp a 5 s: +0,3); mesma via
    95,0% → 95,0%, 93,7% → 93,7%, 89,6% → 90,1%. **Corridas a ≥ 6 m/s: 0,8 / 1,5 / 9,3 → 0 / 0 / 0
    quebras**, rota a mais +0,7 / +0,6 / +0,3 pp. 10 m/s corta mais quebras (4,7 a 5 s) mas leva a
    rota a mais a 2,8% (+1,5 pp, no limite) e 3,1% a 10 s.
  - **Teto de 60 s:** sem teto, os buracos longos que os trajetos de 1 Hz já têm custam 0,2 pp
    (92,13%); com 30 s perde-se o ganho a 30–60 s. Kubicka 30 / 60 / 120 / 300 s, quebras
    71 → 38, 207 → 70, 372 → 180, 385 → 298; rota recuperada 97,75% → 98,25%, 90,87% → 94,98%,
    72,05% → 83,23%, 34,44% → 44,79%; rua certa nunca abaixo do padrão antigo por mais de 0,07 pp.
  - **Quebrar a cadeia acima de uma lacuna máxima piora tudo**: medido com corte em 60 s, as
    quebras do Kubicka a 1 Hz vão de 48 a 258 e a rota recuperada a 120 s cai a 13%. Não entrou.
  - **Custo:** a 300 s, 1378 → 1545 µs por posição (+12%) e pico de heap por chamada igual
    (2,4 MB); a 1 Hz dentro do ruído. O teto limita a folga a 120 m, então o Dijkstra cresce no
    máximo isso além do que a linha reta já pedia.
  - **Limite:** o raleamento é sintético (corrida densa com amostras tiradas), não fonte esparsa
    real; o aparelho de entrada da frota continua não coberto. Reabre com o envio em lote real da
    fase 3.
- **`LiveRouteMap` encaixa com `roads`, e o matcher é import dinâmico** (19/11/2026). Uma prop
  só (o grafo) em vez de o app chamar o matcher: o app passa a posição crua e recebe o encaixe por
  `onMatch`. O matcher entra por `import()` porque estático custaria +3,7 kB brotli a todo
  `LiveRouteMap` (4,67 → 8,42 kB); dinâmico, quem não passa `roads` paga +0,66 kB (5,33 kB). Sem
  rua a até `radiusM`, o veículo fica na posição crua com anel tracejado — nunca some, e não há um
  segundo limiar de distância inventado: o do modelo (200 m) é o que decide.

## Telemetria: `device_model` (#657)

- **O teto de 40 caracteres e a allowlist de caracteres ficam como estão.** A auditoria run-16
  perguntou se um teto menor, ou exigir dígito/hífen, barraria um nome curto
  (`Alice Souza CPF 12345678900`, 27 caracteres). Medido em 19/11/2026 sobre a lista de aparelhos
  suportados do Google Play (54 581 linhas, 44 809 modelos distintos que passam a allowlist):
  teto 30 derruba 41 modelos reais, teto 24 derruba 251, teto 40 derruba 1
  (`HP Engage One Essential All-in-One System`); exigir dígito derruba 4 334 (`ADMIRE SHINE`),
  dígito ou hífen 4 108. Modelo real também é texto livre (`HTC Sensation XE with Beats Audio
  Z715a`, 39), então nenhuma forma separa um nome com número de um modelo sem perder aparelho real
  em todo relato. O valor depende de o navegador/WebView o escrever e só vai ao endpoint de erro
  do próprio app. Reabre com um fato novo: um WebView real que escreve dado pessoal no modelo.
  Como reproduzir: baixar `https://storage.googleapis.com/play_public/supported_devices.csv`
  (UTF-16, coluna `Model`), filtrar pelo `DEVICE_MODEL` de `src/telemetry/device-facts.ts` e
  contar por comprimento e por presença de `[0-9]` / `[0-9-]`.

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
