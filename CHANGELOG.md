# Changelog

Todas as mudanças notáveis seguirão [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Adicionado

- **`compactOnMobile` no `Pagination`**
  ([#254](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/254)).
  Abaixo de 640px o componente escondia os números por CSS, sem opt-out. Isso
  troca navegação **aleatória** por **sequencial**: chegar na página 7 vira seis
  toques em "próxima" em vez de um toque no `7` — e é justamente no celular que a
  capacidade importa mais num app mobile-first.

  ```tsx
  <Pagination page={page} totalPages={23} onPageChange={setPage} compactOnMobile={false} />
  ```

  Com `false`, os números ficam em qualquer largura. **O opt-out traz o próprio
  layout junto**: a faixa de controles rola sozinha na horizontal
  (`overflow-x: auto`) e a página atual é trazida para a área visível a cada
  mudança. Só desligar o `display: none` empurraria nove botões para além de um
  viewport de 360px e daria barra horizontal ao documento inteiro — medido em
  browser real: com o container forçado a 200px a faixa rola 114px por dentro e o
  documento continua sem overflow.

  Default inalterado (`true`), e acima de 640px nada muda nos dois modos.

- **Entradas de CSS por componente e por grupo**
  ([#239](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/239)).
  O JavaScript que o consumidor importa é tree-shaken; **o CSS não**. Quem
  importava `tempest-react-sdk/styles.css` baixava os ~150 componentes, usando
  treze ou usando todos.

  ```ts
  import "tempest-react-sdk/styles/core.css"; // reset + tokens — sempre necessário
  import "tempest-react-sdk/styles/Button.css";
  import "tempest-react-sdk/styles/forms.css"; // ou uma família inteira
  ```

  Medido num app Vite real montando os mesmos doze componentes:

  | Import                      | raw          | gzip        |
  | --------------------------- | ------------ | ----------- |
  | `styles.css`                | 236,71 kB    | 35,38 kB    |
  | `core.css` + 7 grupos       | 155,43 kB    | 23,38 kB    |
  | `core.css` + 12 componentes | **38,94 kB** | **7,70 kB** |

  **−78%**, ou −27,7 kB gzip em todo primeiro carregamento — o número que o
  relator mediu no PWA dele. A granularidade por grupo, medida no mesmo app,
  recupera só 34%: o app usa 3 dos 25 inputs e pagaria os 25. As duas formas
  ficam disponíveis; a fina é a que entrega.

  Publicado como **um** padrão de subpath (`"./styles/*.css"`), não como 125
  entradas — granularidade fina sem 125 caminhos presos por semver.
  `styles.css` continua existindo, inalterado, para quem prefere uma linha só.

  **A divisão é exata, não uma poda.** Cada classe é hasheada por módulo CSS
  (`tempest_[local]_[hash]`) e cada `dist/**/*.module.js` carrega o caminho de
  origem junto dos nomes que aquele módulo declara, então atribuir uma regra a um
  componente é consulta, não palpite. Das 1632 regras da folha, **zero** nomeia
  classes de dois módulos — e o build falha se alguma passar a nomear, ou se um
  componente novo não cair em grupo nenhum.

  `core.css` (3,1 kB brotli) traz reset, tokens, tipografia, motion, densidade,
  responsividade e impressão. Nenhuma folha de componente repete isso, então ele
  é obrigatório junto de qualquer outra.

- **`onParseError` em `createWebSocket`, `useWebSocket` e `createEventStream`.**
  Quando o frame não é JSON e nenhum `parser` foi passado, o callback recebe o
  erro e o frame cru, e a mensagem **não** é entregue. Sem o callback, o
  comportamento anterior continua — a string crua entregue como se fosse o seu
  tipo — mas um build de desenvolvimento agora avisa uma vez por transporte que
  isso aconteceu.

- **`createLinkStatsSampler`, `useLinkStats` e `readRoundTripMs` — a redução de
  `getStats()` que toda chamada reescreve**
  ([#232](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/232)).

  `RTCPeerConnection.getStats()` devolve dezenas de entradas com contadores
  **cumulativos**, e o badge que a chamada mostra — `1,2 Mbps · 42 ms · 1080p60` —
  é uma redução em cima disso. Cada cópia dessa redução erra os mesmos dois
  pontos.

  **RTT do par errado.** Uma conexão mantém vários pares de candidatos vivos ao
  mesmo tempo — host, server-reflexive, relayed — e só um carrega tráfego. Ler o
  primeiro `candidate-pair` com `state: "succeeded"` faz o número saltar entre
  caminhos que não estão sendo percorridos: 8 ms do par host ocioso alternando
  com 180 ms do TURN que está trabalhando. `readRoundTripMs` lê o par que o
  `transport` nomeia em `selectedCandidatePairId`, com o par `succeeded` só como
  fallback — porque nem todo browser preenche o campo, e perder a leitura é pior
  que uma leitura às vezes otimista.

  **Vazão sem delta.** `bytesSent` é cumulativo desde que a conexão abriu.
  Dividir pelo tempo de sessão dá a média histórica, um número que só desce e
  nunca mostra o agora. O sampler guarda a leitura anterior e deriva a taxa do
  delta — é por isso que é um objeto e não uma função, e por isso vale **um por
  conexão**: compartilhar entre peers subtrai o contador de uma conexão do de
  outra.

  Bytes somam entre todos os senders, porque um peer publicando câmera e tela
  ocupa **um** uplink com as duas, e o uplink é o que acaba. Resolução e fps vêm
  do stream de **maior área**, que é o que domina essa banda.

  `useLinkStats(pc)` amostra a cada 2 s, só enquanto `connectionState` é
  `"connected"`, e para quando a aba vai para segundo plano. Voltar do segundo
  plano refaz o baseline antes da próxima amostra: sem isso o primeiro sample
  divide cinco minutos de bytes por cinco minutos e reporta a média de um período
  que ninguém perguntou. A última leitura sobrevive à pausa em vez de voltar a
  `null`, porque um badge que apaga a cada troca de aba é lido como conexão
  caída.

  O que varia entre engines está coberto e documentado: `mediaType` em vez de
  `kind` no Chrome antigo, `framesPerSecond` ausente, contador que reinicia num
  ICE restart (delta negativo vira `0` e o baseline se refaz), simulcast somando
  camadas. E `docs/webrtc.md` ganhou a seção **"O que isto não mede"** — inbound,
  `qualityLimitationReason`, perda/jitter e o afogamento de timer em aba de
  fundo — para quem precisa desses números saber onde procurar em vez de
  descobrir que o valor estava mentindo.

- **Entrada `checkbox` no `DropdownMenu`**
  ([#244](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/244)).
  `type: "checkbox"` renderiza `role="menuitemcheckbox"` com `aria-checked`, que é
  como um leitor de tela anuncia "marcado" em vez de deixar o estado invisível.
  Antes não havia onde declarar estado: um item que liga/desliga algo virava
  `"item"` comum, e o `aria-pressed` que o botão solto tinha se perdia na
  migração para o menu.

  Alternar **não fecha** o menu — ajustar duas preferências seguidas é o caso
  comum, e fechar após a primeira transformaria a segunda numa segunda viagem.
  `"item"` continua fechando, como sempre.

  A união já era discriminada por `type`, então a variante é aditiva: nenhum
  consumidor quebra.

- **`municipalitiesByUf`, `administrativeRegionsByUf`, `resolveMunicipality`,
  `datasetVintage` e `pendingGeometryIds` em `/br`.** O código IBGE é o que se
  guarda; o nome é o que se exibe.

  ```ts
  resolveMunicipality("RN", "Serra Caiada")?.id; // "2410306" — nome atual
  resolveMunicipality("RN", "Presidente Juscelino")?.id; // "2410306" — nome antigo
  resolveMunicipality("SP", "sao paulo")?.id; // "3550308" — sem acento
  resolveMunicipality("DF", "Ceilândia")?.id; // "5300108" — região administrativa
  ```

  As 53 formas antigas não foram escritas à mão: o gerador as extrai comparando a
  safra anterior com a nova pelo código que as duas compartilham, e acumula a
  tabela a cada regeneração. É o que faz um endereço salvo há cinco anos continuar
  apontando para o mesmo lugar.

- **`municipalityId` na seleção do `BrazilStateCitySelect`.** Aditivo:
  `onChange` passa a emitir `{ uf, city, municipalityId }`. Uma região
  administrativa do DF emite o código de Brasília, então **toda** seleção
  geocodifica.

- **`datasetVintage()` e `pendingGeometryIds()` expõem a lacuna em vez de
  escondê-la.** O IBGE publica município novo antes da malha dele: hoje Boa
  Esperança do Norte (MT), instalado em 2023, é listado e selecionável e é o único
  que `geocodeMunicipality` não posiciona. O teste fixa essa lista — quando ela
  crescer sem alguém decidir, a build falha.

- **`ApiError.fields` passou a ler o campo culpado dos envelopes que um backend
  Tempest manda**
  ([#252](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/252)).
  O índice só se preenchia da lista `detail: [{ loc, msg }]` do FastAPI cru —
  exatamente a forma que um backend sobre `tempest-fastapi-sdk` deixa de mandar
  assim que assume os próprios handlers: ele nomeia o campo numa chave ao lado da
  mensagem. Então os dois envelopes que este SDK existe para consumir acertavam a
  mensagem e derrubavam o campo no chão, e todo formulário voltava a fazer cast
  de `error.body` e a parsear prosa — que é exatamente o que `fields` foi criado
  para acabar.

  ```json
  { "detail": "Value error, … for field 'phone' in 'body'", "field": "phone" }
  { "detail": { "detail": "Cidade não encontrada…", "field": "city" },
    "code": "VALIDATION_ERROR", "details": { "field": "city" } }
  ```

  As duas agora chegam em `fields`, com a mesma frase que vira `detail`.
  Precedência: a lista primeiro e autoritativa (um app sem handler de
  `RequestValidationError` ainda responde um 422 de schema com ela), depois
  `detail.field`, `field` e `details.field` — `details` por último porque é saco
  de contexto livre, cujo `field` pode não ser input nenhum na tela. Campo nomeado
  sem mensagem legível não produz nada: o único texto restante ali seria o
  sintético, e `{ phone: "Erro 422" }` num input é ruído, não mensagem de erro.

  **Muda comportamento:** `describeApiError` suprime `detail` sempre que `fields`
  está setado, então erro de negócio que nomeia campo passa a exibir a frase de
  validação no toast em vez da própria frase pt-BR. Ela não se perde — vai para o
  input de que fala, que é onde serve mais. Três saídas, em ordem de preferência:
  `codes: { VALIDATION_ERROR: "…" }`, `validation: error.detail` no call site, ou
  ler `error.detail`, que segue intocado.

- **`useFullscreen` — estado dirigido pelo evento, não pela sua chamada**
  ([#235](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/235)).
  Flag de modo imersivo guardada em estado e virada dentro de `enter()`/`exit()`
  erra na primeira vez que alguém aperta `Esc`. O browser também sai do fullscreen
  pelo próprio botão e pelo F11 apertado no meio de uma sessão de API, e nenhum
  desses caminhos passa pelo seu código — então o botão segue oferecendo "sair"
  sobre uma página que já está em janela. O hook lê `fullscreenchange` (mais
  `webkitfullscreenchange`, ainda o único par a que o Safari responde) e nunca
  deixa os callbacks de ação tocarem o estado.

  ```tsx
  const { isFullscreen, supported, enter, exit, toggle } = useFullscreen(videoRef);
  ```

  `enter()` propaga a recusa do browser em vez de engoli-la: pedido fora de gesto
  do usuário é rejeitado com `TypeError`, e um botão que não fez nada precisa
  poder dizer por quê. `exit()` resolve quieto quando nada está apresentado,
  porque o Chrome rejeita ali e um toggle correndo com um `Esc` não é erro sobre o
  qual o caller possa agir. `supported` é checagem real de capacidade: documento
  dentro de `<iframe>` sem `allowfullscreen` ships os métodos e recusa toda
  chamada, o que só `fullscreenEnabled` reporta de antemão.

  A assinatura do evento não é nova — `usePortalHost` já a abria para decidir onde
  montar um overlay com fullscreen ligado. Ela mudou de casa para
  `use-fullscreen-element.ts` e responde "qual elemento está apresentado" uma vez
  só, em vez de manter duas cópias da dança de prefixo e dois lugares para
  corrigir a próxima esquisitice. É módulo próprio, e não vizinho do hook, para o
  grafo de `Modal`/`Drawer`/`Toast` não alcançar `useFullscreen` estaticamente —
  nada que um bundler precise provar morto.

### Corrigido

- **`registerServiceWorker` não avisava quando o worker novo já estava em
  `waiting`**
  ([#253](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/253)).
  A detecção de update era só o evento `updatefound`, que cobre o worker que
  instala **com a aba aberta**. O caso comum não gera evento nenhum: o usuário
  abriu o app depois do deploy (o worker instalou e foi para `waiting`), fechou a
  aba, e voltou depois. Nessa segunda visita o `install` já aconteceu, então
  `onUpdate` nunca disparava e a atualização ficava parada com o worker velho no
  controle — indefinidamente, porque toda visita seguinte é igual.

  `registration.waiting` passa a ser lido assim que o registro resolve, pelo mesmo
  caminho do evento. Os dois deduplicam por **identidade do worker**, então a
  sessão em que o deploy cai com a aba aberta anuncia uma vez só, e um segundo
  deploy na mesma sessão — que é outro `ServiceWorker` — ainda anuncia. Sem
  `controller` nada dispara: isso é primeira instalação, terreno do `onReady`.

  `useServiceWorkerUpdate` herda a correção sem mudar nada, e o flag `asked` que o
  consumidor mantinha à mão deixa de ser necessário.

- **14 links da sidebar da gallery não iam a lugar nenhum.** As seções `chat`,
  `aichat`, `markdown`, `masonry`, `tour`, `transfer`, `filterbar`, `codeblock`,
  `qrcode`, `sparkline`, `bar-list`, `audio-capture`, `device-capture` e
  `br-payments` renderizavam um fragmento React em vez do
  `<section className="gallery-section" id="…">` que as outras 48 usam, então o
  `#id` que o registry anuncia não existia no DOM e clicar no item não movia a
  página. Cada uma passou a ter o elemento âncora e um `<h3>` com o rótulo do
  registry — o que também torna a seção identificável numa captura. O mesmo vale
  para `dashboard-layout`, cujo id vivia no `<Example>` interno.

- **Paleta vazia em `quantizeScale` e `thresholdScale` devolvia `undefined`
  anunciado como `string`.** As duas indexavam em `-1` quando a paleta não tinha
  cor alguma, e o resultado chegava ao DOM como `fill="undefined"`: mapa em
  branco, nada reportado. Agora lançam na **construção** da escala, que é onde o
  engano está — normalmente uma paleta saída de um `.filter()` ou de um `.slice()`
  com o índice errado. `interpolatePalette` já tinha essa guarda; as outras duas
  não.

- **`string` deixou de ser tipada como `T` no caminho de mensagem.** Os três
  transportes tinham cópias idênticas de um parser que, no `catch`, fazia
  `return raw as unknown as T`. A falha nunca aparecia no parse — aparecia no
  primeiro acesso a propriedade, longe dali. Uma cópia só agora, em
  `utils/json-frame.ts`, com o aviso e o `onParseError` acima.

- **Quatro `as unknown as BufferSource` no cliente WebAuthn** que o compilador não
  pedia: `base64UrlToBytes` devolve `Uint8Array<ArrayBuffer>`, que já **é** um
  `BufferSource`. Asserção dupla desnecessária desliga a checagem exatamente ali.

- **Overlay portado para `document.body` era invisível e inalcançável com a
  página em tela cheia**
  ([#243](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/243)).
  Em tela cheia o browser pinta **apenas a subárvore do elemento em tela cheia**,
  e `body` está fora dela. O diálogo existia no DOM, com caixa medida, e não era
  visto nem clicado — `elementFromPoint` no centro dele devolvia o que estava
  atrás. Nada lançava, nada aparecia no console: a aplicação ficava com um
  diálogo aberto que o usuário não via, e `Escape` também não chegava, porque o
  foco estava fora do elemento em tela cheia.

  O alvo do portal passou a seguir `document.fullscreenElement`
  (mais `webkitFullscreenElement`), com `document.body` como padrão. Corrigido de
  uma vez nos seis pontos que portam: `Modal`, `Drawer`, `BottomSheet`,
  `ToastProvider`, `Command` e o `<Portal>` público — o defeito era do formato do
  portal, não de um componente.

  O host é **estado** e escuta `fullscreenchange`, então entrar ou sair de tela
  cheia com um diálogo já aberto **move** o diálogo em vez de deixá-lo para trás.
  `<Portal container={…}>` continua fixando o alvo e ignorando a tela cheia.

  O primeiro valor é resolvido durante o render, não no efeito, para o overlay
  montar no mesmo commit em que montava antes.

  Fixado nas duas camadas: `portal-host.test.tsx` cobre qual host é escolhido, e
  `e2e/fullscreen.spec.ts` cobre a parte que só um browser real responde — que o
  overlay é de fato pintado e clicável. Revertido contra a implementação
  anterior, o teste de browser falha com `Expected: true / Received: false`.

- **`role="menu"` sem o teclado que o papel promete**
  ([#244](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/244)).
  O menu abria e o foco ficava no gatilho; `ArrowDown` não movia nada. Quem usava
  teclado descobria por tentativa que ali `Tab` fazia o papel da seta, porque as
  entradas saíam com `tabIndex: 0`. Não era inacessível — era **fora do padrão**,
  que é pior: o widget parece funcionar e contradiz o que anunciou.

  O modelo agora é o
  [APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/):
  `Enter`/`Space`/`↓` abrem focando a primeira entrada e `↑` a última; `↑`/`↓`
  percorrem com wrap; `Home`/`End` vão às pontas; `Esc` fecha e **devolve o foco
  ao gatilho**; `Tab` fecha e deixa a ordem da página seguir. Foco gerenciado —
  `tabIndex: -1` nas entradas, `0` na ativa.

  **Por que as setas sumiam num app real:** o handler vivia num listener de
  `keydown` no `window`, e qualquer `stopPropagation` no caminho o engolia. Agora
  o teclado é tratado na própria lista, para onde o foco entrou — as teclas
  chegam por bubbling e não há listener global a ser pré-empteado.

  Os testes de seta que existiam **passavam com o componente quebrado**: eles
  disparavam em `window`, o que pula a pergunta de se o foco chegou ao menu. Foram
  reescritos para `userEvent.keyboard`, que envia a tecla a quem tem o foco. Nove
  dos doze casos novos falham contra a implementação anterior.

  O foco do gatilho é recuperado pelo `aria-haspopup` que o componente coloca
  nele, não por `ref`: `ref` mora em lugares diferentes no React 18 e 19, e um
  trigger custom não é obrigado a encaminhar um.

- **O reset descentralizava ícone em botão do consumidor**
  ([#241](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/241)).
  `styles.css` torna todo `svg` uma caixa de bloco — regra padrão de reset
  moderno, e ela está certa. O efeito colateral não é nos componentes do SDK, que
  centralizam por conta própria: é no `<button>` que **você** escreve. O
  user-agent centraliza conteúdo de botão com `text-align: center`, que só
  alcança caixa inline, então um ícone sozinho encostava na borda esquerda —
  medido em **12 px** num botão de 44 px com ícone de 20 px, exatamente
  `(44 − 20) / 2`.

  O sintoma não apontava para a causa: o botão irmão com uma letra continuava
  centralizado, o que faz parecer defeito do ícone e não do reset.

  O contrapeso vai junto do reset, com **especificidade zero**:

  ```css
  :where(button, a, label, summary) > svg:only-child {
    margin-inline: auto;
  }
  ```

  `:where()` para qualquer regra sua ganhar dela sem `!important`;
  `margin-inline` em vez de trocar o `display`, que relayoutaria todo botão com
  ícone de toda aplicação que já compensou; `:only-child` para não empurrar o
  rótulo de um botão com ícone **e** texto.

  `e2e/reset.spec.ts` fixa isso num browser real — jsdom não calcula layout e
  nunca veria. Revertido contra o CSS anterior, falha com `Received: 12`.

- **Os quatro datasets de `br/` discordavam entre si — 79 municípios do seletor
  não geocodificavam**
  ([#249](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/249)).
  O arquivo de nomes que alimenta `BrazilStateCitySelect` e o índice de
  centroides que o geocoder lê vinham de safras diferentes do IBGE e eram unidos
  por **nome**. Bastava uma renomeação para o par se perder: `Presidente
Juscelino` (RN) virou `Serra Caiada` em 2013, `Embu` virou `Embu das Artes`,
  `Campo de Santana` (PB) virou `Tacima`. O seletor oferecia o nome novo, o
  centroide guardava o velho, e `geocodeMunicipality` respondia vazio sem que
  componente nenhum tivesse como avisar.

  Agora **tudo sai do IBGE numa geração só**, unido pelo código de 7 dígitos, que
  sobrevive a renomeação:

  | Arquivo                     | Antes                                              | Agora                                 |
  | --------------------------- | -------------------------------------------------- | ------------------------------------- |
  | `br-locations.json` (nomes) | 5.606, sem id                                      | **5.571**, com id                     |
  | `br-centroids.json`         | 5.562                                              | **5.570** + 1 declarado sem geometria |
  | `mun/<UF>.json`             | 5.562                                              | **5.570**                             |
  | fonte                       | duas safras, `tbrugz/geodata-br` + arquivo à parte | `/localidades` + `/malhas` do IBGE    |

  A divergência que sobrava — 79 nomes sem centroide, 30 centroides sem nome — é
  **zero**, e um teste novo (`src/br/datasets.guard.test.ts`) compara os quatro
  arquivos id a id, mais a safra declarada em cada um. Regeneração parcial passa
  a falhar no teste em vez de embarcar.

- **O Distrito Federal listava 35 regiões administrativas como se fossem
  municípios.** O DF tem **um** município, Brasília; Ceilândia, Taguatinga e as
  outras 33 são regiões administrativas dentro dele, sem código de município —
  então nenhuma geocodificava. Elas continuam listadas e selecionáveis, agora num
  campo próprio, e resolvem para Brasília:

  ```ts
  municipalitiesByUf("DF"); // [{ id: "5300108", name: "Brasília" }]
  administrativeRegionsByUf("DF").length; // 35
  resolveMunicipality("DF", "Ceilândia")?.id; // "5300108"
  ```

  Ignorá-las não era opção: ninguém no DF escreve "Brasília" num campo de
  endereço. **`citiesByUf("DF")` passa a devolver só `["Brasília"]`** (eram 36) e
  `isValidCity("DF", "Ceilândia")` passa a ser `false` — quem precisa aceitar RA
  usa `resolveMunicipality`, que aceita, ou `administrativeRegionsByUf`. O
  `BrazilStateCitySelect` já lista as duas coisas, então nenhum formulário perde
  opção.

- **Quatro municípios pequenos demais tinham sumido da malha.** Santa Cruz de
  Minas (o menor do Brasil, 3,5 km²), Águas de São Pedro, Rio Grande da Serra e
  Taboão da Serra desapareciam na simplificação: a tolerância fixa de ~2 km
  engolia todos os vértices, o anel caía abaixo dos quatro pontos que um polígono
  precisa e o município simplesmente não era escrito. A tolerância agora é
  limitada a um vinte avos da diagonal do próprio anel.

- **`reverseGeocode` respondia "Niterói" para o centro do Rio.** A malha `minima`
  do IBGE desenha o Rio de Janeiro inteiro com 35 pontos, e o Centro fica **fora**
  desse contorno. A camada municipal passou a vir de `intermediaria`, que mantém a
  linha de costa que decide esse ponto; a simplificação continua trazendo o
  tamanho de volta (`mun/` foi de 2,26 MB para 2,37 MB).

- **O relatório de drift do `parseResponse` estava morto no browser**
  ([#250](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/250)).
  A decisão de "estou em desenvolvimento" era
  `typeof process !== "undefined" && process.env?.NODE_ENV === …`, e bundle de
  browser não tem o identificador `process`: a conjunção curto-circuitava em
  `false` e a mensagem detalhada — caminhos de campo mais o payload cru — ficava
  inalcançável justamente no build para o qual foi escrita. Todo app recebia a
  frase genérica, que é a que deliberadamente não diz nada. A pergunta agora vai
  por `isDevBuild()`.

  Não é `import.meta.env.DEV`, como a issue propunha: o Vite substitui isso ao
  buildar **este pacote**, então o artefato publicado carregaria a constante
  `false` e reproduziria a #164 exatamente.

  **Amplia comportamento, não é refactor puro:** a regra antiga era
  `NODE_ENV === "development" || "test"`; `isDevBuild()` é
  `NODE_ENV !== "production"`. Build de staging que nunca seta
  `NODE_ENV=production` passa a receber um `Error` carregando
  `JSON.stringify(raw)` — dos sete call sites de `isDevBuild()` esse é o único que
  imprime payload de servidor em vez de avisar no console, e as duas páginas de
  doc dizem isso.

  Os testes eram a razão de isso ter passado: o vitest seta `NODE_ENV=test` e o
  jsdom fornece `process`, então o ramo de dev era tomado por um motivo que
  browser nenhum reproduz, e nenhum dos dois casos distinguia o código corrigido
  do quebrado. Agora dirigem o ramo por um `isDevBuild` mockado e nunca leem
  `process`.

- **`lazyWithRetry` recusava componente com props**
  ([#251](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/251)).
  Props ficam em posição de parâmetro, então limite sobre elas é contravariante:
  `ComponentType<unknown>` lê como "aceita todo objeto de props possível", o que
  nada que declare props próprias satisfaz. Só página genuinamente sem prop
  compilava pelo helper, enquanto `React.lazy` puro aceitava a mesma página de bom
  grado — é por isso que o React declara `lazy` e `LazyExoticComponent` como
  `ComponentType<any>`, e por isso que um app migrando árvore de rotas mista tinha
  que reverter e ficar sem retry de chunk depois de deploy.

  `ComponentType<never>` não é a fuga sem `any`: este módulo precisa chamar
  `React.lazy`, e `ComponentClass<never, any>` falha o próprio limite do React em
  `getDerivedStateFromProps`, onde as props voltam para posição covariante. O
  limite virou um alias `ComponentType<any>` privado do módulo com disable
  pontual de eslint — a forma que `KeyBuilder` em `src/query/create-query-keys.ts`
  já sanciona.

  **Só o limite se moveu.** `T` continua inferido como o componente concreto:
  prop errada, obrigatória faltando e desconhecida seguem falhando na compilação,
  e `preload()` ainda resolve para o módulo concreto — fixado por três
  `@ts-expect-error` que ficam vermelhos como TS2578 se alguém um dia alargar
  demais o tipo de retorno.

  `src/router/types.ts` carregava o defeito idêntico e independente: `route.lazy`
  era `() => Promise<{ default: ComponentType<unknown> }>`, então todo usuário de
  `defineRoutes` estava igualmente preso mesmo com o módulo de auth corrigido, e
  as duas páginas de routing já documentavam o tipo mais frouxo que o código
  recusava. `AppRouter.tsx` não muda: `ComponentType<any>` é atribuível a
  `ComponentType<unknown>`, então nenhum `any` entra na implementação do router.

### Performance

- **Formatador do `Intl` deixou de ser construído a cada chamada** em 11 sítios,
  `formatCurrency` e `formatDate` inclusive — que é o que uma célula de tabela
  chama por linha, por render. Medido em 20.000 chamadas: **15,56 µs → 0,29 µs**.
  Uma grade de 500 linhas × 3 colunas formatadas cai de **23,1 ms para 0,4 ms**,
  a diferença entre estourar o frame de 16,7 ms só formatando e não notar. Cache
  em `utils/intl-cache.ts`, chaveado por locale + opções, limitado a 64 formas.

- **`Probs._topK` parou de ordenar as mil classes para devolver cinco.** Seleção
  parcial O(n·k), sem alocar array de índices: **123,7 µs → 1,9 µs** para saída
  idêntica (65×). `top5` e `top5conf` passam a partilhar um cálculo memoizado em
  vez de pagar dois. Empate mantém o índice menor primeiro, igual ao sort estável
  que substituiu — fixado em teste contra a implementação antiga como oráculo.

- **Linha de `VirtualList` e `VirtualTable` ganhou fronteira de `memo`.** Rolar
  mudava estado interno do componente e re-renderizava a janela visível inteira em
  vez da linha que entrou. Medido em 20 passos de uma linha:
  `renderItem` **126 → 17** e `column.render` **168 → 16**. `renderItem`,
  `columns` e `onRowClick` participam da comparação de propósito — lê-los de uma
  ref congelaria a linha mostrando estado velho.

### Documentação

- **Todo componente passou a aparecer num exemplo que o compilador lê.** Metade
  dos exemplos de `docs/components/` era fragmento — sem `import`, com variável
  indefinida e `...` dentro do JSX — e por isso ficava fora de
  `test/docs-guard.test.ts`, que só compila bloco que importa alguma coisa. Dos
  79 fragmentos restaram 5, todos deliberados (um tipo mostrado para leitura e
  trechos de três linhas dentro de admonition). Blocos compilados nas docs: 517
  → 594.

  `ChatComposer`, `AIChatComposer`, `AIChatTurn` e `AudioPlayer` ganharam o
  primeiro exemplo — antes só apareciam em prosa.

  Escrever código que compila expôs **oito APIs documentadas que não existem**:
  `ResponsiveValue<T>` (documentado como `{ base, sm, md, lg, xl, 2xl }`, real
  `{ mobile, tablet, desktop }`), `Divider` com children em vez de `label`,
  `Pagination` com `total`/`siblings` em vez de `totalPages`/`totalItems`/
  `siblingCount`, `Tabs` com `value` e itens por `key` em vez de `activeId` e
  `id`, `Stepper` com `key` em `StepItem`, `Alert` com
  `action`/`dismissible`/`onDismiss` em vez de `description`/`onClose`/
  `closeLabel`, `createApiClient` com `baseUrl` em vez de `baseURL`, e o tipo
  `FilterValue`, que se chama `Filter`. Tabela de props, prosa e as dicas que
  ensinavam a chave errada foram corrigidas nas duas línguas.

- **`layout` e `feedback` ganharam as advertências que não tinham** (3 → 7 e
  6 → 10), cada uma lida do comportamento do componente: `AppShell` não renderiza
  `sidebar` abaixo do breakpoint; `Show`/`Hide` desmontam em vez de esconder, e
  a largura inicial `0` fora do browser faz a primeira passada render nada;
  `Center` centraliza dentro da altura que tem; `AspectRatio` só evita o salto
  enquanto a criança preenche a caixa; `Spinner overlay` escapa para o ancestral
  posicionado mais acima; `useToast` lança fora do `<ToastProvider>`;
  `EmptyState` não é `ErrorState`; e `RadioGroup` não tem `label`.

### Interno

- **Teto do barrel ESM inteiro no `size-limit` foi de 121 kB para 123 kB.**
  Medido em 121,08 kB brotli com `useFullscreen` dentro. Esse teto não é orçamento
  de consumidor — ninguém importa o barrel inteiro, e a tabela de fatias por
  importação é que diz o custo real; ele existe para o crescimento aparecer, e
  aparecer é o que ele fez.

- **Teto da fatia `http client` no `size-limit` foi de 3,4 kB para 3,6 kB.** A
  medida ficou em 3,49 kB brotli somando duas correções desta rodada: o índice de
  `fields` que passou a ler os envelopes singulares e o `isDevBuild()` que tornou
  o relatório de drift alcançável. Os 93 B a mais compram um caminho que **antes
  não executava** no browser — o teto anterior media código morto.

- **O gerador de geodados passou a ser a fonte única de `src/br/data/`.**
  `scripts/gen-br-geodata.mjs` buscava malha do `tbrugz/geodata-br` e o arquivo de
  nomes vinha por fora, sem ninguém comparar os dois. Agora ele lê `/localidades`
  e `/malhas` do IBGE e escreve os quatro arquivos numa passada, com as duas
  safras (`roster` e `mesh`) gravadas dentro de cada um. `npm run gen:geodata`
  continua sendo o comando.

- **Teto do `/br` no `size-limit` foi de 500 kB para 515 kB.** A superfície
  completa com **todos** os chunks lazy mede 501,66 kB brotli: a malha
  `intermediaria` custa isso, e é ela que faz `reverseGeocode` acertar o centro
  do Rio. Nenhum app paga esse número — o teto existe como limite explícito da
  entrada inteira, e as fatias medidas por importação não mudaram.

- **Captura de tela por seção da gallery, versionada e regenerável**
  (`npm run docs:shots`). A documentação de um SDK de UI não mostrava nada: as
  únicas 8 imagens do repositório eram de junho, feitas à mão, cobriam 22 das 63
  seções e nenhuma página de componente tinha imagem alguma.

  `scripts/docs-shots.mjs` sobe o build de produção da gallery, percorre cada
  `section.gallery-section[id]` e escreve `docs/assets/gallery/<id>.webp` — 63
  capturas claras e 10 pares claro/escuro nas seções em que o tema é o assunto.
  A imagem entra no repositório em vez de ser artefato de build porque o
  requisito é que ela apareça **no site MkDocs e no `.md` que o GitHub
  renderiza**; um caminho relativo resolve nos dois.

  WebP sem dependência nova: o Chromium do Playwright encoda por
  `canvas.toDataURL("image/webp")`, o que corta ~50% dos bytes contra PNG
  (as 73 imagens somam 3,9 MB; as 8 PNG antigas sozinhas somavam 1,3 MB).
  Arquivo só é escrito quando o byte muda, então rodar de novo numa gallery
  intocada deixa o `git status` limpo e não cria blob no histórico.

- **As capturas entram nas páginas por geração, não à mão**
  (`npm run docs:gallery`). `scripts/docs-gallery.mjs` insere um bloco marcado
  sob o primeiro componente de cada seção em `docs/components/*.md` e no topo
  das páginas de hook/receita, nas duas línguas. Os 140 componentes exportados
  são resolvidos por `keywords` do registry, com 13 desempates explícitos e 8
  isenções nomeadas — `Kanban` entre elas, que shippou na P1 e nunca ganhou
  seção de gallery.

  A tabela de seções e o bloco de screenshots de `docs/gallery.md` passaram a
  sair do registry também: a versão mantida à mão dizia "22 seções" enquanto o
  app tinha 63.

- **Guard de captura em `test/docs-guard.test.ts`.** Três checagens que impedem
  a rotina de apodrecer: imagem referenciada que não existe em disco, imagem em
  disco que ninguém referencia, e seção da gallery sem captura.

- `noImplicitReturns` ligado. Custou um ajuste, no `handleHotUpdate` do plugin de
  ícones.
- Decisão registrada no `CLAUDE.md`: `noUncheckedIndexedAccess` fica **desligado**
  (221 erros, quase todos laço limitado pelo próprio `length`), mas a varredura
  com a flag vale como auditoria — foi ela que achou a paleta vazia.

## [0.53.0] — 2026-08-28

### Adicionado

- **`Slider` e `RangeSlider` aceitam `aria-label`.** Sem ele, o nome acessível
  saía de `label` — e `label` renderiza um bloco acima da track, que não cabe num
  rodapé de uma linha, numa célula de tabela ou numa toolbar
  ([#221](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/221)).

  O sintoma é caro e silencioso: sem `label`, **todo** slider da página se
  anuncia como `"Slider"`. Numa chamada de voz com volume por participante, o
  leitor de tela lê `"Slider"` para cada tile e não há como saber de quem é o
  volume sendo ajustado — o caso que levou um app a descartar o componente e
  ficar com `<input type="range">` cru. Envolver o campo num `<label>` externo
  não resolve, porque um `aria-label` explícito no input vence na ordem de
  precedência do nome acessível.

  A precedência agora é `aria-label` → `label` → `"Slider"`: quem passava só
  `label` não muda em nada. No `RangeSlider` o nome vale para os dois thumbs,
  cada um mantendo o próprio sufixo (`(mínimo)` / `(máximo)`), porque quem
  navega de uma ponta à outra precisa saber onde está.

- **`createWebSocket` sobrevive às três falhas que não disparam evento nenhum.**
  Reconexão montada só sobre `open`/`close`/`error` não cobre nenhuma delas, e
  cada serviço da casa vinha reimplementando um subconjunto diferente
  ([#220](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/220)).

  **Handshake pendurado.** Um `WebSocket` que não alcança o servidor não falha:
  fica em `CONNECTING` calado — medido no Chrome com o backend fora, 12 s depois
  o `readyState` ainda era `0` e a lista de eventos, vazia. A cadeia de retry
  parava na primeira tentativa pendurada e nunca mais andava, justamente no
  cenário para o qual a reconexão existe (link móvel ruim pendura, não recusa).
  `handshakeTimeout` (default 8000 ms) abandona a tentativa e agenda a próxima.

  **Link morto em voo.** O socket só reporta conexão que fecha limpo; um link que
  morre no meio deixa `readyState` em `OPEN` com nada chegando nunca mais, então
  silêncio é o único sintoma disponível. `silenceTimeout` (default `0`, desligado)
  é rearmado por qualquer frame recebido, não só por pong, e
  `controller.setSilenceTimeout(ms)` aceita o valor que o servidor anuncia no
  handshake, para não ficar fixo nos dois lados.

  **Rádio desligado.** Com `waitForOnline` (default `true`), enquanto
  `navigator.onLine` for `false` o cronograma fica suspenso e o evento `online`
  dispara a próxima tentativa — em vez de o celular esgotar o orçamento dentro do
  túnel e desistir na saída dele.

  Junto: `jitter` (default `0.3`) para a volta do servidor não virar estampida
  sincronizada; `onReconnecting(attempt, total)` / `onReconnected()` /
  `onLost(reason)`, separando o estado discreto do erro que merece UI; e
  `controller.opened`, que resolve na primeira abertura e rejeita se o socket
  morrer sem nunca abrir — falhar ao entrar é evento diferente de cair no meio.

- **`createAudioBus` / `useAudioBus`: ganho acima de 100%, limiter pós-soma e
  `setSinkId`.** `element.volume` é clampado em `1`, então um participante que
  fala baixo só podia ser **abaixado** — a única correção que ninguém precisa
  ([#223](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/223)).

  Subir acima de 100% exige grafo WebAudio, e montá-lo esbarra em três coisas
  não-óbvias, todas embaladas aqui:

  - **A âncora do crbug.687574.** Um `MediaStreamAudioSourceNode` sobre stream
    **remoto** de WebRTC não produz amostras no Chrome a menos que o mesmo stream
    esteja preso a um elemento de mídia. O grafo fica visivelmente correto e
    completamente silencioso — sem conhecer o bug, é um dia de depuração.
    `attach()` cria o `<audio muted autoplay>` de âncora, com o motivo escrito no
    código para não ser removido como código morto no primeiro refactor.
  - **Limiter depois da soma.** Clipping é propriedade da mistura: três fontes a
    200% cada ficam limpas sozinhas e distorcem no instante em que tocam juntas.
    Um limiter por fonte não enxerga isso; o do master enxerga.
  - **`setSinkId` mora no elemento.** A mistura sai por
    `MediaStreamAudioDestinationNode` → `<audio>`, que é o único caminho para
    mandar o áudio ao fone enquanto o resto do sistema fica no alto-falante.
    `canSelectOutput` diz se o motor permite — no Safari e em todo browser iOS o
    picker deve ser escondido, não oferecido e ignorado.

  Ganho é clampado em `0..maxGain` (default `3`) e `NaN` vira `1`, porque `NaN`
  chega de campo numérico vazio e atribuí-lo a um `AudioParam` **lança**. Sem Web
  Audio o barramento é inerte e `supported` é `false`, em vez de quebrar a página.

- **Módulo `webrtc`: `tuneOpus`, `setTunedLocalDescription` e `setSenderBitrate`.**
  Áudio sobre WebRTC sai mono e estreito por padrão, e o único lugar onde isso se
  corrige é o SDP
  ([#222](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/222)).

  O sintoma mais comum é áudio de tela compartilhada soando como telefone: música
  e vídeo herdam o perfil de fala — mono, ~32 kbps, FEC ligado, DTX gateando as
  passagens quietas — e nenhuma API de alto nível deixa mudar isso.

  `tuneOpus(sdp, profiles)` aceita um perfil por m-line de áudio (por índice ou
  por `mid`) ou um perfil só para todas, e cuida das armadilhas que degradam **em
  silêncio**, sem exceção nenhuma: `stereo` e `sprop-stereo` apontam para lados
  opostos e são escritos juntos; o `fmtp` que o browser já emitiu é mesclado por
  chave, para o `minptime` não ser descartado junto; o payload type sai do
  `rtpmap` em vez de um `111` fixo, e todos os payloads Opus do bloco são
  ajustados; um bloco sem `fmtp` ganha a linha inserida depois do `rtpmap`; e
  m-line de vídeo nunca é tocada, com a contagem de índice ignorando-a.

  **Deliberadamente sem tabela de presets embutida**: quais valores usar é decisão
  do consumidor — voz numa mesh não quer o mesmo que áudio de sistema — e preset é
  o tipo de coisa que não deve morar dentro de dependência. O que entra é o
  parsing, o merge e o fallback.

  `setTunedLocalDescription(pc, description, profiles)` tenta o SDP editado e cai
  para o original quando o browser recusa — o Chrome vem apertando o que
  `setLocalDescription` aceita, e sem fallback a chamada **morre** em vez de só
  perder o perfil. O retorno diz qual dos dois entrou, porque `"original"`
  significa perfil silenciosamente não aplicado.

  `setSenderBitrate(sender, bps)` é a outra metade do par que confunde: o `fmtp`
  descreve o que queremos **receber**, e este limita o que **enviamos** — numa
  mesh é ele que importa, porque o uplink carrega uma cópia por participante. Faz
  o read-modify-write que o browser exige (`setParameters` só aceita o objeto que
  `getParameters` devolveu) e cria o encoding que um sender ainda não negociado
  não reporta.

### Corrigido

- **Um `4408` do `tempest-fastapi-sdk` reconecta em vez de encerrar a sessão.** O
  servidor fecha com esse código quando o `pong` não chega dentro de
  `WS_HEARTBEAT_TIMEOUT_SECONDS` — é o **link** falhando, não o servidor
  recusando o cliente. Como o fechamento vem limpo (`wasClean: true`), a regra
  antiga ("só reabre em fechamento não-limpo") tratava um pong perdido como fim
  de sessão e o socket nunca voltava.

  A decisão agora sai do código de fechamento: `4400`–`4499` é recusa e para de
  vez com `onLost("rejected")` — **menos o `4408`**, que reabre; `1001`, `1011`,
  `1012` e `1013` reabrem mesmo vindo limpos, porque descrevem servidor
  temporariamente fora (deploy, restart, sobrecarga); um `1000` limpo continua
  sendo despedida de propósito e não reabre. A leitura óbvia da faixa —
  "4400–4499 é fatal" — é exatamente o que tornaria permanente um pong perdido.

- **Duas cópias de `react-query` ou de `react-hook-form` param de falhar em
  silêncio.** As duas quebram do mesmo jeito e pelo mesmo motivo — contexto React
  não atravessa cópias — e as duas mentiam sobre a causa
  ([#210](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/210)).

  No `<QueryProvider client={...} />`, o `client` é o **único** ponto onde a cópia
  do app e a do SDK se encostam. Com uma segunda cópia aninhada, o
  `QueryClientProvider` publica o seu client no contexto daquela cópia e todo
  `useQuery` do app lê o da outra, não acha nada e lança
  `No QueryClient set, use QueryClientProvider to set one` — com o provider
  visivelmente montado três linhas acima. Agora o SDK detecta e avisa em
  desenvolvimento, nomeando o erro que a pessoa vai ver a seguir. A discriminação é
  `instanceof`: duas cópias definem duas classes `QueryClient` distintas, então um
  client da outra cópia faz duck-type perfeito e falha a identidade. Um guard de
  duck-type roda antes, para um objeto que não é client nenhum não ser acusado de
  duplicata.

  No `<FormField>`, o erro lançado dizia só `requires either a control prop or a
<FormProvider> in the tree` — e o caso de duas cópias produz **exatamente esse
  throw** com um `<FormProvider>` montado logo acima. A mensagem diagnosticava
  errado justamente no caso caro: ninguém vai olhar `node_modules` enquanto olha
  pro provider na tela. Agora ela nomeia as duas causas.

  As duas mensagens terminam no mesmo remédio, que vive num lugar só para não
  driftarem: `npm dedupe`, ou `npx tempest doctor` para listar as duplicadas.

  `zustand` ficou de fora **de propósito**, e o motivo importa: o módulo `store/`
  usa `create`, que devolve um hook sobre `useSyncExternalStore` — não há contexto
  React próprio para atravessar, então duas cópias custam bytes e não correção. Os
  três pacotes continuam em `dependencies`; promovê-los a peer é breaking e a
  troca só se paga quando um app real colidir.

## [0.52.0] — 2026-08-23

### Adicionado

- **`formatPhone(value, { mobile: true })` — máscara pra campo que só aceita
  celular.** O padrão decide o agrupamento pelo **tamanho**, que é o certo pra um
  campo que aceita fixo e celular. Num campo só de celular ele erra enquanto o
  usuário digita: qualquer valor até dez dígitos é lido como fixo e o hífen cai
  depois do quarto dígito do assinante, então um celular meio digitado sai
  `(11) 9123-4` e só vira `(11) 91234-5` quando o décimo primeiro dígito entra —
  o separador salta pra trás na frente do usuário. Com `mobile`, a mesma entrada
  lê `(11) 91234` e o hífen não se move. Também insere o `9` obrigatório, então
  um número de dez dígitos é corrigido em vez de mascarado como fixo.

  Veio de um app que precisou manter a própria máscara justamente por isso; o
  padrão continua intacto.

- **`createOfflineDatabase({ databaseName, version, tables })` — várias tabelas
  numa base só.** `createOfflineStore` dá a cada store uma base própria, o que é
  certo pra um cache isolado e errado assim que as tabelas pertencem uma à
  outra: chats e suas mensagens, uma entidade e seus rascunhos. Separadas em
  bases diferentes elas perdem a transação de verdade — o Dexie só roda uma
  atomicamente **dentro** de uma mesma base — e o bump de versão de uma mudança
  relacionada se espalha por dois lugares.

  Cada store tem a mesma superfície de `createOfflineStore`, e o `ownerField` é
  configurado por tabela. Os stores são acessados por `store<TItem>("nome")`, com
  o tipo na chamada: derivá-lo do schema faz o `Table<T>` do Dexie expandir
  `UpdateSpec<T>` sobre um indexed access genérico, e o TypeScript responde
  `TS2589`. O nome continua checado contra o schema.

### Alterado

- **`describeApiError` aceita `codes` e `useDetail`.** O cliente já entregava o
  `code` do backend no `ApiError`, mas não havia onde pendurá-lo: cada app
  reescrevia o mesmo `switch` de `code` para frase no idioma dele. Agora
  `describeApiError(error, fallback, { codes })` resolve isso dentro do funil que
  já existe, e um `code` que o catálogo não conhece simplesmente segue para os
  passos seguintes.

  O catálogo é consultado **primeiro**: nada que o funil deduz bate uma frase
  escrita por quem conhecia o contrato e a tela, e uma requisição que não chegou
  ao servidor não traz `code` para ofuscar. `useDetail: false` pula o `detail` do
  backend, para o caso em que ele é escrito para log ou ecoa interno — offline e
  validação continuam valendo, porque são frases do SDK e não do backend.

  `useDescribeApiError()` passa a devolver `(error, fallback, options?)`, com as
  mesmas opções; as frases fixas continuam vindo do `I18nProvider`. Nada quebra:
  sem `codes` e sem `useDetail` o comportamento é o de antes.

- **`createRefreshQueue` aceita `{ getToken }` e passa a colapsar rajadas de
  verdade.** Compartilhar a promise em voo só junta o que se sobrepõe **no
  tempo**, e uma rajada de 401 não chega numa janela só: os retardatários
  resolvem depois do primeiro refresh ter terminado, não acham promise pra
  entrar, e cada um começa outro — rotacionando um token que já está novo.
  Medido contra um backend de mentira, cinco requests expiradas concorrentes
  gastaram **dois** refreshes.

  Com `getToken`, a fila lembra o token que o último refresh instalou e uma
  chamada que encontra esse mesmo token retorna na hora. Fica em um refresh para
  5, 10 e 20 requests concorrentes. Sem a opção o comportamento é o de antes,
  então nada quebra — mas a documentação que prometia "5 requests → 1 refresh"
  estava errada e foi corrigida.

### Corrigido

- **Evento do `Scheduler` não atravessa mais a semana inteira.** Na visão de sete
  dias **todo** evento era desenhado da sua coluna até a borda direita do grid: um
  agendamento de domingo às 14:00 ocupava a largura da semana, o que deixava a
  visão de semana inutilizável com mais de zero eventos
  ([#216](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/216)).

  A causa não é bug de browser, é a spec. `.event` é `position: absolute` dentro
  do grid, e para um filho absolutamente posicionado de um grid container um lado
  `auto` **não** resolve em "span 1" — o CSS Grid §9.2 resolve na borda de padding
  do container. O componente emitia `grid-column: 3`, que significa "da linha 3
  até o fim do grid". Agora emite `3 / span 1`.

  O defeito passou porque a visão de **um** dia parece correta por coincidência:
  com uma coluna só, "coluna 1 até a borda" _é_ uma coluna. E o teste que existia
  fixava exatamente o valor com defeito (`gridColumn` igual a `"3"`), então a
  suíte estava verde sobre o bug. O teste foi corrigido e ganhou dois guards que
  falham sem a linha final — um na visão de semana, um na de dia.

## [0.51.0] — 2026-08-23

### Breaking

- **`buildBarListRows` recebe um objeto.** Era
  `buildBarListRows(items, sort, max, otherLabel)` — quatro posicionais, os dois
  últimos opcionais, e a chamada real saía como
  `buildBarListRows(items, "desc", 5, "Outros")`: sem abrir o arquivo ninguém sabe
  o que é `5` nem o que é `"Outros"`. Agora é
  `buildBarListRows({ items, sort, max, otherLabel })`, com `items` como único
  campo obrigatório e `sort` default `"desc"`.

  **Migração:** envolva os argumentos em um objeto —
  `buildBarListRows(vendas, "desc", 5, "Outros")` vira
  `buildBarListRows({ items: vendas, sort: "desc", max: 5, otherLabel: "Outros" })`.
  O tipo `BuildBarListRowsOptions` é exportado. `<BarList>` não muda: os props
  continuam os mesmos.

### Adicionado

- **`createApiClient` ganhou timeout.** Antes não havia nenhum, e a falha que isso
  deixava aberta não é um erro: conexão TCP que morre sem FIN **não responde**, e
  o browser segura a requisição por minutos ou para sempre. Num SDK offline-first
  esse é o pior lugar para não ter piso — o spinner eterno cai exatamente na rede
  ruim que o pacote existe para sobreviver.

  `timeout` default `15_000`, e **`uploadTimeout` default `300_000` para body
  `FormData`**. Upload binário não é requisição lenta, é outro tipo de
  requisição: um timeout único obriga a escolher entre curto o bastante para
  proteger uma chamada normal e longo o bastante para terminar um arquivo, e 15 s
  corta o upload no meio do body. `options.timeout` sobrepõe por chamada, e `null`
  desliga (stream, long poll).

  Timeout chega como `ApiError` com `status: 0` — a mesma forma que o cliente já
  usava para "não chegou ao servidor". Isso é o que faz a política de retry
  existente replicar um timeout **sem caso especial**, já que
  `isRetriableStatus(0)` é `true`. Abort que o caller pediu continua propagando
  como `DOMException`, e portanto nunca é retentado.

- **`client.upload()` aceita `options`**, então o caminho de `FormData` passa a
  poder ser cancelado e a ter timeout próprio por chamada. Era o único caminho do
  módulo sem isso, e é o mais longo — justamente o que alguém quer poder cancelar.

### Alterado

- **`RequestOptions` declara `signal` explicitamente.** Ele já funcionava, por
  herança de `Omit<RequestInit, "body">`, e já era repassado ao `fetch`. Mas não
  aparecia na interface nem em doc nenhuma — capacidade indescobrível vale quase o
  mesmo que capacidade ausente. Agora está declarado, com o caso que ela resolve
  documentado: passar o `signal` que a `queryFn` do react-query recebe cancela a
  requisição em unmount e em refetch.

### Corrigido

- **A quebra forçada de dois espaços no `Markdown` finalmente funciona.** O
  parser sempre teve a regra inline `/^ {2,}\n/`, e a doc sempre prometeu
  "quebra forçada" — mas o montador do parágrafo fazia `line.trim()` antes de
  entregar o texto ao parser inline, então os dois espaços que marcam a quebra
  eram apagados justamente pela linha que precisava deles. A regra era código
  morto e a sintaxe mais comum de hard break do CommonMark caía em silêncio (só
  a barra invertida no fim da linha funcionava).

  A flag agora é lida **antes** do trim e o marcador é recolocado ao rejuntar o
  parágrafo, em toda linha menos a última — quebrar depois da última linha
  quebraria para o nada. Descoberto ao cobrir o ramo, que é o valor de perseguir
  ramo descoberto: o que não é executado por teste nenhum às vezes não é
  executado por ninguém.

### Testes

- **Cobertura de branch subiu de 94,71% para 95,51%** (8458/8855), com 53 testes
  novos em 20 arquivos — a folga sobre o piso de 94 do CI vai de 0,71 para 1,51
  ponto ([#209](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/209)).
  Statements 97,48 → 97,83; funções 97,18 → 97,28; linhas 98,76 → 98,96. Os pisos
  do `vitest.config.ts` **não** subiram: subi-los agora recriaria na hora o
  problema que a issue descreve, que é margem fina, não número baixo.

  O que a varredura ensinou sobre a cauda que sobra: boa parte dela é
  **inalcançável por construção**, não esquecida. Guarda de SSR
  (`typeof window === "undefined"`) dentro de hook renderizado por React não tem
  como ser exercitada — `vi.stubGlobal("window", undefined)` derruba o próprio
  `react-dom` (`resolveUpdatePriority` lê `window.event`) antes de a asserção
  rodar. Default defensivo atrás de validação (`values[0] ?? ""` em
  `filter-apply`, que só é chamado depois de `isComplete`) e `default:` de switch
  sobre união fechada são as outras duas famílias.

- **Função e linha foram a 99,93% e 99,87%**, numa segunda passada com 116 testes
  a mais (5287 → 5403). Statements 97,83 → 98,97; branch 95,51 → 96,01. Os pisos
  do CI **subiram** com o ganho — 99 linhas / 98 statements / 99 funções / 95
  branch — porque agora há folga real para segurá-los: ~1 ponto em cada eixo, que
  é o desenho do gate.

  O caminho foi ranquear por **descoberta em valor absoluto**, não por
  percentual: `br/state-geo` sozinho tinha 23 funções descobertas (um loader
  dinâmico por UF), e o teste que as cobre também é o único que garante que os 27
  arquivos existem e que cada um pertence à UF que o pediu — erro que hoje só
  apareceria como 404 em produção. Depois vieram os hooks sem cobertura de ciclo
  de vida (`useWebSocket`, `useEventStream`, `useGeolocation`,
  `usePositionTracker`, `useOnline`) e uma cauda de caminhos de erro reais:
  `IndexedDB` recusando a escrita da fila de background sync, o peer
  `onnxruntime-web` ausente, `AudioContext` que não fecha, `fetch` cujo corpo não
  pode ser lido.

  **O que sobra são 2 funções e 13 linhas, e todas são inalcançáveis por
  construção**: guarda de SSR dentro de componente React, default defensivo atrás
  de validação, `default:` de união fechada, e um ramo de `MultiPolygon` que o
  dataset simplificado de municípios não contém. Chegar a 100% exigiria pragma
  (`/* v8 ignore */`) ou apagar guarda que existe para contexto fora do browser —
  as duas coisas pioram o código para melhorar o número.

- **`tempest doctor` volta a passar limpo no próprio SDK** — 9 warnings → zero.
  Um era defeito de verdade: `.item` declarado em dois blocos no
  `Sidebar.module.css`, que é como uma regra some sem ninguém notar. Os outros
  eram limite de design, resolvidos onde o corte melhora a leitura —
  `SidebarEntry` virou componente próprio, o plumbing de timeout do
  `createApiClient` saiu para `http/timeout.ts`, o middleware do plugin de dev SW
  virou função nomeada, e `sfx-pool` teve os três helpers puros içados para o
  escopo do módulo — e waived, com razão escrita, onde não melhora: a tabela de
  ícones do Material Symbols (o comprimento é do vocabulário, não do código) e
  `downloadCsv`, cuja chamada de três argumentos já lê como frase.

## [0.50.0] — 2026-08-22

### Breaking

- **`manualSearch` sem `onSearchChange` virou erro de build.** Era a quarta
  implicação da mesma família das três que o release anterior tipou, e nem o tipo
  nem o aviso cobriam: a caixa de busca renderiza, o usuário digita, nada filtra
  (correto — a busca é delegada) e ninguém é avisado. `DataTableSearchProps` entra
  como quarto eixo, e `manualSearch`/`onSearchChange` saem do
  `DataTableBaseProps`.

  **Migração:** igual à dos outros três — se o build quebrar, ele já renderizava um
  input inerte; adicione o callback.

  **Um caso ficou de fora, de propósito.** `totalItems` já _implica_
  `manualSearch`, então `searchable` sem `onSearchChange` no modo servidor é a mesma
  caixa inerte sem ninguém escrever `manualSearch`. Fechar isso exigiria o eixo de
  busca ler o eixo de paginação, cruzando duas uniões de três membros em nove e
  transformando qualquer erro num paredão de formas candidatas. Esse caso ganhou o
  **quarto aviso de runtime** — e é o único dos quatro que sobrevive a um caller
  tipado, o que é a resposta para "por que o hook de avisos ainda existe".

### Corrigido

- **O loop de chunk do `createResumableUpload` retentava tudo, cinco vezes.** Era
  a última cópia do default permissivo (`?? true`) depois da unificação da política
  de retry, e custava cinco round trips para mostrar uma resposta que a primeira
  tentativa já tinha dado.

  Duas decisões aqui são **específicas do protocolo de retomada** e nenhuma delas
  sai da política geral:

  - **`409`/`412` continuam retentando**, mesmo sendo 4xx que `isRetriableStatus`
    recusa. Eles significam "seu offset está errado", e o `resync` existe
    justamente para o `HEAD` da próxima tentativa corrigir isso.
  - **`404`/`410` param de retentar**, mesmo parecendo transitórios. O `probe()`
    os traduz para "O upload expirou no servidor" e recriar o upload só acontece no
    `ensureUpload`, no attach — nunca dentro do loop. Retentar era sondar um
    recurso morto cinco vezes, com o backoff somado, para chegar na mesma resposta.

  Erro sem forma de erro de API continua retentando: falha de transporte não tem
  status para julgar, e perder um upload grande por uma conexão caída é o desfecho
  que este módulo existe para evitar.

  O `resync` passa a ser armado **só** quando a tentativa vai acontecer de fato — a
  flag descreve o que a _próxima_ tentativa deve fazer, então armá-la para uma
  tentativa que não vem descreve nada. Um `shouldRetry` do caller continua
  decidindo, e continua armando o resync quando diz sim.

## [0.49.0] — 2026-08-22

### Breaking

- **As props do `DataTable` viraram união discriminada.** Três combinações que
  compilavam passaram a ser erro de build: `totalItems` sem `page`/`onPageChange`,
  `page` sem `onPageChange`, e `manualSort` sem `onSortChange`. O hook de aviso
  admitia na docstring que _"the only place to catch them is at runtime"_ — mas
  podiam ser tipo, e o consumidor só descobria rodando em dev, no browser, com o
  componente montado.

  `DataTableProps<T>` agora é
  `DataTableBaseProps<T> & DataTablePagingProps & DataTableSortProps<T>`, os três
  exportados. **Migração:** se o build quebrar, ele já estava quebrado — a tabela
  mentia em runtime; adicione a prop que falta. O caso não-óbvio é
  `Partial<DataTableProps<T>>`, que não funciona mais (`Partial` de união achata
  para algo que membro nenhum aceita) — use `Partial<DataTableBaseProps<T>>`.

  Os avisos de runtime **ficam**, para os callers que o tipo não alcança
  (JavaScript puro, props por spread `any`).

### Corrigido

- **O outbox entregava fora de ordem quando uma entrada falhava, e isso perdia
  dado.** O motor gasta código para garantir FIFO — `nextEnqueuedAt` avança 1ms no
  empate — e a docstring dele diz exatamente por quê: _"a `create` could be
  delivered after the `update` that depends on it"_. O `push` furava isso no
  instante em que qualquer coisa falhava: seguia para a próxima entrada sem olhar
  de que registro ela era.

  O caminho ruim é o que a doc do motor chama de usual, `deliver` como `PUT`
  upsert: `create x` falha com 500 → `update x` é entregue → o servidor **cria** o
  registro pelo payload do update → o flush seguinte reenvia o `create x` e
  sobrescreve com o snapshot **mais antigo**. A edição do usuário desaparece, o
  `summary.failed` volta a 0 e o `phase` volta a `idle`: o app reporta sucesso.

  Agora, quando uma entrada falha, as demais **daquele registro** ficam sem ser
  tentadas nesta passada e voltam na próxima na ordem original. O bloqueio é por
  registro, não por passada — um registro que o servidor recusa não segura mais
  ninguém.

- **A política de retry tinha três donos e já havia divergido.**
  `createApiClient({ retry: true })` retentava `{0, 408, 425, 429}` + `5xx`, o
  default de query retentava `{408, 429}` — **sem o `425`** — e `retry()` tinha
  `shouldRetry = () => true`, replicando `403` e `404`. O contrato em
  `http/types.ts` sempre disse `{0, 408, 425, 429}` + `5xx`. Nenhum teste pegava,
  porque cada arquivo conferia contra a própria cópia.

  `isRetriableStatus(status)` é exportado e é a única dona da classificação; o
  teste novo afirma o **acordo** entre as três superfícies. Duas mudanças de
  comportamento, ambas na direção do contrato: `useQuery` passa a retentar `425`,
  e `retry()` sem `shouldRetry` para de replicar recusa deliberada (quem dependia
  do default permissivo passa `shouldRetry: () => true`).

- **`BarList` ignorava `--tempest-chart-count`.** Um tema de marca com 6 cores
  recebia o azul e o teal default do SDK nas linhas 7 e 8 — a regressão que o token
  existe para evitar. O `8` fixo não dava para consertar em CSS (`var()` não usa o
  token como módulo), então a cor passa a vir de `useChartColors`. Confirmado em
  browser real: com `--tempest-chart-count: 3`, as linhas 4 e 5 voltam para a 1ª e
  a 2ª cor da marca.

- **`compressedStorage` prometia ser intercambiável com `storage` e não tinha
  `remove()`.** Os dois passam a ser `createJsonStorage(codec)` — superfície
  idêntica por construção.

- **A heurística de miss no i18n errava em catálogo que mapeia chave→chave.**
  `resolve()` no `useDescribeApiError` comparava o retorno de `t` com a chave para
  decidir "o catálogo não definiu isso", o que trata
  `{ "tempest.error.offline": "tempest.error.offline" }` como miss e faz o default
  pt-BR vencer uma tradução que existia. Agora quem responde é a camada de i18n,
  via o `default` do `t`.

### Adicionado

- **`SyncRunSummary.deferred`** — quantas entradas ficaram sem ser tentadas porque
  uma anterior do mesmo registro falhou. Contada à parte de `failed` porque nunca
  foram enviadas: reportá-las como falha culparia o servidor por uma decisão do
  motor, e somá-las junto faria `succeeded + failed` parar de fechar com a fila.
  Campo novo em objeto de retorno — aditivo para quem lê, breaking só para quem
  constrói um `SyncRunSummary` à mão (mock de teste é o caso realista).

- **`isRetriableStatus`** — a política de retry, reutilizável num `shouldRetry`
  próprio.
- **`t(key, params, { default })` e `plural(..., { default })`** — texto default por
  chave, interpolado como qualquer outra mensagem. `TranslateOptions` exportado.
- **`createJsonStorage(codec)`** + `StorageCodec` / `JsonStorage`.
- **`filtersToQueryParams(filters, options)`** — `substringColumns` e
  `operatorSuffix` deixam de ser constante fechada. O `SUBSTRING_COLUMN = "name"`
  era um encoder genérico tratando literalmente a coluna chamada `name` de forma
  especial, para qualquer app. Aditivo: os defaults preservam o comportamento.

### Alterado

- **`materialToLucide` foi de 130 para 261 pares**, unindo o lote de ofícios com a
  cabeça do ranking de popularidade publicado pelo Google
  (`fonts.google.com/metadata/icons`) — uso medido, não chute. Seis chaves
  apareciam nos dois lotes com destinos diferentes; o desempate foi preferir o
  mapeamento que mantém dois nomes distintos do Material Symbols distintos no
  lucide (`error` → `circle-alert` porque `cancel` já é `circle-x`, e assim por
  diante). Custo medido e com fatia própria no `size-limit`; nada em `/icons`
  importa o módulo, então quem não guarda Material Symbols não paga.

- **Comparação de texto deixa de construir um `Intl.Collator` por chamada.**
  Medido em 200k comparações: 453 ms contra 25 ms com o collator hasteado.
  Caía uma vez por linha por filtro em `applyFilters` (~23 ms de main thread por
  tecla numa lista de 10k) e O(n log n) por sort em `compareValues`.

- **`applyFilters` normaliza cada filtro uma vez**, antes da varredura, em vez de
  por linha.

- **`preload()` do `createSfxPool` não reinicia mais o download do que já está no
  pool.** O `load()` abortava a requisição em voo e descartava o buffer, e a doc do
  `useSfxPool` põe `preload` num effect de mount — acontecia a cada tela montada.

- **Menos trabalho por render em `DataTable` e `BarList`** — o memo de
  `effectiveSearchKeys` varria o dataset com a busca desligada ou delegada;
  `buildBarListRows` rodava a cada render.

- **`useCountdown` e `useTypewriter` compõem `useInterval`.** O typewriter chamava
  `clearInterval` de dentro do updater do `setCount` — efeito colateral numa função
  de redução, que o StrictMode pode invocar duas vezes.

- **`useLatestRef` deixou de ser API publicada sem consumidor** — 19 instâncias em
  18 arquivos migradas. `usePrevious` fica de fora de propósito: ele quer o valor do
  commit **anterior**, então depende da escrita em effect.

- **Um codec bytes↔base64 em vez de três.** A versão compartilhada é a **chunked**;
  a "correção mínima" óbvia (adotar o loop byte-a-byte) seria downgrade de
  performance no payload de centenas de KB. O teste usa o loop como oráculo e
  afirma que os dois concordam byte a byte, inclusive na fronteira de janela.

- **O plugin de SW em dev deixa de bundlear a frio a cada requisição** — um
  `esbuild.context()` incremental, com `dispose()` nos dois caminhos de shutdown
  (sem ele, cada restart do dev server deixaria um processo do esbuild pendurado).

- **Duplicação removida sem mudança de comportamento**: `dayKey` delegando a
  `formatDateForInput`, `syntheticDetail` exportado de `http/errors.ts` em vez de
  ter o literal `Erro ${status}` copiado, e a regra de prefixo do `base` dos plugins
  Vite com três cópias virando `basePrefix`.

## [0.48.0] — 2026-08-21

### Adicionado

- **`Sidebar` agora descreve seções.** `items` passou a aceitar
  `SidebarEntry[]` — item, `{ type: "section", key, label }` e
  `{ type: "separator", key }` no mesmo array, seguindo o formato que o
  `DropdownMenu` já usa, para o SDK ter **um** jeito de descrever lista com
  seções. `type` é opcional no ramo do item, então `SidebarItem[]` continua
  válido e nenhum call site muda. Uma seção abre um `role="group"` nomeado por
  `aria-labelledby` — o leitor de tela anuncia "Monitoramento, grupo, 3 itens" em
  vez do "botão indisponível" que um `disabled: true` estilizado de rótulo
  anuncia. No modo `collapsed` o rótulo sai de vista (`clip-path: inset(50%)`) e o
  grupo ganha linha divisória, mas o `aria-labelledby` continua apontando pra ele.
  Medido no Chromium: rótulo em 7,32:1 no tema claro e 8,42:1 no escuro.

- **`SidebarItem.href` finalmente renderiza.** O campo era declarado e ignorado; o
  item com `href` sai como `<a>`, então middle-click, ctrl-click e "copiar
  endereço do link" funcionam e o leitor de tela anuncia link. `onChange`
  continua disparando. Item `disabled` ignora o `href` e segue `<button
disabled>` — âncora não tem estado desabilitado, e tirar o `href` pra simular um
  deixaria um link que se anuncia acionável e não é.

- **`materialToLucide` cresceu de 22 para 130 pares.** A semente cobria só ofícios
  (`plumbing`, `handyman`, `electrical_services`); entrou o vocabulário que um
  painel administrativo realmente usa — navegação, dinheiro, datas, mídia,
  comunicação — e mais categorias de serviço (`carpenter`, `construction`,
  `cleaning_services`, `local_laundry_service`, `content_cut`, `pest_control`,
  `medical_services`, `dentistry`, `car_repair`, `local_shipping`,
  `fitness_center`, `spa`, `child_care`, `school`). Todo par escrito à mão, e o
  lado lucide conferido pelos testes de guarda existentes contra a lista real de
  slugs — que é o que pegou dois pares apontando para **alias depreciado**
  (`smile` → hoje `face-slightly-smiling`, `history` → `rotate-ccw-clock`). Cada
  aproximação está na tabela da doc, nas duas línguas. `window` ficou de fora de
  propósito: o `app-window` do lucide é janela de interface, não de parede, e par
  errado é pior que fallback.

- **`<IconPicker>`** — campo de ícone com autocomplete nativo sobre os 2024 slugs,
  preview do escolhido, e validação ligada ao form nativo via `setCustomValidity`.
  Todo painel reescrevia essa tela (no `servus-frontend` foram ~87 linhas no form de
  categoria), e o passo que mais falta é o último: sem barrar o submit, o slug
  inválido chega no banco e só aparece como ícone faltando em toda tela que rende
  aquele registro. Sugestões cortadas em 40 por default, porque montar 2024
  `<option>` a cada tecla trava o datalist. Entrada legada é aceita e o `onChange`
  emite sempre o slug canônico. `validateIconName` sai como export para
  react-hook-form/zod não duplicarem a regra — vazio **passa**, porque "não escolheu"
  é pergunta do `required`, não erro de grafia. Construído sobre `<datalist>` de
  propósito: teclado, leitor de tela e comportamento mobile vêm da plataforma.

- **`<Icon>` normaliza `icon_code` por default, e `normalizeIconName` saiu como
  export.** Backend que grava ícone grava sujo — `snake_case` de formulário antigo,
  espaço e maiúscula de valor digitado à mão, slug que o lucide depreciou desde
  então — e cada app reescrevia a mesma cola de três passos em volta de
  `resolveIconAlias` e `isIconName`, que já eram do SDK. Agora o componente faz
  `trim` → minúsculas → `_`→`-` → alias antes do lookup; `normalize={false}` pede
  lookup estrito. A função sozinha existe porque o formulário precisa dela **antes
  de submeter**, para gravar o slug canônico em vez de limpar em toda leitura. O
  aviso de dev passou a citar o nome **como foi escrito**, não o normalizado — quem
  lê o console é quem digitou.

- **`registerIcons(record)`** — registro estático de ícone sem provider e sem
  plugin. Uma chamada no entrypoint e todo `<Icon name>` da árvore resolve no
  primeiro frame, com import estático que o bundler poda. O caminho anterior para
  catálogo fechado (painel com vinte ícones, caso comum) exigia o plugin do Vite
  **e** o `IconProvider` no topo, e um teste unitário de componente com `<Icon>`
  precisava montar o provider para não cair no caminho assíncrono. A chave não
  precisa ser slug do lucide, então arte própria entra no mesmo call site; slug
  depreciado é gravado sob o nome canônico. Chamada tardia avisa os `<Icon>` já
  montados, que re-renderizam.

- **`<Icon icon={Wrench} />`** — aceita o componente direto, para a tela que
  mistura ícone literal com ícone vindo de dados usar **um** componente nos dois
  casos e os defaults de `size`/`strokeWidth` do provider valerem para os dois.
  `name` e `icon` são mutuamente exclusivos no tipo.

- **`tempest-react-sdk/icons/virtual`** — o registro estático virou subpath com
  módulo **de verdade** (`staticIcons = {}`), que o `tempestIcons()` sobrescreve
  quando está instalado. Antes o subpath exportava só tipos, então
  `import { staticIcons } from "virtual:tempest-icons"` só resolvia dentro de um
  build Vite com o plugin: vitest sem o plugin no config de teste, `tsx`, Storybook
  com builder próprio ou script Node que importasse a árvore da app falhavam na
  **resolução** — e a falha não era um ícone faltando, era o módulo inteiro não
  carregando. `dist/icons.d.ts` e `dist/icons-virtual.d.ts` referenciam a
  declaração do id legado, então o `/// <reference types=…>` no `vite-env.d.ts`
  deixou de ser necessário (continua válido).

- **`error.fields` no envelope de erro** — as entradas de um `422` indexadas pelo
  caminho do campo (`{ email: "Field required", "items.0.price": "Input should be
greater than 0" }`), que é a forma que um formulário consome. Antes o caminho
  era varrer `error.body` atrás de um cast, ou seja, parsear de volta a linha que
  o próprio SDK acabou de montar. Campo repetido mantém a primeira mensagem —
  input mostra um erro por vez. `TempestApiError` carrega o campo também.

- **`describeApiError` deixou de mostrar o `detail` de um 422.** Com `fields`
  preenchido ele devolve a frase de validação (default
  "Confira os campos destacados e tente de novo.", chave i18n
  `tempest.error.validation`, override por `strings.validation`). O `detail`
  achatado carrega caminho de campo e a redação do validador —
  `"items.0.price: Input should be greater than 0"` numa tela em pt-BR é meia
  frase em inglês nomeando estrutura interna. Ele continua ali para log; o que
  chega ao usuário agora é frase, e as mensagens por campo vão para os inputs.
  Novo export `API_ERROR_VALIDATION_KEY`.

- **`scripts/check-dist-guards.mjs`, rodando como `postbuild`** — o guard que
  faltava na correção da #164. Duas invariantes verificadas **no artefato**,
  onde essa classe de bug é a única visível (no fonte a forma errada é idêntica
  à certa; na suíte de testes o bundler ainda não dobrou nada):
  `dist/utils/dev-mode.js` continua lendo `process.env.NODE_ENV`, e todo arquivo
  que chama `console.*` ou passa por `isDevBuild()` ou está numa allowlist com o
  motivo escrito (`consoleSink`, adapter de telemetria, os dois avisos
  vendorizados do ort-vision-sdk). Ambos os ramos foram testados falhando contra
  a forma exata do defeito antes de entrar.

### Alterado

- **`TEMPEST_ICONS_ID` mudou de valor** — de `"virtual:tempest-icons"` para
  `"tempest-react-sdk/icons/virtual"`, junto com o subpath que virou módulo real.
  A grafia antiga continua como `TEMPEST_ICONS_VIRTUAL_ID`, e o plugin reivindica
  as duas no `resolveId`, então nenhum import quebra. Quebra só quem **comparava
  a constante** com um id de módulo — caso raro, mas é mudança de valor de export
  público.

- **`resolveIconAlias` saiu do `shard-cache` para o módulo próprio
  `src/icons/alias.ts`.** Tudo que só **nomeia** um ícone — `normalizeIconName`,
  `validateIconName`, um formulário conferindo valor antes de submeter — passava
  pelo `shard-cache`, e com isso dependia estaticamente do índice dos 45 shards que
  existem para _renderizar_. O `dist` confirma a limpeza:
  `normalize-icon-name.js` alcança 3 módulos e nenhum é o `loaders.js` (antes ia
  até ele). **Não economizou byte** — o esbuild já podava — mas a aresta falsa
  deixou de existir, e o `postbuild` agora falha se ela voltar. `resolveIconAlias`
  continua exportado do mesmo lugar (`tempest-react-sdk/icons`).

- **O `postbuild` passou a garantir que o `<Icon>` não alcance a lista de 2024
  slugs.** `scripts/check-dist-guards.mjs` percorre o grafo de imports estáticos do
  `dist` a partir do `Icon.js` e falha o build se `generated/icon-names.js`
  aparecer — com `preserveModules`, os imports estáticos de um módulo **são** as
  dependências reais dele, então a resposta é exata. A separação entre runtime e
  catálogo já acontecia por tree-shaking (medido: `{ Icon }` ~2,5 KB brotli sem a
  lista; `{ isIconName }` 7,20 KB com ela), mas era propriedade acidental: um
  `import { iconNames }` de conveniência dentro do `use-icon` custaria ~6 KB a todo
  app que renderiza um ícone, e nada no source pareceria errado. O guard checa
  também que o `is-icon-name.js` **continua** alcançando a lista, para a primeira
  checagem não passar a provar nada se o arquivo mudar de lugar.

- **Shard de ícone deixou de ser particionado por letra inicial.** Os nomes do
  lucide são fortemente enviesados — `c` tem 284 slugs, `q` tem 4 — então a
  inicial era a pior chave possível: desenhar **um** ícone de categoria começando
  com `c` baixava 284 ícones, **19,10 KB brotli** para um glifo de meio KB, fator
  de desperdício de ~130x. Medido em app de produção (`servus-frontend`, SDK
  0.45.0): `shard-s` 71,19 kB / gzip 19,00 kB, `shard-c` 66,40 kB / gzip 17,58 kB.
  Agora são **45 faixas alfabéticas contíguas de até 40 ícones**, e o pior caso de
  uma requisição caiu para **4,78 KB brotli** (mediana 4,19 KB, menor 1,52 KB). A
  faixa dona de um slug sai de uma **busca binária** sobre 45 limites, não de um
  mapa de 2024 entradas — que é o custo que torna o `dynamicIconImports` do próprio
  lucide inviável (120 KB no chunk principal). O gerador aceita `--shard-size=N` e
  se recusa a emitir faixas que a busca binária não navegaria; o comparador do
  gerador passou a ser o **de code unit**, o mesmo que o `<` do runtime usa —
  `localeCompare` pesa hífen por outra regra, e uma divergência mandaria o slug pro
  shard errado, sumindo com o ícone sem erro nenhum. Nenhuma mudança de API
  pública: `<Icon name>` é idêntico.

- **Três budgets do `size-limit` subiram**, porque o custo é o `fields` + a frase
  de validação: `http client` 3 → 3,1 KB (medido 3,01), `resumable upload`
  2,9 → 3 KB (2,92) e `DataTable` 5,6 → 5,7 KB (5,62). O terceiro não vem do
  `fields`: sair do barrel para o import por caminho do `dev-mode` (abaixo)
  custou 24 B naquela fatia, porque pelo barrel o Rollup dobrava a referência.

### Corrigido

- **Falha de carga de shard de ícone virava fallback permanente, sem retry e sem
  sinal.** Chunk de shard tem hash no nome, e o hash muda a cada deploy: em aba
  longa o `import()` volta 404, o cache marcava o estado como falho e o ícone ficava
  no fallback para sempre naquela aba — sem nada para o usuário nem para o
  observability. Agora há (1) **2 retries** curtos (100 ms, 400 ms), que cobrem a
  falha transitória; (2) separação entre "chunk não chegou" e "slug não existe" —
  `iconStatus` ganhou o estado `"error"`, e com isso o `<Icon>` parou de avisar "no
  such lucide icon" sobre nome válido; o estado não é permanente, um render
  posterior tenta de novo atrás de um cooldown de 10 s para chunk morto não virar
  laço de requisição; e (3) **`subscribeToIconErrors`**, para o app mandar pro
  Sentry e disparar o reload de chunk stale. Sem ninguém assinando, build de dev
  avisa no console uma vez por shard — falha silenciosa era o problema.

- **`buildApiError` estourava a pilha num `detail` profundamente aninhado.** A
  leitura recursiva de `detail` não tinha teto: um corpo com
  `{"detail":{"detail":…}}` 20 mil níveis fundo (220 KB) lançava
  `RangeError: Maximum call stack size exceeded` — e lançava **construindo o
  erro**, o que é pior que o erro: o `catch` do chamador deixa de receber um
  `TempestApiError`, então `isApiError` dá false, `describeApiError` não tem o
  que ler e o tratamento de 401 não roda. Corpo de resposta é entrada não
  confiável, inclusive no caminho de falha. Teto de 4 níveis — envelope real usa
  dois ou três — e o que passa disso cai no `Erro <status>`.

- **Erro lançado dentro do `onUnauthorized` não toma mais o lugar do erro da
  requisição.** O cliente aguarda o hook, e um `throw` lá dentro subia no lugar
  do `ApiError` original: o caso real é `onUnauthorized` chamando um `logout()`
  que faz `POST /auth/logout` com o token que o backend acabou de recusar, o
  logout volta 422, e o console mostra dois erros onde havia um — o segundo sem
  relação com a requisição que falhou. Agora o hook é chamado dentro de
  `try/catch` e quem chamou recebe sempre o erro da resposta. Com `logger`
  configurado, a falha do hook sai como `warn`
  (`onUnauthorized threw — keeping the original response error`) em vez de
  desaparecer.

- **A duração no log do cliente vem de `performance.now()`**, não de
  `Date.now()`. Medir intervalo com relógio de parede dá número negativo quando
  o relógio anda de lado no meio da requisição (correção de NTP, VM retomando,
  usuário mexendo na hora).

### Removido

- **`isDevBuild` saiu da API pública** (entrou na v0.47.0, sai na próxima —
  janela de um release). Continua funcionando: virou módulo interno, importado
  por caminho (`../utils/dev-mode`) pelos três call sites que precisam dele
  (`<Icon>`, `useStickyBodyWarning`, avisos de dev do `DataTable`). Re-exportar
  uma leitura de env var de uma linha punha peso de semver numa conveniência que
  nenhum consumidor pediu. Quem precisa do mesmo comportamento no app escreve
  `process.env.NODE_ENV !== "production"` direto — no build do app essa
  expressão é substituída, que é justamente o que a lib não conseguia fazer.

### Interno

- `endSession` virou `notifyUnauthorized` no cliente HTTP — o nome antigo
  prometia encerrar sessão e só logava antes de delegar.

## [0.47.0] — 2026-08-20

### Corrigido

- **Aviso de dev do `<Icon>` e do `<AppBar sticky>` era código morto no
  artefato publicado** (issue #164). Os dois guardavam o `console.warn` com
  `Boolean(import.meta.env?.DEV)`, e o Vite resolve essa expressão **no build do
  SDK** — o `dist` saía com `function a() { return !1 }`, então o aviso não
  disparava nem no `npm run dev` do app consumidor.

  Custava caro no `<Icon>`, que por desenho não lança em slug desconhecido: o
  aviso era o único canal informando o erro, e sem ele um `icon_code` inválido
  vindo de API/CMS falha 100% silencioso — renderiza o `fallback` (nada, por
  default) e ninguém nota até alguém olhar a tela.

  Os dois passaram a usar `isDevBuild()`, e o `DataTable` (que já usava a forma
  certa à mão) foi junto para haver um só lugar com essa decisão.

- **A declaração `ImportMeta` de `src/types.d.ts` saiu**, o que transforma a
  regressão em erro de compilação: sem ela, `import.meta.env` em código do
  `src/` falha o `tsc` com `Property 'env' does not exist on type 'ImportMeta'`.
  O guard vale mais que o conserto — o bug não é ninguém ter errado, é a forma
  errada parecer idêntica à certa.

### Adicionado

- **`isDevBuild()`** exportado da raiz — `true` quando o **app** foi buildado
  para desenvolvimento. Lê `process.env.NODE_ENV`, que é o que os bundlers
  substituem no build do app, escrito por extenso e com o erro capturado em vez
  de evitado por um `typeof process`: esse guard pareceria mais cuidadoso e
  reintroduziria o bug, porque o bundler troca a expressão
  `process.env.NODE_ENV` e mais nada — no browser, onde o identificador
  `process` não existe, o `typeof` retornaria cedo com o literal logo abaixo já
  substituído. Ambiente que não define nenhum dos dois devolve `false`: aviso de
  dev que não consegue provar que está em dev fica calado em vez de gritar no
  console de produção de alguém.

## [0.46.0] — 2026-08-20

### Adicionado

- **`logger` em `createApiClient` — observabilidade do client sem `console` na
  biblioteca.** Não havia como ver o que o cliente fez: a única saída era
  envolver o `fetcher` à mão em cada app. Com `logger`, cada tentativa que
  termina vira uma linha — `debug` abaixo de 400, `warn` de 400 pra cima, mais
  um `warn` quando `onUnauthorized` dispara — carregando `requestId`, `status` e
  o `ms` decorrido. É **uma linha por tentativa**, então a repetição depois do
  `refresh` e cada retry aparecem: "401, renovou, 200" fica legível no log.

  Fica **desligado por default** e o client continua sem escrever em console
  nenhum por conta própria. O tipo exportado é `ApiClientLogger`
  (`Pick<Logger, "debug" | "warn">`), estrutural — o logger do SDK serve sem
  adaptador, e qualquer objeto com esses dois métodos também.

  **É `logger`, não `debug: true`.** Uma flag booleana daria um botão só para o
  SDK inteiro (ou tudo ou nada), fixaria o destino no `console` e deixaria as
  strings no bundle mesmo desligada. Aqui o nível mora no logger
  (`createLogger({ level })`), o destino mora no sink (console em dev, Sentry em
  produção, array no teste) e o escopo mora no namespace — `log.child("http")`
  separa dois clients no mesmo app.

  **Nunca loga body, header nem query string**, de propósito: `Authorization` é
  bearer token, body de login é senha, e um `access_token` em query param
  acabaria escrito no sink junto. Sai o método, o caminho como o call site
  escreveu, e os números.

## [0.45.1] — 2026-08-20

### Corrigido

- **`ApiError.detail` de um 422 do FastAPI parava em `[object Object]`.** O
  backend responde erro de validação com `detail` como **lista** de
  `{ loc, msg, type }`, e `buildApiError` fazia `String(detail)` — o que
  transforma a lista em `[object Object]`. Era o texto que chegava ao `toast`,
  ao `console.error` e ao `describeApiError`: um erro que não dizia nem qual
  campo falhou nem por quê. Agora a lista é achatada em
  `"email: Field required; items.0.price: Input should be greater than 0"`, com
  o prefixo de `loc` que só nomeia a parte da requisição (`body`, `query`,
  `path`, `header`, `cookie`) descartado, e a lista crua continua em
  `error.body` para mapear erro por campo de formulário. `detail` como objeto
  aninhado é lido por `msg`/`message`/`detail`; corpo sem nada legível cai no
  `Erro <status>` de sempre.

### Documentação

- **`onUnauthorized` não faz requisição** (`docs/http.md`). O cliente
  **aguarda** o hook antes de lançar, então um `throw` lá dentro toma o lugar
  do 401 original — o caso real é `onUnauthorized` chamando um `logout()` que
  faz `POST /auth/logout` com o token que o backend já recusou, o logout volta
  422 e esse erro sobe no lugar do 401. O hook é local (limpar store, storage,
  cache); a chamada de rede pertence ao logout explícito do usuário.

## [0.45.0] — 2026-08-17

### Corrigido

- **`createApiClient` descartava o caminho do `baseURL`, e todo request virava 404.** A URL era montada com `new URL(path, baseURL)`. Pela spec de URL, um
  caminho iniciado por `/` é absoluto **contra a origem**, então o caminho que o
  `baseURL` carregava sumia: um cliente em `https://api.exemplo.com/api` pedindo
  `"/auth/login"` batia em `https://api.exemplo.com/auth/login`. Como serviço
  Tempest FastAPI é montado sob `root_path="/api"`, isso atinge todo app que
  aponta a env var para o prefixo — e o sintoma é o pior possível: 404 em toda
  chamada, com a config e os call sites parecendo corretos, e o único conserto
  sendo reescrever todo caminho sem a barra inicial.

  O caminho agora resolve contra o **caminho** do base, não contra a origem.
  `"/auth/login"` e `"auth/login"` chegam no mesmo lugar. Quem escrevia caminho
  relativo por causa do bug não quebra: continua resolvendo igual.

- **`baseURL` relativo (`"/api"`) lançava `Invalid base URL`.** É a forma certa
  atrás do proxy do dev server ou de um reverse proxy servindo app e API do mesmo
  host — e era o que a própria doc de auth mostrava no exemplo completo, que
  portanto não rodava. Agora resolve contra a origem atual; fora do browser
  (sem `location`) lança um `TypeError` nomeando a config a corrigir.

### Adicionado

- **`prefix` em `createApiClient` e `createTempestAuth`** — o segmento sob o qual
  o serviço está montado (`"/api"`), declarado uma vez no cliente em vez de
  repetido em todo call site. É a opção a preferir quando a env var é usada por
  mais coisa que o cliente HTTP (endpoint SSE, host de mídia): `VITE_API_URL`
  segue sendo a origem pura e só o cliente sabe do prefixo.

  Aplicado **no máximo uma vez** — um caminho que já abre com ele passa direto,
  então dá para migrar os call sites aos poucos, e os defaults
  `loginPath`/`refreshPath` do `createTempestAuth` (que já trazem `/api` escrito)
  continuam corretos sob um `prefix: "/api"`. A comparação é por segmento, então
  `/api-keys` não é confundido com caminho já prefixado.

- **`buildApiUrl(baseURL, path, { prefix, params })`** exportado — o mesmo join
  que o cliente usa, para montar URL fora dele: um `EventSource` de SSE, um
  `<img>`, um link. Sem isso, todo app que usa SSE reimplementa a concatenação e
  erra o prefixo de novo.

## [0.44.0] — 2026-08-16

### Adicionado

- **`BarList` — a distribuição ranqueada que o SDK mandava escrever à mão.**
  Rótulo, barra proporcional, valor e (opcional) a fatia do total. Existiam
  `Progress` (uma barra isolada) e `Sparkline` (série temporal) e nada para o
  gráfico mais comum de painel — no dashboard que motivou a issue o mesmo bloco
  aparecia quatro vezes, cada uma com seu CSS e seu `.sort()`. Sem recharts: é
  `div` com largura percentual, 762 B brotli na fatia importada.

  Largura e percentual são números **diferentes**, de propósito: a largura é
  relativa à **maior** linha (a maior barra preenche a trilha) e o percentual é a
  fatia do **total**. Escalar a largura pelo total deixa toda barra curta numa
  lista de muitos valores pequenos, ou seja, o gráfico para de ser legível
  exatamente quando tem mais linhas.

  É **lista, não figura**: `<ul>`/`<li>` com o valor escrito como texto e a barra
  `aria-hidden` atrás. E o rótulo nunca fica em cima da barra — texto sobre
  preenchimento tingido precisa ser reverificado contra aquele preenchimento, a
  rampa `--tempest-chart-*` é de marca (3:1) e reprova como texto, e o `axe` em
  jsdom não pega isso porque desliga `color-contrast` sem paint. O layout evita a
  classe inteira do problema.

  Cantos resolvidos: soma zero mostra `0%` (via `percentOf`) em vez de `NaN%`;
  valor negativo não desenha barra mas continua na lista com seu número, e fica
  fora do total para as fatias fecharem; `otherLabel` só agrega quando `max` cortou
  mais de uma linha. A aritmética sai exportada como `buildBarListRows`, para quem
  quer o mesmo cálculo com outro desenho.

- **`DataTable` ganhou modo servidor** — `totalItems`, `page`, `onPageChange`,
  `manualSort`, `onSortChange`, `manualSearch`, `onSearchChange` e `loading`. O
  componente era documentado como "Full, unfiltered dataset. Sorting/filtering/
  pagination happen client-side" e paginava sobre `sorted.length`, então na
  listagem paginada no servidor — o caso normal de admin — ele ficava inutilizável
  e o app montava `Table` + `Pagination` na mão, reimplementando cabeçalho
  ordenável, estado de página e empty state. As duas pontas já existiam
  (`usePaginatedQuery` e `Pagination`); faltava o meio.

  Passar `totalItems` troca o modo: `data` vira a página atual, a contagem de
  páginas vem desse número, e ordenação e busca passam a ser delegadas — as duas
  **implicitamente**, e isso não é conveniência. `searchable` filtra `data` em
  memória, e no modo servidor `data` é só a página atual: o usuário digita, some
  tudo que não está na página 3, e a tabela parece dizer "não existe". Ordenar
  cinco linhas alegando ter ordenado 23 é a mesma mentira. `manualSort` e
  `manualSearch` continuam disponíveis sozinhos, para quem tem a lista inteira mas
  ordena/filtra no backend.

  `loading` separa duas telas que costumam ser tratadas como uma: com linhas
  visíveis, esmaece e marca `aria-busy` mantendo as linhas antigas, então a
  paginação não salta sob o cursor; sem linhas ainda, desenha placeholders na
  altura real em vez do `emptyMessage`, porque "estou buscando" e "não há nada"
  são frases diferentes.

  Combinação incompleta (`totalItems` sem `page`, `page` sem `onPageChange`,
  ordenação delegada sem `onSortChange`) avisa no `console` em desenvolvimento:
  nenhuma delas é erro de tipo, e todas renderizam uma tela que parece funcionar.

  **Modo cliente intocado** — sem as props novas, markup e comportamento são
  exatamente os de antes, inclusive o clamp de página quando o dataset encolhe,
  que no modo servidor é desligado de propósito (a página pertence ao chamador, e
  um clamp contra um `totalItems` defasado o mandaria para uma página que ele não
  pediu, no meio do fetch).

- **`describeApiError` e `useDescribeApiError` — do erro tipado para a frase da
  tela.** O SDK dava `TempestApiError` e `isApiError` e nada que virasse a frase
  exibível, então todo app escrevia o mesmo funil e errava no mesmo ponto: a
  requisição que **não chegou** ao servidor tem `status === 0`, e sem tratamento
  ela vira "erro 0" na tela.

  A ordem é: requisição que não chegou (`status === 0`, ou erro qualquer com o
  browser se declarando offline) → `detail` do backend → `fallback` do chamador
  com `(HTTP <status>)` anexado. O `detail` sintético que `buildApiError` produz
  quando a resposta não tem corpo (`Erro <status>`) é reconhecido e perde para o
  `fallback`, porque "Erro 500" diz estritamente menos que "Não foi possível
  carregar os pedidos".

  As duas superfícies saíram porque resolvem **onde** o código roda, não gosto:
  `describeApiError` é pura e funciona em interceptor, logger e fora da árvore
  React; `useDescribeApiError` é o mesmo funil com a frase fixa resolvida pelo
  `I18nProvider` ativo — e chama a função pura, sem duplicar a lógica. Sem
  provider, ou com catálogo que não define `tempest.error.offline`, cai no default
  pt-BR em vez de estourar ou imprimir a chave crua (que é o que `t` devolve num
  miss). Para isso o i18n ganhou `useOptionalI18n`, que devolve `null` fora do
  provider em vez de lançar como `useI18n`.

- **`shouldRetryQuery`**, a política de retentativa que o `QueryProvider` agora
  usa por padrão, exportada para quem monta o próprio `QueryClient`.

- **`formatDateForInput` e `percentOf` — os dois utilitários que todo painel
  reescreve.** `formatDate` produz `dd/MM/yyyy`, que um `<input type="date">`
  rejeita: ele exige `yyyy-MM-dd`. O recorte que cada formulário reescreve é
  `toISOString().slice(0, 10)`, e ele **erra o dia** — `toISOString` converte pra
  UTC antes, então em UTC-3 qualquer horário depois das 21h reporta o dia
  seguinte, e o formulário abre na data errada só pra quem mexe à noite.
  `formatDateForInput` monta a data pelas partes locais, devolve `""` (que o
  input lê como "sem valor") para entrada inválida, e deixa passar intacta uma
  string que já é `yyyy-MM-dd` — desvio necessário, porque
  `new Date("2026-05-16")` é meia-noite **UTC** e devolver ao input o valor exato
  que o backend mandou o moveria um dia pra trás.

  `percentOf(part, total)` devolve `0` quando a base é zero, em vez do `NaN` que
  `(part / total) * 100` produz — `NaN%` num painel vazio é a forma mais comum de
  um dashboard anunciar que ainda não tem dado. Entrada não-finita também vira
  `0`. Não limita em 100, porque 150% de uma meta é dado real. Devolve **0–100**;
  `formatPercent` recebe fração, então o par é
  `formatPercent(percentOf(a, b) / 100)`.

- **`toCsv` e `downloadCsv` — exportação em CSV que sobrevive a dado real.** O
  SDK tinha `writeXlsx` e nada de CSV, então cada painel escrevia o arquivo por
  concatenação e errava sempre nos mesmos dois pontos: valor com o delimitador
  parte a linha, e valor com aspas quebra justamente a citação que deveria
  protegê-lo. Junto vinham a repetição do BOM (o Excel em pt-BR lê UTF-8 sem BOM
  como Latin-1 e transforma todo acento em mojibake) e mais um `<a download>` na
  mão, sendo que `shareOrDownloadBlob` já existe — e é por ele que `downloadCsv`
  entrega o arquivo, abrindo a folha nativa no celular.

  Escaping RFC 4180 completo: campo com delimitador, aspas ou quebra de linha é
  citado, aspas internas são duplicadas, e as linhas terminam em `\r\n`.
  `CsvOptions` cobre os dois desvios que o Excel pt-BR exige — `delimiter: ";"`
  (num locale de vírgula decimal, o CSV separado por vírgula abre em uma coluna
  só) e `bom` ligado por padrão.

  `CsvColumn<T>` ganhou acessor próprio (`csv?`) em vez de reaproveitar
  `DataTableColumn` inteira: `render` devolve `ReactNode`, que serializado vira
  `[object Object]` justamente na coluna com badge, link ou data formatada. Uma
  coluna sem `render` continua estruturalmente compatível. `0` e `false` são
  exportados (vazio é ausência, não falsidade), `Date` sai em ISO, e lista vazia
  gera o cabeçalho em vez de um arquivo de zero byte que parece erro.

- **`applyFilters` e `filtersToQueryParams` — a metade que faltava do modelo de
  filtro** (`tempest-react-sdk`, exportados junto do `FilterBar`). O modelo era
  completo em tudo menos **aplicar**: `operatorsFor`, `describeFilter`,
  `isComplete`, `filtersToSearchParams` e `filtersFromSearchParams` já existiam, e
  o docstring deste último até admitia o buraco ao falar em "rendering a filter
  the app cannot evaluate". Resultado prático: o `FilterBar` produzia `Filter[]` e
  cada app reescrevia o match dos onze operadores.

  `applyFilters(items, filters)` roda o conjunto em memória, combinando com **E**
  e ignorando filtro incompleto (formulário meio preenchido não esvazia a tabela
  embaixo dele). A comparação segue o tipo da **linha**, não o do filtro — que
  sempre chega como texto, vindo de input e de URL: número compara
  numericamente, data compara **por dia** (linha carimbada
  `2026-03-05T13:00:00Z` casa `eq 2026-03-05`), e o resto compara como texto com
  `numeric: true`. `between` é inclusivo nas duas pontas e **normaliza** o par
  invertido, porque quem escolheu a data final primeiro quis o intervalo, não uma
  lista vazia.

  `filtersToQueryParams(filters)` é a mesma coisa do lado servidor, encodada no
  dialeto que o `tempest-fastapi-sdk` já lê — o sufixo `<coluna>__<op>` de
  `build_filter_condition` (`tempest_fastapi_sdk/db/expressions.py`): `ne` →
  `__ne`, `contains` → `__icontains`, `between` → `__between` repetido, `in` →
  `__in` por valor, `empty`/`notEmpty` → `__isnull=true`/`=false`. Devolve
  `URLSearchParams` e **não** `Record<string, string>`, porque `between` carrega
  um par e `in` carrega uma lista: um objeto guardaria só o último valor e
  estreitaria o filtro em silêncio.

  Duas divergências entre os dois modos são deliberadas e estão documentadas:
  `ne` casa linha sem valor no cliente (no SQL, `coluna <> 'x'` com `NULL` derruba
  a linha) e `empty` casa texto em branco no cliente (o `__isnull` do servidor só
  casa `NULL`). `eq` ficou **sensível a maiúscula** justamente para não discordar
  do `WHERE coluna = valor` — o operador insensível é o `contains`, que já é o
  default de campo de texto. Também há um caso especial: a coluna `name`, que o
  backend trata como `ILIKE %valor%` quando vem sem sufixo, recebe `name__iexact`
  no `eq`, senão o chip diria "é" e a query perguntaria "contém".

- **`createSfxPool` e `useSfxPool`** no módulo `audio` — pool de elementos
  `<audio>` preallocados para efeitos sonoros curtos. `new Audio(src)` a cada
  disparo aloca um elemento e re-entra na pilha de rede por um arquivo que o
  navegador já tem, o que é a forma errada para um som que toca dezenas de
  vezes por minuto. O módulo tinha `createAudioPlayer` (um clipe atual, com
  loop e roteamento de saída — o caso de música de fundo) e nada para o caso
  oposto: muitas fontes, todas curtas, dispara-e-esquece.

  `voices` decide entre reiniciar o clipe (default `1`, o que um blip de menu
  quer) e deixá-lo se sobrepor. `setVolume` reescala o que já está soando
  **pelo ganho de cada clipe**, então um som iniciado a meio volume não é
  puxado para o master. `useSfxPool` troca o volume no pool existente em vez de
  recriá-lo — recriar jogaria fora todo elemento já baixado, exatamente o custo
  que o pool evita.

- **`lazyWithRetry` ganhou `.preload()`** (e o tipo `PreloadableLazy`). Chamar
  no momento em que a rota fica provável — hover do link, abertura do menu,
  fim do passo anterior — aquece o chunk antes do usuário decidir, e o
  `Suspense` fallback não aparece. O trabalho é compartilhado com o caminho de
  render: quem disparar primeiro faz o único fetch e o outro espera a mesma
  promise, então chamar repetido é seguro.

  A promise devolvida rejeita quando todos os retries falharam, mas a rejeição
  já é tratada internamente — um preload especulativo que ninguém aguarda não
  vira `unhandledrejection`. O mesmo `catch` limpa o memo, então um componente
  que falhou não fica envenenado: uma tentativa posterior, depois que o error
  boundary resetar, busca de novo. Mudança aditiva, sem quebra.

- **`useLatestRef(value)`** — ref estável cujo `current` é sempre o último valor
  recebido. É a saída para ler state fresco dentro de algo que não pode ser
  recriado quando esse state muda: um interval, uma subscription, um listener
  registrado uma vez no mount. Listar o valor nas dependências desmonta e
  remonta o effect; omitir congela o valor do render que criou o closure. A
  escrita acontece **durante o render**, pelo mesmo motivo já documentado no
  `useStableCallback` — um effect abriria uma janela de obsolescência de um
  commit.

- **`useCountdown(durationMs, startedAt, { tickMs })`** — tempo restante de uma
  janela, em ms, travado em `0`. Escrito em cima de um **timestamp** em vez de
  um contador que decrementa: o restante é recalculado de `Date.now()` a cada
  tick, então aba throttlada, frame lento ou `setInterval` que derrapa não fazem
  a contagem discordar do relógio, e remontar retoma no valor correto. O
  interval para ao chegar em zero, em vez de continuar rodando atrás do clamp.

- **`useTypewriter(text, speedMs)`** — revela uma string letra a letra,
  devolvendo `{ displayedText, isComplete, skip }`. Trocar `text` reinicia a
  revelação, e o reset acontece durante o render, então a string nova não pisca
  inteira por um frame antes da animação assumir. `speedMs <= 0` renderiza tudo
  de uma vez, que é a forma sem ramo condicional de honrar
  `prefers-reduced-motion`.

- **`compressedStorage`, `compressedStorageCodec`, `compressToString` e
  `decompressFromString`** — `localStorage` gzipado, sobre o `fflate` que o SDK
  já traz. `localStorage` dá ~5 MB por origem e cobra dois bytes por caractere;
  um app offline-first que guarda estado de verdade bate nesse teto e descobre
  pelo `QuotaExceededError` no meio de uma escrita.

  O formato é **autodescritivo**: todo valor gravado leva o prefixo `~tgz1:`, e
  uma leitura sem o marcador cai no `JSON.parse` normal. Ligar compressão numa
  chave que já existe portanto não exige migração nem órfã os dados já
  gravados. O mesmo caminho cobre a escrita degradada — se a compressão falhar,
  o valor vai como JSON puro em vez de ser descartado.

  Mora em `src/utils/compressed-storage.ts`, não dentro de `storage.ts`, para
  que importar o wrapper tipado simples continue sem arrastar `fflate`.

  Não há um `useCompressedStorage`: `useLocalStorage` já aceita
  `serialize`/`deserialize`, então `compressedStorageCodec` entra direto e um
  hook novo seria só um wrapper repassando argumentos.

### Alterado

- **Budget de `size-limit` do `DataTable` subiu de 5,2 KB para 5,6 KB** — o modo
  servidor custou 192 B brotli na fatia importada. Fatias novas entraram no
  arquivo: `BarList` (1,2 KB) e "admin plumbing" (`applyFilters`,
  `filtersToQueryParams`, `toCsv`, `downloadCsv`, `describeApiError`, 3 KB).

- **`QueryProvider` parou de retentar 4xx.** O default era `retry: 1` chapado, e
  ele replicava um 403 numa listagem admin-only e um 404 de registro apagado — o
  servidor recusou de propósito nos dois casos, então a segunda tentativa devolve
  a mesma resposta, dobra o log de rede e segura o spinner por mais um round
  trip.

  O novo default retenta uma vez só o que pode mudar sozinho: falha de rede
  (`status === 0`), `5xx`, `408`, `429` — que é uma recusa cujo significado
  literal é "mais tarde" — e erro de formato desconhecido, que pode ser falha de
  transporte. Todo o resto do 4xx falha de primeira.

  **Migração:** quem dependia de retry em 4xx (fluxo de refresh de token feito na
  mão, por exemplo) restaura o comportamento antigo com
  `<QueryProvider defaultOptions={{ queries: { retry: 1 } }}>`. Um `client`
  próprio nunca foi afetado — ele já ignora os defaults do SDK.

### Corrigido

- **`tempestPwaManifest()` ignorava o `base` do Vite em `appShell` e
  `additionalUrls`.** Só os arquivos emitidos pelo bundle passavam por
  `joinBase`; o app shell (default `/index.html`) e as URLs extras entravam
  literais. Em qualquer app com `base` diferente de `/` — todo deploy em
  GitHub Pages, para começar — o `precache-manifest.json` saía com o shell
  apontando para fora da base. O worker instala, tenta cachear `/index.html`
  onde só existe `/meu-app/index.html`, e o `navigateFallback` nunca resolve:
  o app não abre offline, sem erro visível no build.

  Agora as duas opções recebem o mesmo prefixo dos assets. A aplicação é
  **idempotente**: uma URL que já começa com o `base` é devolvida intacta, para
  que configs escritas contornando o bug — soletrando o prefixo à mão — sigam
  produzindo exatamente o mesmo manifest em vez de ganharem `/app/app/…`.

- **`tempestPwaDevSw()` só casava o caminho sem `base`.** O middleware comparava
  `req.url` com `swUrl`/`manifestUrl` por igualdade exata, então um projeto
  servido de um subpath pedia `/meu-app/sw.js` e caía no passthrough — sem
  service worker em dev, que é justamente o buraco que o plugin existe para
  tapar. O match agora aceita tanto o caminho puro quanto o prefixado com o
  `base` resolvido.

- **Documentado o `installPrecache` sob subpath.** O plugin de build enxerga o
  `base`, mas o worker não: `manifestUrl` e `navigateFallback` continuam sendo
  responsabilidade de quem escreve o `sw.ts`. As páginas de PWA (PT + EN) agora
  trazem o aviso e o exemplo.

## [0.43.0] — 2026-08-16

### Alterado

- **`react-router` virou peer dependency (`^7 || ^8`), em vez de dependência
  direta fixada em `^8.3.0`.** É a única exceção à regra "só `react` e
  `react-dom` são peers", e a razão é a mesma que vale para o próprio React:
  `react-router` guarda contexto. Como dependência direta, um app que já tivesse
  `react-router` numa versão fora do range do SDK ganhava uma **cópia aninhada**
  em `tempest-react-sdk/node_modules` — um `<Router>` diferente do que o app
  renderiza. Aí todo hook do SDK que alcança esse contexto estoura com

  ```text
  useNavigate() may be used only in the context of a <Router> component.
  ```

  Isso não é regressão de bundle size, é crash de runtime — e o próprio
  `tempest doctor` já listava `react-router` entre as libs cujas cópias
  duplicadas ele acusa (`STATEFUL_DEPS`), enquanto o `package.json` continuava
  criando exatamente essa duplicação. Os outros direct deps (`zod`, `dexie`,
  `lucide-react`, …) não têm o problema: duas cópias custam bytes, não correção.

  O range abriu para `^7 || ^8` porque a superfície que o SDK usa e re-exporta é
  idêntica nos dois majors — `BrowserRouter`/`HashRouter`/`MemoryRouter`,
  `Routes`/`Route`, `Navigate`, os hooks, `redirect`, `useRouteError` — e nenhum
  dos dois usa `react-router-dom` (os bindings de DOM vêm no próprio
  `react-router` desde a v7). Validado rodando `npm run typecheck` e a suíte de
  `src/router` contra `react-router@7.18.2` e `@8.3.0`: 12 testes verdes e
  typecheck limpo nas duas.

  **Migração:** apps que instalam via `npm` (v7+) não precisam fazer nada — o npm
  instala peers automaticamente. Em `pnpm` com `strict-peer-dependencies`, ou em
  qualquer setup que não auto-instale peers, adicione ao seu `package.json`:

  ```bash
  npm install react-router
  ```

  Apps que já dependiam de `react-router` diretamente passam a ter **uma** cópia
  em vez de duas, sem mudar nenhum import.

### Corrigido

- **Doc drift no `react-router` e no `lucide-react`.** O README anunciava
  `react-router` (`^7`) e `lucide-react` (`>=0.400`) enquanto o `package.json`
  fixava `^8.3.0` e `^1.31.0`. As tabelas de dependência do README e de
  `docs/architecture` foram reconciliadas com o manifesto.
- **Docstrings do módulo `router` divergentes entre si.** `src/router/index.ts`
  dizia "v8, declarative mode" e `AppRouter` dizia "v7, declarative mode", na
  mesma release. Ambas agora declaram `^7 || ^8` e registram por que o pacote é
  peer.
- **Duas âncoras mortas em `docs/http.md` / `docs/http.en.md`.** Os links para o
  helper `retry` usavam `#retry--backoff-exponencial` (hífen duplo) enquanto o
  slug real é `#retry-backoff-exponencial`. O `mkdocs build --strict` **não**
  pega isso: âncora inexistente sai como `INFO`, e `--strict` só promove
  `WARNING` a erro. Corrigidos, e agora cobertos por
  `test/docs-anchors.test.ts` — que valida as 163 âncoras internas das duas
  línguas, portando o `slugify` do `toc` do Python-Markdown e espelhando a
  reescrita de link do `mkdocs-static-i18n` (uma página `.en.md` que linka
  `theme.md` cai no mirror EN, não na página PT).
- **`template/package.json` fixava `tempest-react-sdk: ^0.27.0`**, 15 minors
  atrás. O valor nunca chegava ao app gerado — `create-tempest-app` carimba a
  versão viva por cima em todos os caminhos de escrita — então era só um número
  morto que envelhecia e enganava quem lia o arquivo. A chave saiu, o porquê
  ficou registrado no docstring de `readSdkVersion`, e
  `test/scaffold-template.test.ts` agora trava o contrato dos dois consumidores
  internos: `template/` e `examples/gallery/` precisam declarar **todo** peer
  obrigatório do SDK, e o template não pode voltar a fixar o SDK. É o guard que
  teria apontado os três lugares que a mudança de peer do `react-router` exigiu.

## [0.42.1] — 2026-08-14

### Corrigido

- **`vision`: um buffer de pré-processamento que o consumidor transferiu agora é
  substituído, em vez de reescrito.** `LetterboxPipeline` e `ResizePipeline`
  guardam um `Float32Array` e reentregam o mesmo a cada `run()` — é isso que as
  torna livres de alocação por frame. Mas com `ort.env.wasm.proxy = true` (ONNX
  Runtime num Web Worker, a única forma de tirar a inferência da main thread) o
  ORT posta os tensores de entrada com os `ArrayBuffer`s na _transfer list_, o que
  **destaca** o buffer deste lado.

  Um `Float32Array` destacado tem `length === 0` em silêncio: as escritas não vão
  a lugar nenhum e o `InferenceSession.run` seguinte rejeita com

  ```text
  Tensor's size(1228800) does not match data length(0).
  ```

  a cada **duas** chamadas — o buffer destacado lança, o lançamento deixa o claim
  pendente, e a chamada seguinte aloca um array novo e passa. Medido no Chromium
  contra um detector YOLO 640×640: run 1 ok (195 ms), run 2 rejeitada, run 3 ok
  (206 ms). O classificador quebrava igual, com `Tensor's size(150528)`.

  Na prática isso deixava `env.wasm.proxy` inutilizável com `Detector`,
  `Classifier`, `Segmenter` e `DetectClassify` — e é a flag que decide se a
  inferência trava a interface ou não: medido num desktop de 32 núcleos, um
  `warmup()` de detector + classificador congelou a página por **805 ms** na main
  thread, contra **18 ms** de pior frame pelo worker.

  As duas pipelines passam a compartilhar um detentor de buffer que trata um
  `length` que não bate mais com o alvo como gasto e aloca um substituto. Custo de
  um transfer: **uma** alocação, em vez de uma falha a cada duas inferências. Para
  quem copia o tensor em vez de transferir, o reuso continua idêntico, e a forma
  pública não muda — `run()` segue reportando `reused: true` quando os dados são o
  buffer da própria pipeline. Vision re-vendorada do
  `@mauriciobenjamin700/ort-vision-sdk-web@0.7.1`.

  Ver `docs/vision.md` → "Saindo da main thread (`env.wasm.proxy`)" para como
  ligar (a flag tem que ser setada **antes** da primeira sessão; depois disso o
  ORT ignora em silêncio).

- **Uma sessão morta deixava de ser encerrada quando o `refresh()` dava certo mas
  a requisição repetida voltava 401.** O `createApiClient` só chamava
  `onUnauthorized` quando o próprio `refresh()` rejeitava; se ele resolvia e o
  backend recusava o token novo assim mesmo, o cliente lançava o erro e ia
  embora — sem limpar a sessão.

  O resultado é o pior tipo de estado inconsistente: o store continua dizendo
  `isAuthenticated: true` enquanto **toda** requisição dá 401, nenhum
  `<AuthGuard>` ou `<RouteGuard>` reage, e o usuário fica num erro genérico sem
  caminho de volta pro login. Acontece sempre que o refresh token é revogado do
  lado do servidor, uma permissão é retirada, ou duas abas correm pelo refresh.

  A documentação **já descrevia o comportamento correto** desde sempre
  (`docs/http.md`: "se o `refresh()` rodar mas o retry ainda devolver 401, o
  cliente desiste, chama `onUnauthorized` e lança") — era o código que não
  cumpria. Dos três caminhos de 401, dois tinham teste e justamente esse não.

### Adicionado

- **`retry` no `createApiClient`** — retentativa com backoff exponencial dentro
  do próprio cliente, em vez de só no helper `retry()` avulso.

  **Vem desligada**, então nada muda para quem não pedir. Ligada com `true`, a
  política embutida é conservadora de propósito: só `GET`/`HEAD`/`OPTIONS`, e só
  falha de rede, `408`, `425`, `429` ou `5xx`. **Escrita nunca repete sozinha** —
  um `POST` repetido cobra duas vezes, e `PUT`/`DELETE` ficam de fora também
  porque um backend que registra ou fatura por chamada continua vendo duas.
  Repetir `400` ou `403` não conserta payload nem permissão: só gasta o tempo do
  usuário pra mostrar o mesmo erro.

  Um `shouldRetry` próprio substitui a política inteira, checagem de método
  incluída — é o escape para repetir uma escrita que você tornou idempotente com
  `generateIdempotencyKey`. A retentativa envolve a requisição inteira, refresh
  incluído, e cada tentativa carrega o seu próprio `X-Request-ID`.

- **`redirectTo` e `retry` no `createTempestAuth`.** O `retry` é repassado ao
  cliente; o `redirectTo` navega via `window.location.assign` depois de limpar a
  sessão.

  A documentação recomenda **não** usar o `redirectTo`: limpar o store já basta
  para um `<RouteGuard>` navegar, mantendo a SPA viva e o histórico do router
  intacto. Ele existe para o caso em que a expiração acontece fora de qualquer
  subárvore guardada. Não dispara num `logout()` explícito, porque ali quem
  chamou normalmente já navega e duas navegações competindo é pior que nenhuma.

- **Ponte de Material Symbols → lucide, para backend que grava `icon_code`**
  (`fromMaterialSymbol`, `materialToLucide`, `MATERIAL_SYMBOL_FALLBACK` em
  `tempest-react-sdk/icons`). Todo backend Python nosso guarda ícone de categoria
  como Material Symbol (`build`, `format_paint`, `electrical_services`) — o
  vocabulário que o Flutter/Android e os seeds administrativos já falam. O SDK
  fala lucide em kebab-case, e as duas listas não se encontram.

  O pior caso não é a tela vazia: treze códigos colidem por acidente
  (`settings`, `code`, `key`, `lock`, `shield`, `tv`, entre outros) e desenham o
  ícone certo em ~10% das linhas, o que faz o bug parecer "só alguns ícones
  sumiram". É por isso que as colisões **estão** na tabela, mapeadas para si
  mesmas — deixá-las de fora mandaria justamente os códigos que funcionavam para
  o fallback, e a ponte seria uma regressão.

  `fromMaterialSymbol` nunca devolve `undefined`: código desconhecido cai em
  `circle-question-mark`, ou no que o segundo argumento disser. **A tabela é uma
  semente de 22 pares, não o vocabulário inteiro** — Material Symbols tem ~3600
  nomes, e ela cresce sob demanda com cada par escrito à mão. Mapa gerado por
  heurística de nome erra feio, a começar por `build`, que em Material Symbols é
  uma chave inglesa e não tem nada a ver com construção.

  As aproximações estão documentadas porque não são 1:1: `plumbing` →
  `shower-head` (lucide não tem cano), `build`/`handyman`/`hardware` → `wrench`,
  `pedal_bike`/`two_wheeler`/`delivery_dining` → `bike`.

  Módulo próprio dentro de `/icons`, importado só por quem chama — nada no
  `Icon.tsx` o toca, então quem não grava Material Symbols não paga os bytes. Um
  teste trava a **imagem inteira** da tabela contra `iconNames`: toda entrada
  precisa apontar para slug existente **e canônico**, então um bump de lucide que
  renomeie um alvo reprova a suíte em vez de chegar no grid de alguém.

  O fallback é `circle-question-mark`, e não o `circle-help` que a issue propôs —
  no lucide 1.31 `circle-help` é alias depreciado, e a ponte não deve emitir um
  nome que o lucide já renomeou.

  **A saída mais limpa continua sendo o backend gravar slug lucide direto**; isto
  atende quem não pode mexer no seed, tem app Flutter no mesmo banco, ou herdou
  os dados.

## [0.42.0] — 2026-08-09

- **Guard de CI: as tabelas de ícone precisam bater com o `lucide-react`
  instalado.** O passo roda `npm run gen:icons` e reprova se `git diff` sair
  não-vazio. Era o defeito que a #135 documentou: o `package.json` declarava
  `^1.26.0`, o instalado já era 1.30, e as tabelas geradas na 1.26 nunca tinham
  sido regeneradas — um clone limpo saía com 29 arquivos modificados só de rodar
  o script. O skew não aparece no repositório; aparece no build de **quem
  consome**, como `X is not exported by lucide-react` apontando pra dentro do
  SDK.

  O guard só é possível porque o `scripts/gen-icons.mjs` passou a formatar cada
  módulo com o prettier do repositório antes de escrever. Antes, a saída crua
  deixava `git diff` sujo em toda execução — o guard seria ruído, não sinal, e a
  primeira regeneração desta release gastou 2396 linhas de diff falso para
  provar isso.

- **Guard de paridade entre classes irmãs** (`test/sibling-parity.test.ts`): um
  membro público presente em todos os irmãos **menos um** reprova a suíte. É a
  falha que a #125 documentou — o `warmup()` entrou em três das quatro tarefas
  de visão e levou duas releases e um app real batendo no teto de memória para
  alguém notar, enquanto a documentação afirmava o tempo todo que as quatro
  tinham. Rodado contra a árvore da v0.40.0, o guard acusa exatamente
  `warmup — missing from Classifier`.

  Cobre **apenas as tarefas de visão**, e a medição é o motivo: os adapters de
  telemetria e de feature flags são factories tipadas por uma interface comum
  (`TelemetryAdapter`, `FeatureFlagsAdapter`), então um membro faltando ali já é
  erro de compilação — um segundo guard seria redundante. As tarefas de visão
  são o caso sem contrato: estendem `VisionTask`, que só carrega a sessão, e
  nada força a simetria.

  Assimetria deliberada é declarada com o motivo escrito — hoje uma só, o
  `numClasses` que o `DetectClassify` não tem porque carrega dois espaços de
  rótulo sem relação. Uma declaração que deixa de ser necessária **também**
  reprova, para a lista não virar ficção.

- **Guard de superfície pública** (`test/public-surface.test.ts`): todo export de
  runtime, em cada um dos 11 entrypoints, precisa aparecer na documentação. A
  regra que ele fixa é a que motivou a limpeza — **se é exportado, é
  documentado** — e a correção para uma falha é uma decisão, não um remendo:
  documentar, se for API; ou tirar do barrel, se for internal.

  Hoje o número de exports não documentados é **zero**, nos 11 entrypoints.

### Alterado

- **`lucide-react` `^1.26.0` → `^1.31.0`, e o registro de ícones regenerado: 1997
  → 2024 slugs endereçáveis** (1767 canônicos + 257 aliases depreciados). Vinte e
  sete ícones novos entram — `broom`, `mosque`, `shield-lock`, `user-shield`, a
  família `face-*`, a família `layer(s)-arrow-*`, entre outros.

  **Nenhum slug parou de resolver.** Nove nomes que eram canônicos viraram alias
  no lucide (`angry` → `face-angry`, `smile` → `face-slightly-smiling`, `history`
  → `rotate-ccw-clock`, `podcast` → `mic-signal`, e mais cinco), e o SDK carrega
  exatamente esse mapa: `<Icon name="history" />` continua renderizando, agora
  pelo canônico novo. É por isso que a mudança não é breaking — a promessa do
  módulo sempre foi "slug gravado no banco anos atrás continua desenhando".

- **O suporte a Node 20 acabou; o mínimo agora é 22.12.** O Node 20 chegou ao
  fim da vida em **30/04/2026** e o SDK continuava testando nele e prometendo
  suporte a ele no `engines`. A matriz do CI passa a ser `["22", "24"]` — o LTS
  ativo e o próximo, em vez do morto e do atual — e o `tempest doctor` cobra
  `>= 22.12`, citando a data do EOL quando reprova.

  **Quem ainda roda Node 20 precisa subir de runtime para instalar esta
  versão.** Os quatro outros workflows do repositório já fixavam Node 22, então
  isso não muda como o pacote é publicado.

- **`jsdom` 29 → 30**, que era o que o Node 20 bloqueava: ele exige
  `^22.22.2 || ^24.15.0 || >=26`. Ambiente de teste apenas — nada do que é
  publicado muda.

  Uma asserção precisou mudar junto, e a diferença é uma **melhoria** do jsdom:
  ele passou a resolver unidades de viewport, então `getComputedStyle` devolve
  `384px` para um `max-height: 50vh` no viewport padrão de 768px, em vez de
  repetir a string. O teste do `ScrollArea` agora afere o estilo **inline**, que
  é o que o componente de fato promete — resolver a unidade é trabalho do motor.

- **O guard de documentação passou a compilar todo exemplo com `import`, não só
  os que importam do SDK** — de 442 para 480 blocos. Os 38 novos são programas
  completos que só não citavam `tempest-react-sdk`: um `vite.config.ts` de
  exemplo, um setup de teste, um componente que usa apenas React. Ninguém
  verificava se ainda compilavam, e é justamente o tipo de página que envelhece
  calada quando a assinatura de um plugin muda.

  Nenhum defeito novo apareceu — os 38 já estavam corretos. O valor é a
  regressão que deixa de passar: um símbolo inexistente num `import { … } from
"vite"` agora reprova a suíte (verificado por mutação).

  Fragmento puro (169 blocos) e declaração solta (74) seguem de fora, de
  propósito: compilar um trecho de três linhas no meio da prosa só reportaria os
  nomes que a página estabeleceu ao redor — ruído vestido de achado. O critério
  agora é o `import`, que é o que separa um programa de um excerto.

### Removido

- **32 internals deixaram de ser exportados.** Os barrels usam `export *`, então
  tudo que um módulo expõe ao vizinho virava API pública do pacote — e metade
  disso ninguém escolheu publicar. Renomear `groupMessages` (um helper do
  `Chat`) ou `tokenize` (do `CodeBlock`) era, tecnicamente, uma quebra de
  contrato.

  Saíram do barrel, continuando importáveis **dentro** do `src/` pelo caminho
  relativo:

  - **Componentes**: `groupMessages`, `chatStrings`, `dayLabel`, `timeLabel`,
    `typingLabel`, `tokenize`, `tokenizeLines`, `safeLinkUrl`, `parseMarkdown`,
    `applyTransferMove`, `splitTransferSides`, `selectMode`
  - **Captura/áudio**: `classifyMediaError`, `missingCaptureApiError`,
    `pickRecordingMimeType`, `VIDEO_MIME_CANDIDATES`
  - **Geo**: `durationFactor`, `MERCATOR_MAX_LATITUDE`
  - **HTTP/auth/tema/i18n**: `buildApiError`, `TUS_VERSION`, `THEME_STYLE_ID`,
    `resolveLanguage`
  - **Subpaths**: `MapMarkers`, `interpolatePalette` (`/br`),
    `CHART_COLOR_TOKEN_COUNT` (`/charts`), `resetImageTypeSupportCache`
    (`/imaging`), `MANIFEST_FILENAME`, `SUPPORTED_COMPACT_SCHEMA`,
    `SUPPORTED_MANIFEST_SCHEMA` (`/tabular`), `TEMPEST_ICONS_ID`,
    `buildIconsModule`, `scanIconSlugs` (`/vite`)

  **Os `DEFAULT_*` de opções públicas ficaram**, ao contrário do que a primeira
  versão desta mudança fez. O `examples/gallery` quebrou no CI ao perder
  `DEFAULT_CHUNK_SIZE`, que ele usa para **exibir** o padrão de `chunkSize` na
  tabela de props — evidência de que o default de uma opção documentada é
  informação que o app consome, não detalhe de implementação. Voltaram por esse
  critério, agora documentados: `DEFAULT_CHUNK_SIZE`, os seis do `/imaging`, os
  três do geo, `DEFAULT_PUB_KEY_CRED_PARAMS`, `ALL_BARCODE_FORMATS`,
  `DEFAULT_BARCODE_FORMATS` e `DEFAULT_MODEL_CACHE`.

  **Não há substituto público para os que saíram** — é o ponto. Se você importava
  algum, abra uma issue dizendo para quê: ou vira API de verdade, com
  documentação, ou o seu caso tem uma resposta melhor.

### Documentação

- **A mediana de shard de ícone em `docs/icons.md` estava errada por um fator de
  dois.** A página afirmava `~2,4 KB brotli`; medindo os 25 shards com o mesmo
  método que produziu o número vizinho do maior shard (`size-limit`, com as
  dependências dentro), a mediana é **~5,1 KB**. O número grande estava certo —
  só a mediana vinha de outra medição. Corrigido nas duas línguas, junto com o
  custo da lista completa de slugs (`~6` → `~7 KB`), que cresceu com o bump.

- **Lista de slugs de ícone publicada com a doc** — `docs/assets/icon-slugs.txt`
  (os 1749 canônicos) e `docs/assets/icon-slugs.csv` (os 1997, com `status` e o
  canônico correspondente), emitidos pelo `scripts/gen-icons.mjs` no mesmo passo
  que gera as tabelas. Serve quem grava o slug fora do app — seed de categoria,
  admin, validação de backend — e que não tem como importar `iconNames`. Um
  teste lê os dois de volta contra as tabelas, então um bump de lucide que
  regenere uma coisa e não a outra falha em vez de publicar uma referência que
  rejeita ícone válido.

- **Onze exports que sobreviveram ao corte agora estão documentados**, porque
  formam par ou família com API que já era pública: `boundsCenter`,
  `expandBounds`, `unprojectMercator`, `EARTH_RADIUS_KM` e `toRadians` (geo),
  `relativeLuminance`, `readableForeground` e `rgbToHex` (tema),
  `isMediaCaptureSupported` (captura), `CompactFormatError` e
  `configuredOrtAssetPath` (tabular). Com os catorze `DEFAULT_*` que voltaram
  ao barrel (ver **Removido**), são vinte e cinco no total.

## [0.41.0] — 2026-08-08

### Adicionado

- **`Classifier.warmup(runs = 1)`** — a quarta tarefa de visão finalmente tem o
  aquecimento que as outras três ganharam na 0.39.0. O custo que ele desloca é o
  mesmo (WebGPU compilando shaders, o backend WASM materializando arenas), e ele
  pesa mais aqui: num app que detecta e depois classifica com **dois modelos
  separados**, dava pra aquecer o detector e não o classificador — deixando a
  primeira inferência inevitável exatamente no instante antes de a resposta
  aparecer na tela.

  ```tsx
  await Promise.all([detector.warmup(), classifier.warmup()]);
  ```

- **`ResizePipeline` e `resizeToTensorData`, exportados do `/vision`** (mais
  `writePlanarFloat32`, o laço planar que as duas pipelines compartilham). É a
  contraparte do `LetterboxPipeline` para classificação: estica direto até a
  entrada do modelo, sem padding e sem escala pra inverter depois, já
  normalizando com `mean`/`std` na mesma passada.

### Alterado

- **O pré-processamento do `Classifier` não aloca mais por frame.** Era a única
  tarefa ainda na rota composta (`resize` → `normalize` → `toCHW`), que aloca um
  `RGBImage` e dois `Float32Array` e varre cada um de ponta a ponta: ~1,4 MB de
  lixo novo por `predict()` a 224×224, gerado justamente quando um celular perto
  do teto de memória do ORT menos aguenta. Agora passa pela `ResizePipeline` —
  um `drawImage` e um laço escrevendo float32 planar num buffer reusado entre
  chamadas.

  **A saída é bit-idêntica** à do caminho anterior, verificada valor a valor
  contra `normalize` → `toCHW` (incluindo a configuração `mean=[0,0,0]`,
  `std=[1,1,1]` de um export `-cls` do Ultralytics, em que a rota antiga varria
  o buffer inteiro e alocava outro para não mudar nenhum valor).

- **`src/vision/` re-vendorizado de `ort-vision-sdk-web@0.7.0`** (era `0.6.1`),
  que é onde as duas mudanças acima foram implementadas — o subpath aqui é uma
  cópia gerada, não um fork editável.

## [0.40.0] — 2026-08-08

### Adicionado

- **Guard de documentação: todo exemplo das docs é compilado contra o SDK de
  verdade** (`test/docs-guard.test.ts`, na suíte que gateia o CI). Os 432 blocos
  ` ```tsx `/` ```ts ` que importam de `tempest-react-sdk` são entregues ao
  compilador com os subpaths apontando para `src/`, e o teste falha em import de
  símbolo inexistente, prop que o componente não aceita e chave de options que
  não existe — a classe de defeito que o `mkdocs build` não enxerga. Junto vão
  as checagens estruturais: toda página existe nos dois idiomas e é alcançável
  pelo `nav`.

  Fragmento deliberado continua passando: um bloco que importa de `@/lib/api` ou
  usa uma variável do app do leitor levanta "cannot find module"/"cannot find
  name", e esses códigos são ignorados com o motivo escrito no arquivo.

### Corrigido

- **Quinze exemplos da documentação estavam quebrados** — todos encontrados pelo
  guard acima na primeira execução, e todos do tipo que só falha na mão de quem
  copia:

  - `docs/hooks.md` importava `UserCard` de `tempest-react-sdk`, que o SDK nunca
    exportou, e usava `useClientFilter` sobre `string[]` quando o hook exige
    objetos.
  - `docs/integration-fastapi.md` passava `<AuthGuard store={…}>` (a prop é
    `isAuthenticated`) e `createLogger({ name })` (é `namespace`).
  - `docs/cookbook.md` chamava `api.post("/auth/login", { email, password })`,
    onde o segundo argumento é `RequestOptions` — o request sairia **sem corpo**.
    O correto é `{ body: { email, password } }`.
  - `docs/testing.md` usava `createApiClient({ baseUrl })` em vez de `baseURL`.
  - `docs/tabular.md` chamava `installPrecache([...urls])`, que recebe
    `InstallPrecacheOptions` e lê o manifest — a receita virou
    `tempestPwaManifest({ additionalUrls })` no `vite.config.ts`.
  - Mais oito ajustes menores de tipo em `auth`, `push`, `resumable-upload`,
    `share`, `utilities`, `passkeys` e `forms-br`.

- **`CPFInput`/`CNPJInput`/`CEPInput`/`PhoneInput` agora type-checkam dentro de
  `<FormField>`.** `value` e `onChange` eram obrigatórios, mas o uso primário —
  e documentado — é dentro do `FormField`, que injeta os dois via
  `cloneElement`: `<FormField name="cpf"><CPFInput /></FormField>` funcionava em
  runtime e falhava no compilador. Passaram a ser opcionais; quem já passava os
  dois não muda nada.

- **`zodResolver` encaixa em `useForm` sem cast.** O retorno era um tipo
  `Resolver` local, estruturalmente parecido com o do `react-hook-form` e
  rejeitado exatamente onde um resolver é usado — tanto que o próprio
  `useZodForm` precisava de um `as unknown as` para passar. Agora o retorno é o
  `Resolver` do react-hook-form.

- **`writeXlsx` e `base64UrlToBytes` devolvem `Uint8Array<ArrayBuffer>`.** Com o
  `Uint8Array` genérico default, `new Blob([writeXlsx(...)])` não compila:
  `BlobPart` recusa `ArrayBufferLike` porque ele também admite
  `SharedArrayBuffer`. `urlBase64ToUint8Array` já fazia certo; as duas ficaram
  iguais a ela.

### Alterado

- **Documentação: 59 exports públicos que nenhuma página citava agora estão
  documentados.** Entre eles os primitivos de gravação sem React
  (`createAudioRecorder`, `isAudioRecordingSupported`, `pickAudioMimeType`,
  `AUDIO_MIME_CANDIDATES`, `encodeWav`), as chaves de cache do data provider
  (`listQueryKey`/`oneQueryKey`), os type guards de paginação
  (`isOffsetPage`/`isCursorPage`/`emptyOffsetPage`), as conversões de cor
  (`hexToOklch`/`oklchToHex`/`hexToRgb`/`hexToRgbaString`), `BREAKPOINTS`,
  `useAccessControl`, os re-exports do react-hook-form (`useFieldArray`,
  `useFormContext`, `useWatch`, `useFormState`), o grupo fiscal BR
  (`chaveNFeCheckDigit`, `ChaveNFeError`, `boletoKind`, `boletoDueDate`) e uma
  tabela de referência completa do subpath `/vision` (35 símbolos).

## [0.39.1] — 2026-08-08

### Alterado

- **Vistoria de dependências: 0 vulnerabilidades em todo o repositório.** Três
  avisos `high` viviam em dependências transitivas de ferramenta — `brace-expansion`
  (DoS) sob o `minimatch` do `api-extractor` e do `eslint`, `fast-uri` (host
  confusion) sob o `ajv` do `api-extractor`, e `nanoid` (loop infinito com
  `size` zero) sob o `postcss` do Vite. Nenhuma delas alcançava quem instala o
  SDK, porque a árvore de produção não passa por nenhum desses pacotes — o
  `npm audit --omit=dev` já dava zero antes. Ainda assim foram corrigidas, junto
  com a mesma `nanoid` no lockfile do `examples/gallery`.

- **20 dependências de desenvolvimento atualizadas dentro dos ranges** — entre
  elas Vite 8.2.1, ESLint 10.8.1, typescript-eslint 8.66, `@tiptap/*` 3.29.2,
  axe-core 4.13 e lucide-react 1.30. Nenhum range de `dependencies` ou
  `peerDependencies` mudou: o `latest` de cada dep de runtime e de cada peer já
  cai dentro do range publicado, então nenhum consumidor fica preso a um major
  antigo.

- **`eslint-plugin-simple-import-sort` 12 → 14**, no SDK e no `template/` do
  scaffold, para os dois lint-arem sob a mesma regra de ordenação. A subida não
  reordenou nenhum import do repositório.

  Dois majors ficaram de fora com motivo: **TypeScript 7** porque o
  `typescript-eslint` ainda declara `typescript: ">=4.8.4 <6.1.0"` e subir
  quebraria o lint; **jsdom 30** porque exige Node `^22.22.2 || ^24.15.0 || >=26`
  e o CI roda a matriz 20/22 com `engines.node >=20.19`.

## [0.39.0] — 2026-08-08

### Adicionado

- **`DetectClassify` — detectar e classificar num `.onnx` só.** O caso de duas
  etapas (achar o objeto, depois dizer qual sub-categoria ele é) custava, no
  navegador, dois downloads, duas inicializações de sessão WASM/WebGPU e uma
  ida-e-volta pelo JavaScript por recorte — cortar, redimensionar e reempilhar
  as regiões antes do segundo modelo ver qualquer coisa. Um pipeline fundido
  pelo `ort_vision_sdk.compose` do SDK Python traz os dois modelos mais a ponte
  de crop-and-resize no mesmo grafo: um download, uma sessão, nenhuma
  ida-e-volta.

  ```tsx
  import { DetectClassify } from "tempest-react-sdk/vision";

  const pipeline = await DetectClassify.create("/models/pipeline.onnx");
  for (const d of (await pipeline.predict("/images/flock.jpg"))[0]) {
    console.log(d.name, d.conf, d.classification?.name);
  }
  ```

  Nada é reconfigurado do lado do JavaScript — resolução do letterbox, tamanho
  do crop, se a saída ainda precisa de softmax e os nomes de classe das duas
  etapas saem do metadata `ovs.*` que a fusão gravou. Um `.onnx` comum lança
  `FusionError`. Junto vieram `DetectClassifyResults` (com `names` e
  `classifierNames` separados, porque as duas etapas têm espaços de rótulo sem
  relação), `DetectionResult.classification`, `readFusionSpec` e o contrato de
  fusão (`FusionSpec`, `CropSource`, `INPUT_*`/`OUTPUT_*`, `METADATA_PREFIX`,
  `FUSION_KIND_DETECT_CLASSIFY`), `FusionError` e `parseNames`.

- **`warmup()` em `Detector`, `Segmenter` e `DetectClassify`.** A primeira
  inferência de uma sessão não é representativa: o WebGPU compila os shaders
  nela e o backend WASM materializa suas arenas, então num celular o primeiro
  frame leva segundos enquanto os seguintes levam dezenas de milissegundos.
  `await det.warmup()` roda o modelo uma vez num tensor de zeros, movendo esse
  custo pra onde o usuário já está olhando um spinner.

- **`raiseOnEmpty` — tratar resultado vazio como erro.** Espelha o SDK Python:
  por padrão os três continuam resolvendo com envelope vazio (olhar e não achar
  é inferência bem-sucedida), e com a flag ligada lançam `NoDetectionsError`.
  Disponível na construção e como override por chamada, com a mensagem nomeando
  o threshold aplicado — formatado igual nos dois runtimes — mais a imagem e o
  filtro de classes quando algum estreitou a busca.

- **`LetterboxPipeline` e `letterboxToTensorData`, exportados** (mais
  `zeroTensorData` e o tipo `FusedLetterboxResult`), pra quem quiser o mesmo
  caminho de pré-processamento em código próprio. Também `defaultLabels` e
  `requireDetections`.

### Alterado

- **`src/vision/` re-vendorizado de `ort-vision-sdk-web@0.6.1`** (era `0.5.1`).

- **Pré-processamento ~2x mais rápido, sem alocar por frame.** As tarefas agora
  passam pela `LetterboxPipeline`: um único `drawImage` redimensiona **e**
  posiciona o conteúdo dentro do alvo com padding, e um laço só lê o RGBA
  resultante escrevendo float32 planar num buffer reusado entre frames — no
  lugar de onze passadas de buffer inteiro e seis alocações grandes. Medido no
  Chromium, letterbox pra 640×640: 19,8 → 10,7 ms (1920×1080), 13,8 → 7,8 ms
  (1280×720), 6,8 → 3,1 ms (640×480), com saída **bit-idêntica** à do caminho
  antigo.

### Removido

- **Os aliases `decodeYoloV8`, `decodeYoloV8Anchors` e `decodeYoloV8Seg` saíram
  do subpath `/vision`** (mais os tipos `DecodeYoloV8Options`,
  `DecodeYoloV8AnchorsOptions` e `DecodeYoloV8SegOptions`). Eram apelidos
  depreciados upstream desde a 0.2.0 — o nome carregava uma versão de modelo que
  nunca descreveu o que a função faz: o mesmo decoder cobre a cabeça anchor-free
  de v8 a v12. Troque por `decodeYolo`, `decodeYoloAnchors` e `decodeYoloSeg`,
  com `DecodeYoloOptions`, `DecodeYoloAnchorsOptions` e `DecodeYoloSegOptions` —
  mesmo código, mesma assinatura.

## [0.38.3] — 2026-08-05

### Corrigido

- **`cachedResponseBytes` conta o corpo quando não há `Content-Length`.** O
  leitor só olhava o header, e um `null` no relatório é indistinguível de "esse
  modelo ninguém mediu". Não é caso raro: transferência chunked derruba o header,
  proxy que re-codifica derruba, e resposta cross-origin só o expõe sob regras de
  CORS. O FAMACHApp acumulou 12 execuções de campo com as duas colunas de tamanho
  de modelo vazias por isso (IAgro-Solutions/famachapp-pwa#23).

  A contagem lê o stream por chunks e descarta cada um — nunca materializa o
  arquivo, que é o motivo de o header ser preferido quando existe.

- **`tempest doctor` parou de reportar coisa que não existe.** Quatro falsos
  positivos, todos vazando para o app consumidor e não só para o dogfood:

  - Peer marcada como `optional` em `peerDependenciesMeta` era reportada como
    não satisfeita — ou seja, todo pacote publicado ganhava um aviso permanente
    sobre peers que seus consumidores nunca deveriam instalar.
  - As checagens de uso liam **comentário** como código: um `@example` com
    `import "tempest-react-sdk/styles.css"` virava "styles.css importado 2×", e
    um docstring com `<TrajectoryMap tileUrl=…>` passava a exigir `leaflet`.
    Agora os comentários são removidos antes da busca, e arquivos de teste saem
    do corpus — um teste que renderiza um componente para provar como ele
    degrada **sem** o peer opcional não é o projeto pedindo aquele peer.
  - `type OverriddenDomProps = "children" | "onSubmit"` (união de duas strings)
    era contada como interface de props e herdava a contagem da interface
    seguinte: o `AIChat` reportava "OverriddenDomProps has 25 props".
  - O mesmo excesso de props saía duas vezes quando o componente
    desestruturava exatamente o que o `<Nome>Props` declara. Agora sai uma, no
    tipo; a desestruturação só vira achado próprio quando passa do tipo.

- **O resumo do `doctor` contava as linhas exibidas, não os achados.** A seção
  Design imprime no máximo 6 por severidade, então um projeto com 245 avisos de
  design fechava com `! 6 warning(s)` — e 6 é um número que ninguém trata. O
  rodapé passa a somar o que a lista teve de cortar.

- **Erro engolido em 4 pontos de teste.** `use-push-subscription.error.test.tsx`
  e `lazy-with-retry.fail.test.tsx` embrulhavam a chamada em `try/catch` vazio e
  depois asseriam o efeito colateral; se a promise parasse de rejeitar, o teste
  continuava passando. Viraram `await expect(...).rejects.toThrow()`.

- **`.cellButton` do `DataTable` era declarado duas vezes** no mesmo arquivo, com
  a segunda regra só acrescentando `border-bottom-color`. Fundido num bloco.

### Mudado

- **A análise de design não julga mais três classes de arquivo**: código gerado
  ou vendorado (cabeçalho com `@generated` ou `Do not hand-edit`), barrel (arquivo
  que só re-exporta) e teste (para as regras de tamanho). O `src/vision/` deste
  SDK é vendorado do `ort-vision-sdk-web` e agora sai carimbado do
  `npm run vendor:vision` arquivo a arquivo — uma edição ali morre na próxima
  regeneração, então reportá-la ensina o leitor a ignorar o relatório.

- **Os 245 avisos de design do próprio SDK foram triados**: 17 `empty-catch` e 12
  `param-count` viraram correção ou marcador escrito, 12 saíram com o vendorado,
  65 eram os falsos positivos acima, e os 181 restantes ganharam um
  `@tempest-limits <regra> — <motivo>` que diz, arquivo por arquivo, por que o
  limite não cabe ali. `npx tempest doctor` no repo fecha em zero.

- **`buildRamp(hue, mode, { steps, peakChroma })`** — os dois últimos parâmetros
  posicionais viraram um objeto nomeado. Função interna do `theme`, não exportada
  no barrel: nenhum consumidor é afetado.

## [0.38.2] — 2026-08-05

### Adicionado

- **`computeImageLuminance` aceita `ImageBitmap` e `OffscreenCanvas`**
  (`LuminanceSource`). A lista passa a seguir o que o `drawImage` realmente
  aceita e de onde se lê um tamanho — que é tudo que a função precisa. Em runtime
  já funcionava; o tipo era o que barrava.

  Isso destrava o caminho de decodificação reduzida, que é como um app evita
  materializar uma foto de celular inteira: uma de 12 MP vira ~48 MB de RGBA, mais
  que dois modelos ONNX somados, e é o pico onde o ORT começa a recusar sessão.

  ```tsx
  const frame = await createImageBitmap(photoBlob, {
    resizeWidth: 1280,
    resizeQuality: "high",
  });
  const luminance = computeImageLuminance(frame); // sem um segundo decode
  const result = (await det.predict(frame))[0]; // o mesmo frame
  frame.close();
  ```

  O frame medido é o frame inferido — as tasks já aceitavam `ImageBitmap` em
  `predict()`, só a luminância ficava de fora e forçava um `<img>` full-res só
  para a checagem de brilho. `sourceSize` agora ramifica por
  `HTMLImageElement` explicitamente em vez de tratar todo não-vídeo como imagem
  via `naturalWidth || width`.

## [0.38.1] — 2026-08-05

### Corrigido

- **Um modelo não custa mais o dobro do seu tamanho no pico da criação da
  sessão** (vendorado de `ort-vision-sdk-web@0.5.1`). Ler o mapa de metadados
  (0.38.0) baixa um modelo informado por URL para um `Uint8Array`, e essa leitura
  ficava **depois** do `InferenceSession.create` — então o buffer do lado
  JavaScript continuava alcançável enquanto o ORT copiava o modelo para o heap
  WASM e alocava grafo e pesos em cima da cópia. Um `.onnx` de 5 MB segurava 5 MB
  de heap JS + 5 MB de heap WASM + os pesos no mesmo instante. Num celular
  carregando dois modelos isso bastava para o alocador do ORT desistir com
  `Can't create a session. failed to allocate a buffer of size 5355557`.

  Os metadados passam a ser lidos **antes** de a sessão ser construída, então o
  buffer é coletável assim que o ORT termina de copiá-lo. `src/vision/session.test.ts`
  fixa a ordem (falha com a sequência antiga).

  `readMetadata: false` continua sendo a saída para um aparelho que não pode
  pagar os bytes de jeito nenhum: o ORT carrega direto da URL e nada no SDK
  segura o modelo. Só os nomes das classes se perdem — o tamanho de entrada
  continua vindo do grafo — então essa rota precisa passar `labels`.

### Documentação

- **`docs/vision.md` ganhou a seção "Rótulos vêm do modelo"**, que o 0.38.0
  deveria ter trazido: as duas línguas ainda ensinavam `labels` **obrigatório** no
  `Classifier` e o preset COCO como único default. Agora documentam a precedência
  real (o que você passa → `names` do modelo → preset), `det.labels`/
  `det.numClasses`, `session.metadata`/`outputShape`, os helpers puros, o download
  do modelo feito pelo SDK e o orçamento de memória num celular apertado.

## [0.38.0] — 2026-08-04

### Adicionado

- **`tempest-react-sdk/vision` lê os nomes das classes e a contagem de classes
  do próprio modelo** (vendorado de `ort-vision-sdk-web@0.5.0`). `labels` passa a
  ser opcional: sem ele valem os `names` que o export gravou no `.onnx` — o
  Ultralytics escreve `{0: 'deworm', 1: 'not_deworm'}` nos metadados — e só um
  modelo sem `names` cai no preset COCO (detecção/segmentação) ou em
  `class_<id>` (classificação). Passar `labels` continua ganhando.

  ```tsx
  const det = await Detector.create("/models/detect.onnx");
  console.log(det.labels); // ["ocular-mucosa"] — do modelo, não de um preset
  console.log(det.numClasses); // 1 — deduzido do shape de saída
  ```

  Uma lista de rótulos mantida à mão do lado do modelo é o pior tipo de
  configuração para errar: nada falha, as predições só trocam de classe.

  Isso também conserta um tropeço: um detector de **uma** classe **falhava** sem
  `labels` explícito, porque o default COCO de 80 nomes discordava da contagem
  de classes do modelo.

- **`numClasses` é deduzido do shape de saída declarado** — `(B, 4 + nc, N)`
  numa cabeça YOLO, `(B, nc)` num classificador. Passar o valor continua
  validando os rótulos contra o modelo.

- **`OrtSession.metadata`** expõe o mapa de metadados do modelo (`names`,
  `task`, `imgsz`, …), e **`OrtSession.outputShapes` / `.outputShape`** os shapes
  declarados para as saídas, com eixos dinâmicos como `null`.

- **`readModelMetadata`, `modelNames`, `detectionNumClasses`,
  `classificationNumClasses`** — os helpers puros por trás do acima.

### Mudado

- **Um modelo informado por URL passa a ser baixado pelo SDK**, não pelo ORT: o
  `onnxruntime-web` não expõe o mapa de metadados do modelo (diferente do
  `custom_metadata_map` do Python), então os `metadata_props` são lidos dos
  próprios bytes do `.onnx`. É o mesmo download único, e
  `readMetadata: false` nas opções da sessão restaura o caminho anterior. Um
  fetch que falha ainda entrega a URL ao ORT, para não transformar perda de
  metadados em falha de carregamento.

## [0.37.0] — 2026-08-03

### Adicionado

- **`tempest-react-sdk/vision` agora pré-processa na resolução que o grafo
  `.onnx` declara, em vez de acreditar na configuração** (vendorado de
  `ort-vision-sdk-web@0.4.0`). A resolução que uma sessão aceita é propriedade
  do export: um `-cls` do Ultralytics sai em 224×224 e um detector em 640×640,
  então alimentar o tamanho errado fazia o ORT abortar a run com

  ```text
  Inference failed: failed to call OrtRun(). ERROR_CODE: 2, ERROR_MESSAGE: Got
  invalid dimensions for input: images ... Got: 640 Expected: 224
  ```

  que chegava ao usuário final como uma falha genérica de análise. O número só
  existe dentro do arquivo, então nenhuma constante ou manifest ao lado dele
  podia acertar sozinho — agora é lido de lá.

  ```tsx
  const clf = await Classifier.create("/models/classify.onnx", { labels: LABELS });
  console.log(clf.inputSize); // [224, 224] — do grafo, não configurado
  ```

  `inputSize` passa a ser fallback, usado só quando o grafo deixa os eixos
  espaciais dinâmicos. Um valor que contradiz um grafo estático emite aviso no
  console e é ignorado (o ORT rejeitaria de qualquer forma).

- **`inputSize` em `Classifier`/`Detector`/`Segmenter`**, para ler de volta a
  resolução em que a inferência realmente rodou — não a que foi pedida.

- **`OrtSession.inputShape` / `.inputShapes`** expõem os shapes declarados pelo
  grafo (eixos dinâmicos como `null`), e **`OrtSession.release()`** libera a
  sessão nativa. Antes, ambos exigiam alcançar `session.raw` e importar tipos do
  `onnxruntime-web` no código da aplicação.

- **`declaredShapesFrom`, `spatialInputSize`, `resolveInputSize`** (+ tipos
  `DeclaredShape` / `DeclaredDim`): os helpers puros da precedência
  grafo → chamador → default, exportados para quem monta o próprio pipeline.

## [0.36.0] — 2026-08-02

### Corrigido

- **O hover do `Button variant="outline"` deixava o rótulo mais difícil de ler
  no momento exato em que o ponteiro estava nele.** A regra tingia o fundo com
  `--tempest-primary-soft` sem repetir a cor, então o `--tempest-primary` que o
  `.outline` define sobre fundo transparente ficava sobre o tingido: **4,38:1 no
  tema claro e 4,28:1 no escuro**, ambos abaixo do piso de 4,5:1 para texto.
  Passou a usar `--tempest-primary-on-soft` (6,18:1 / 8,72:1) — a regra que o
  `docs/styles.md` já documentava.

  **Varri as outras oito regras do SDK que tingem fundo sem declarar cor** —
  `FileUpload`, `Kanban`, `ListTile`, `Toggle`, `ToggleGroup` e
  `MunicipalitySearch`. Todas herdam `--tempest-text` (16,07:1 / 14,17:1),
  `--tempest-text-muted` (6,96:1 / 7,37:1) ou `--tempest-primary-on-soft`, e
  passam. Esta era a única.

  O guard de token do `src/styles/contrast.test.ts` **não pega essa classe** e
  não pegaria: ele valida os pares que o SDK usa, e aqui o defeito era um
  componente usando o token errado. Ficou escrito no arquivo, junto de um
  tripwire novo que afirma que os pares proibidos continuam reprovando — se
  `--tempest-primary` algum dia passar sobre `primary-soft`, o
  `--tempest-primary-on-soft` virou peso morto e a remoção passa a ser
  deliberada em vez de acidental.

### Documentação

- **`styles` corrigiu um número que carregava desde antes**: o par
  `primary`/`primary-soft` é 4,38:1 no claro e 4,28:1 no escuro, não 4,37:1
  sem tema.

### Adicionado

- **Trilhos de pagamento e fiscal BR no subpath `/br`: Pix, boleto, chave de acesso
  da NFe e feriados/dias úteis — zero dependência nova.** Fatia inteira em
  **9,22 KB brotli**; só Pix (payload + CRC + `PixQRCode`) em **6,10 KB**.
  Nenhuma das quatro é difícil de escrever — são todas difíceis de escrever
  **certo**, e cada uma tem um detalhe que só aparece em produção:
  - **Pix (`pixPayload`, `parsePixPayload`, `pixCrc16`, `pixKeyType`,
    `normalizePixKey`, `PixQRCode`).** O CRC-16/CCITT-FALSE da tag 63 cobre os
    literais **`6304`** — o cabeçalho da própria tag. Errar isso produz um QR que
    abre no app e falha na leitura, e é o erro mais repetido em implementação de
    Pix. O checksum está fixado contra o check value publicado do CRC
    (`"123456789"` → `29B1`) e contra uma segunda implementação, table-driven,
    escrita no teste. `parsePixPayload` é **tolerante com tag desconhecida** (PSP
    adiciona template próprio; leitor que rejeita não serve em produção) e
    **intolerante com CRC divergente** — payload corrompido não aponta mais pra
    conta que o recebedor publicou, então lança em vez de devolver dado. E
    `PixQRCode` renderiza o símbolo **junto** com a copia-e-cola: num checkout
    mobile o QR aparece no mesmo aparelho que iria escaneá-lo, e sem a string
    copiável o usuário fica travado.
  - **Boleto (`parseLinhaDigitavel`, `parseCodigoBarras`, `validateBoleto`,
    `formatLinhaDigitavel`, `boletoKind`, `boletoDueDate`, `fatorVencimento`,
    `mod10Dac`, `mod11DacCobranca`, `mod11DacArrecadacao`).** Cobrança e
    arrecadação têm **44 dígitos os dois** e nada em comum além disso: todo campo
    muda de posição e de significado. O SDK devolve união discriminada e nunca lê
    um com o layout do outro — posição 3 fora de `6-9` num `8…` é **rejeitada**,
    não interpretada. Os dois módulos 11 também divergem: cobrança resolve resto
    `0`/`1`/`10` pra **1**, arrecadação resolve `0`/`1` pra **0**; trocar um pelo
    outro dá dígito errado 3 vezes em 11, o que passa em teste de amostra pequena.
    E o **fator de vencimento tem duas bases** desde 22/02/2025 (o campo saturou
    em 9999 em 21/02/2025 e reiniciou em 1000 sobre 29/05/2022, comunicado
    FEBRABAN FB-009/2023): as duas leituras são genuinamente ambíguas, então
    `"auto"` escolhe a mais próxima de `reference` e expõe em
    `vencimentoEpoch` **qual** usou, em vez de fingir certeza.
  - **Chave NFe (`parseChaveNFe`, `validateChaveNFe`, `chaveNFeCheckDigit`,
    `formatChaveNFe`).** O `cUF` resolve no **tipo `UF` do próprio módulo** — a
    tabela de siglas não é duplicada, só os códigos IBGE. Modelo ou `tpEmis` fora
    da tabela vem `null` em vez de chute; `cUF` inexistente é erro.
  - **Feriados (`holidaysFor`, `isHoliday`, `isBusinessDay`, `nextBusinessDay`,
    `addBusinessDays`, `easterSunday`).** Carnaval, Sexta-feira da Paixão e Corpus
    Christi **não são feriados nacionais por lei**, mas a Resolução CMN 4.880/2020
    fecha os bancos nos quatro dias — então eles vêm marcados `kind: "banking"`,
    contam no default (é o calendário que quebra dinheiro) e saem com
    `kinds: ["national"]`. Feriado estadual e municipal ficam **de fora com motivo
    escrito**: são 5 570 municípios livres pra declarar os seus, nenhuma tabela
    fica completa — entram por `extra`. Os quatro dias móveis derivam do _computus_
    gregoriano (Meeus/Jones/Butcher), aritmética inteira, sem tabela e sem
    dependência.

- **Passkeys (WebAuthn) em `auth`.** `createPasskeyClient` (sem framework) +
  `usePasskeyRegistration` / `usePasskeySignIn` / `usePasskeyCapabilities`, mais
  `isPasskeySupported`, `isPlatformAuthenticatorAvailable`,
  `isConditionalMediationAvailable`, `base64UrlToBytes` / `bytesToBase64Url` e
  `classifyPasskeyError` / `PasskeyError`. **2,20 KB brotli, zero dependência** — o
  encanamento base64url ↔ `ArrayBuffer` é o que todo integrador reimplementa errado
  (base64 puro no `atob` come o último byte), e uma dependência pra dez linhas seria
  absurda. Três decisões que valem por si:
  - **`isPlatformAuthenticatorAvailable()` é obrigatória, não enfeite.** Oferecer
    "entrar com passkey" num aparelho sem autenticador manda a pessoa pra uma folha
    que só dá cancelar. `platformAvailable === null` significa "o sondador ainda não
    respondeu" — não renderize nada de passkey nesse estado.
  - **Mediação condicional (autofill) é suportada** e documentada com o que ela
    exige do seu HTML: sem `autocomplete="username webauthn"` no campo a lista
    **nunca** aparece e nenhum erro é emitido, então é o tipo de falha que ninguém
    debuga sozinho.
  - **O erro é classificado como em `classifyMediaError`.** `cancelled` cobre
    `NotAllowedError`, que é "cancelou **ou** expirou" — indistinguíveis **por
    design**, porque dizer qual vazaria a existência da conta. `already-registered`
    (`InvalidStateError`) é _sucesso disfarçado_: o aparelho já tem passkey dessa
    conta. `rp-mismatch` (`SecurityError`) é o erro de integração nº 1 e a mensagem
    diz exatamente isso: `rp.id` tem que ser o domínio da página ou um pai
    registrável dele.
- **`createResumableUpload` em `http`, falando tus 1.0.0.** 2,58 KB brotli.
  `uploadWithProgress` faz **uma** request, o que quebra nas gravações longas que o
  `useAudioRecorder` agora produz: chunks de 5 MiB, `onProgress`, `pause()`,
  `resume()`, `abort({ discard })`, retomada depois de queda de rede **e** depois de
  reload.
  - **Protocolo publicado, não inventado.** tus (core + creation + termination) tem
    servidor de estante (`tusd`, `tus-node-server`, `py-tus`), então o backend não é
    obrigatoriamente nosso. A tabela do que o servidor precisa implementar está em
    `docs/resumable-upload.md`.
  - **A falha que importa é o chunk que o servidor gravou e cuja resposta se
    perdeu.** Resolvida em duas frentes: escrita **endereçada** (todo `PATCH` declara
    seu offset, então repetir leva `409`) e um `HEAD` de ressincronização antes de
    **qualquer** retentativa. A criação — a única request que o tus não torna
    idempotente — leva `Idempotency-Key` (de `generateIdempotencyKey`), gravado
    **antes** da primeira tentativa, senão um `201` perdido deixa upload órfão.
  - **Backoff é o `retry` do SDK**, não um segundo. Estado de retomada em
    `localStorage` por padrão (`createLocalUploadStorage`) — quatro campos e uma URL
    não justificam arrastar IndexedDB pro bundle de quem só envia arquivo; quem já
    tem Dexie aberto passa o próprio `storage`.
- **`useAnnounce` em `hooks`** — 382 B. Região viva compartilhada, com `announce`
  puro pra fora do React e `clearAnnouncer` pra teardown.
  - **Duas regiões, uma polida e uma assertiva.** Politeness é propriedade **da
    região**, lida quando a tecnologia assistiva a registra; trocar `aria-live`
    depois é honrado por alguns leitores, ignorado por outros e às vezes perde o
    anúncio.
  - **A mesma string duas vezes anuncia duas vezes.** O leitor reage a _mudança de
    conteúdo_, então reescrever o mesmo texto não anuncia — a falha silenciosa
    clássica desse tipo de utilitário. Cada chamada troca o **elemento filho** da
    região: a mutação é real mesmo com string idêntica, e o leitor ouve a mensagem
    exata, sem caractere de padding pendurado.
  - As regiões nascem no mount, antes da primeira mensagem: região inserida no mesmo
    frame do primeiro conteúdo costuma perder aquele anúncio.
- **Edição inline no `DataTable`** — opt-in por `editable` na coluna +
  `onCellChange` na tabela. `Enter` confirma, `Escape` descarta, `Tab`/`Shift+Tab`
  andam célula a célula (row-major), blur confirma. `validate` por coluna bloqueia o
  commit e mantém o editor aberto com `aria-invalid` + mensagem ligada por
  `aria-describedby`. `editorType`, `parse` e `formatEdit` cobrem coluna numérica,
  data e valor formatado.
  - **Otimista com rollback _visível_.** A célula mostra o valor novo na hora
    (`aria-busy` enquanto salva) e, se a promessa rejeitar, volta ao antigo **e**
    mostra o motivo num `role="alert"`. Reverter em silêncio é pior do que não ser
    otimista: a pessoa viu a edição aparecer e não tem motivo pra desconfiar.
  - **Sem coluna `editable` (ou sem `onCellChange`) o markup é o de antes** — a API
    publicada não muda, e há teste afirmando que a tabela read-only não ganha nem um
    `<button>`.

- **Captura de áudio: gravação, permissão, dispositivos e saída de som.**
  Fatia inteira em **5,50 KB brotli**, sem uma dependência nova.
  | Export                                                                      | O que resolve                                                                                 |
  | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
  | `AudioRecorder`                                                             | nota de voz completa: permissão, medidor de nível, relógio, pausar/continuar, revisão, retake |
  | `AudioPlayer`                                                               | transporte pra um clipe; aceita `Blob`, com `sinkId` e revoke automático do object URL        |
  | `useMediaPermission`                                                        | estado da permissão **sem** disparar o prompt                                                 |
  | `useMediaDevices`                                                           | mics e saídas, reage a `devicechange`, expõe `labelsAvailable`                                |
  | `useMicrophone`                                                             | stream + erro classificado + release correto das tracks                                       |
  | `useAudioRecorder`                                                          | status, relógio que desconta pausa, nível, `maxDurationMs`, chunks                            |
  | `createAudioRecorder` · `createLevelMeter`                                  | as duas peças imperativas, sem React                                                          |
  | `blobToWav` · `encodeWav`                                                   | WAV 16-bit sem dependência, com `mono`/`sampleRate`                                           |
  | `setAudioOutput` · `isAudioOutputSelectionSupported`                        | roteamento de saída (`setSinkId`)                                                             |
  | `classifyMediaError` · `missingCaptureApiError` · `isMediaCaptureSupported` | a taxonomia de erro, reusável                                                                 |
  | `formatDuration`                                                            | `mm:ss`, e `--:--` pra duração desconhecida                                                   |
  | `AUDIO_MIME_CANDIDATES` · `pickAudioMimeType` · `isAudioRecordingSupported` | negociação de container                                                                       |
  | **O prompt de permissão não dispara no mount.** Um prompt que o usuário     |
  | não provocou é a forma mais confiável de ganhar um Block permanente, e      |
  | depois disso o `getUserMedia` rejeita sem nunca mais perguntar. O           |
  | microfone abre no primeiro toque em Gravar, e o toque sobrevive ao          |
  | round-trip — o componente arma a gravação e começa quando o stream          |
  | chega, porque esperar um segundo clique faria o primeiro parecer            |
  | quebrado. Quando a permissão já está `denied`, o componente diz isso e      |
  | como resolver, em vez de oferecer um botão que não pode funcionar.          |
  | **O relógio é nosso, não do `MediaRecorder`.** Ele não reporta duração,     |
  | e o WebM que ele escreve não traz duração no header — daí `<audio>`         |
  | mostrar `Infinity` numa gravação fresca. O relógio também **desconta        |
  | pausa**: um que contasse wall-clock reportaria uma nota de 30 s como        |
  | dois minutos. O `AudioPlayer` aceita `durationMs` por isso, e sem ele       |
  | aplica o único contorno que existe (buscar além do fim pra forçar o         |
  | demux até o último frame).                                                  |
  | **Codec:** default negocia `webm;codecs=opus` → `webm` → `ogg;opus` →       |
  | `mp4;mp4a.40.2` → `mp4`, e `AudioRecording.mimeType` é o que o browser      |
  | reportou, não o que foi pedido. `MediaRecorder` **não** produz MP3 nem      |
  | WAV em navegador nenhum: WAV virou `blobToWav` no cliente (decodifica       |
  | com o decoder do próprio browser, reencoda RIFF/PCM 16-bit — zero           |
  | dependência; `{ mono: true, sampleRate: 16000 }` leva 500 KB pra            |
  | ~80 KB), e MP3 ficou de fora com motivo escrito na doc: um encoder WASM     |
  | de ~150 KB no bundle de **todo** consumidor pra servir um formato é a       |
  | troca que este SDK não faz. Transcodifique no servidor.                     |
  | **`useMicrophone().stop()` não é opcional.** Soltar a referência de um      |
  | `MediaStream` não desliga o microfone: cada track tem que ser parada à      |
  | mão, senão o indicador de gravação do browser fica aceso, o SO mantém o     |
  | dispositivo ocupado, e o próximo `getUserMedia` falha com                   |
  | `NotReadableError`. O hook para as tracks no `stop()`, no unmount e         |
  | antes de reabrir. O gravador **não** é dono do stream: `stop()` deixa o     |
  | microfone aberto de propósito, pra um retake não precisar de outro          |
  | round-trip de permissão.                                                    |
- **`src/styles/contrast.test.ts` — guard de contraste que calcula a razão de
  cada par (texto, fundo) direto do `colors.css`, nos dois temas.** É a peça que
  impede a classe inteira de voltar: o `axe` do jsdom desliga `color-contrast`
  porque não há paint, então isso passava por todo o CI verde e só aparecia no
  browser de alguém. Verifiquei que o guard **reprova** quando o bug antigo é
  reintroduzido, nos dois temas — guard que não exercita o caso é decorativo.
- **Captura de dispositivo: código de barras, vídeo, tela e fala.** Novo módulo
  `capture` + componente `BarcodeScanner`, em **5,40 KB brotli** e sem uma
  dependência nova — as quatro são APIs que o navegador já tem.
  | Export                                                                                 | O que resolve                                                                     |
  | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
  | `BarcodeScanner`                                                                       | leitor completo: visor, mira, lanterna, supressão de repetição, erro classificado |
  | `useBarcodeScanner`                                                                    | a metade de decodificação sobre o `useCameraStream`, com loop que não se sobrepõe |
  | `useTorch`                                                                             | a lanterna da câmera, que é constraint de track viva e não dispositivo            |
  | `isBarcodeDetectionSupported` · `getSupportedBarcodeFormats` · `createBarcodeDetector` | detecção de suporte honesta e a lista de formatos **da plataforma**               |
  | `useVideoRecorder` · `createVideoRecorder`                                             | gravar câmera, tela ou canvas, com `videoBitsPerSecond` e `timesliceMs`           |
  | `useScreenCapture`                                                                     | `getDisplayMedia` com os três estados que importam                                |
  | `useSpeechRecognition`                                                                 | ditado com interim/final e erros classificados                                    |
  | `createMediaRecorder` · `pickRecordingMimeType`                                        | o motor de gravação, agora compartilhado entre áudio e vídeo                      |
  | **Por que não existe fallback de decodificação embutido.** `BarcodeDetector` é         |
  | Chromium-only: não existe no Firefox, em nenhum navegador do iOS (todos são            |
  | WebKit) nem no Chromium de Windows/Linux — confirmado no Chrome headless deste         |
  | CI, onde `"BarcodeDetector" in window` é `false`. Embutir um decodificador             |
  | significaria um build WASM (Reed–Solomon + correção de perspectiva + busca de          |
  | padrão) no bundle de **todo** consumidor do SDK pra servir uma feature — a             |
  | mesma troca que já foi recusada pro encoder de MP3. Então a saída é a costura:         |
  | `supported` é público, `unsupported` é um slot do componente, e `detector`             |
  | aceita qualquer `BarcodeDetectorLike` (o polyfill `barcode-detector`, um               |
  | wrapper de `zxing-wasm`). Um teste passa um decodificador **de verdade** por           |
  | essa costura e fecha o ciclo com o `QRCode` do próprio SDK — a limitação está          |
  | documentada, e a alternativa está provada, não prometida.                              |
  | **Um motor de gravação, dois dispositivos.** `createAudioRecorder` virou uma           |
  | fachada sobre `createMediaRecorder`, que é o mesmo relógio que desconta pausa,         |
  | o mesmo `stop()` que resolve no `onstop` com todos os chunks na mão e a mesma          |
  | negociação de container — o que difere de verdade entre áudio e vídeo é a lista        |
  | de candidatos, e só ela ficou nos dois lados. Duplicar as ~80 linhas deixaria a        |
  | parte sutil (o relógio) em dois lugares pra corrigir. **Nada quebrou:**                |
  | `AudioRecorderHandle`, `AudioRecording`, `AudioRecorderOptions`,                       |
  | `createAudioRecorder`, `pickAudioMimeType` e `useAudioRecorder` mantêm nome,           |
  | forma e mensagens de erro — os 277 testes de áudio passam sem uma linha                |
  | alterada, que é a prova. Custo medido: a fatia de áudio vai de **5,65 KB para          |
  | 5,72 KB brotli** (+70 B, o módulo extra no grafo preservado).                          |
  | **`ended` é o único sinal de que o compartilhamento de tela acabou.** Quando o         |
  | usuário aperta "Parar compartilhamento" na barra do próprio navegador, nenhuma         |
  | promise rejeita e nada na sua UI foi clicado — sem esse listener o app fica            |
  | exibindo "gravando" sobre um stream morto. E fechar o seletor **não é erro**:          |
  | produz o mesmo `NotAllowedError` que um bloqueio por política, mas um prompt de        |
  | captura de tela é sempre iniciado pelo usuário, então a causa provável é "mudei        |
  | de ideia" e um toast vermelho pune quem usou o seletor. Vai para `onCancelled`         |
  | com a rejeição crua, não para `error`.                                                 |
  | **O reconhecimento de fala manda o áudio para um servidor do Google.** No              |
  | Chromium, a cada `start()`, sem configuração que mude e sem nada na API dizendo        |
  | isso. Está na doc como `!!! danger`, não como nota de pé, porque é um fato de          |
  | privacidade que o consumidor precisa saber **antes** de embarcar. Também não há        |
  | auto-restart quando o motor encerra a sessão no silêncio: um loop de reinício é        |
  | como um app acaba segurando o microfone — e transmitindo áudio para terceiros —        |
  | indefinidamente.                                                                       |
  | **O `AIChat` continua sem saber o que é fala.** O ditado entra pelo                    |
  | `composerRef` (novo) mais o `getValue()` (novo, no `AIChatComposerHandle`): o          |
  | botão que você põe em `composerActions` lê o rascunho e escreve nele. Acoplar o        |
  | reconhecimento ao componente faria todo consumidor do `AIChat` pagar por uma           |
  | API que manda áudio pra terceiros.                                                     |

### Mudado

- **`useCameraStream` expõe `stream` e aceita `enabled`.** Adições, não
  quebras. O `stream` é pra quem precisa da **track** e não da imagem (lanterna,
  tamanho real do frame, gravar o que a câmera vê). O `enabled` existe porque
  abrir a câmera pra depois dizer "este navegador não decodifica códigos" gasta
  um prompt em nada — e uma recusa é permanente, então gasta também a próxima
  feature que precisar da câmera. O `useBarcodeScanner` passa
  `enabled: supported`.
- **A classificação de erro de câmera deixou de ser uma segunda cópia.** O
  `useCameraStream` agora delega pro `classifyMediaError` do módulo de áudio e só
  renomeia um `kind` (`not-found` → `no-camera`, que é o nome já publicado nessa
  superfície). As mensagens e os `kind` continuam idênticos; `MediaDeviceKindLabel`
  ganhou `"screen"` pro `getDisplayMedia` usar a mesma tabela em vez de uma
  terceira cópia.

### Corrigido

- **`AudioRecorder`: o botão Parar não usa vermelho sólido com texto
  branco.** Medido no browser real: branco sobre `--tempest-danger-solid`
  dá **3,76:1** no tema dark, abaixo do piso de 4,5:1 para texto — e todas
  as variantes sólidas reprovam lá (`--tempest-danger` dá 2,77:1 contra
  branco em dark, `-hover` 3,76:1). Só `--tempest-danger-fg` sobre
  `--tempest-danger-bg` passa nos dois temas (8,2:1 light, 6,57:1 dark),
  e é o par usado, com borda em `--tempest-danger` pra o controle
  continuar inconfundível.
  O `Button variant="danger"` do SDK usa o par sólido e mede o mesmo
  3,76:1 em dark — **defeito pré-existente**, fora do escopo deste PR,
  registrado aqui porque a medição saiu daqui.
- **`useMicrophone` reportava `unknown` quando o `navigator.mediaDevices`
  não existe em contexto seguro.** Deveria ser `unsupported`: um
  `mediaDevices` ausente é quase nunca "este navegador não faz áudio" — é
  uma página em HTTP, e a distinção importa porque as correções são
  opostas (uma URL vs. outro navegador). Virou
  `missingCaptureApiError()`, que checa contexto seguro primeiro. Pego por
  teste.
- **`#ffffff` sobre preenchimento de status reprovava o contraste de texto —
  inclusive no tema claro, que é o default.** Medido a partir do próprio
  `colors.css`:
  | Par                                                                             | Light    | Dark     |
  | ------------------------------------------------------------------------------- | -------- | -------- |
  | branco / `--tempest-primary`                                                    | 4,83     | **3,68** |
  | branco / `--tempest-danger-solid`                                               | 4,83     | **3,76** |
  | branco / `--tempest-info-solid`                                                 | 5,17     | **3,68** |
  | branco / `--tempest-success-solid`                                              | **3,30** | **2,28** |
  | branco / `--tempest-warning-solid`                                              | **3,19** | **2,15** |
  | Verde médio e âmbar não carregam texto branco em tema nenhum — é por isso que   |
  | todo design system que os embarca põe texto escuro em cima. Entram              |
  | `--tempest-danger-on-solid`, `--tempest-success-on-solid`,                      |
  | `--tempest-warning-on-solid` e `--tempest-info-on-solid`, e o                   |
  | `--tempest-primary-foreground` (que já era o "on primary": **todos** os 16 usos |
  | dele no SDK ficam sobre `--tempest-primary`) ganhou valor próprio no dark. A    |
  | tinta escura é um quase-preto puxado pro matiz (`#1f0606`), não preto puro.     |
  | Atinge `Button` (`primary`, `danger`, `success`), `Alert` e `Badge` nas         |
  | variantes `solid`, e os badges de `NavigationRail` e `BottomNavigation` — que   |
  | pediam `var(--tempest-danger-on, #fff)`, um token que **nunca existiu** e caía  |
  | no fallback branco.                                                             |
- **No tema escuro, `--tempest-primary-hover` e `-active` escureciam em vez de
  clarear.** A escala é invertida no dark (300 é o passo mais escuro), então
  pegar 400/300 aplicava o gesto do tema claro numa superfície escura — e fazia o
  preenchimento fugir do próprio texto: nenhum foreground único passava 4,5:1
  contra `#3b82f6`, `#2563eb` e `#1a4399` ao mesmo tempo. Agora sobem a rampa
  (600/700). `--tempest-danger-hover` no dark, que era igual ao próprio
  `danger-solid`, também clareia.
- **Texto sobre `--tempest-primary-soft` usava `--tempest-primary-active`, um
  token de preenchimento.** No dark isso era azul escuro sobre azul escuro:
  **1,65:1**. Corrigido para `--tempest-primary-on-soft` em `Badge`, `Button`,
  `Combobox`, `DateRangePicker` e `MultiSelect` — a regra que o `docs/styles.md`
  já documentava e o código não seguia.

### Alterado

- **O tipo `AudioPlayer` virou `AudioPlayerHandle`** (breaking, só de
  tipo). O nome `AudioPlayer` passou a ser o componente, e o tipo
  devolvido por `createAudioPlayer()` sempre foi um handle — alinha com
  `ChatComposerHandle` e `SignaturePadHandle`, que o SDK já usa.
  Migração: `import type { AudioPlayerHandle } from "tempest-react-sdk"`.
- **`playAudio` e `createAudioPlayer` aceitam `sinkId`**, aplicado antes
  do `play()` — aplicar num elemento já tocando reinicia o pipeline de
  áudio e corta os primeiros milissegundos.
- **Budgets do `size-limit`**: nova fatia `slice: audio capture` com teto
  de 7 KB (mede 5,50 KB). Tetos do barrel subiram: ESM 98 → 103 kB, CJS
  118 → 124 kB.
- **`SyncStatusBadge` com `iconOnly` agora mantém o rótulo no acessível.** O badge é
  uma região `role="status"`; deixar de renderizar o texto deixava uma região viva
  cujo conteúdo nunca mudava, então virar `offline` ou `error` era anunciado como
  nada. O rótulo passou a ser sempre renderizado, invisível quando `iconOnly` —
  `title` não é conteúdo e não é anunciado numa mudança. Fica **fora** do
  `useAnnounce` de propósito: é estado persistente na tela, que é exatamente o que
  `role="status"` descreve, e anunciar de novo leria cada mudança duas vezes.
- **A pilha do `Toast` deixou de ser `aria-atomic="true"`** e os itens deixaram de
  ter `role="status"` próprio. Com atomic o leitor relia a **pilha inteira** a cada
  toast (o terceiro de uma rajada era anunciado como os três) e uma região viva
  dentro de outra é anunciada duas vezes em parte dos leitores. Continua sendo a
  própria pilha a região viva, e não o `useAnnounce`: rotear por lá colocaria o mesmo
  texto duas vezes no documento e todo `getByText("Salvo")` de app consumidor passaria
  a casar dois nós.
- **Budgets do `size-limit`**: quatro fatias novas — passkeys (2,20 KB, teto 2,5),
  upload resumível (2,58 KB, teto 2,9), `useAnnounce` (382 B, teto 600 B) e
  `DataTable` com edição (4,80 KB, teto 5,2). Tetos do barrel subiram de novo: ESM
  103 → 108 kB, CJS 124 → 130 kB.

### Documentação

- **`audio` deixou de ser só reprodução.** A página ganhou a metade de
  captura em PT-BR e EN-US, no padrão tutorial: componente primeiro,
  depois os hooks, com tabela de estados de permissão, taxonomia de erro
  classificado, o que dá e o que não dá em formato, e por que medidor de
  nível não é enfeite — entrada mutada no SO grava silêncio **com
  sucesso**, e sem nível visível o usuário só descobre depois de terminar
  de falar.
- **`AudioRecorder` e `AudioPlayer` no gallery** numa seção que grava de
  verdade — nada mockado, porque um gravador falso esconde exatamente os
  estados que valem olhar.
- **`styles` ganhou a seção `*-on-solid`** (PT-BR + EN-US) com os números
  medidos, a explicação da rampa invertida do dark e o ponteiro pro guard.
- **Gallery: o rótulo da amostra de paleta saiu de dentro da cor.** Escolher a
  cor do rótulo por número de passo (`step >= 500 ? "#fff"`) não pode funcionar
  com a escala invertida do dark, onde ≥500 é a metade **clara** — media 3,14:1.
  O rótulo agora fica embaixo da amostra, o que remove a questão em vez de
  ajustá-la.
- **Duas páginas novas, PT-BR + EN-US:** `passkeys` (as duas cerimônias, os
  sondadores, a tabela `kind` → o que a UI faz, e as **quatro rotas que o backend
  precisa implementar** — um cliente WebAuthn que documenta só a própria metade é
  inútil) e `resumable-upload` (a tabela do protocolo tus, a falha da resposta
  perdida, onde mora o estado de retomada).
- **`hooks` ganhou `useAnnounce`** e **`components/data` ganhou a seção de edição
  inline do `DataTable`** (teclado, rollback visível, acessibilidade, props), nos dois
  idiomas.
- **Gallery: duas seções novas** (`Passkeys (WebAuthn)` e `Upload resumível (tus)`) e
  um exemplo de `DataTable` editável cujo backend de mentira **recusa** um valor que
  você pode digitar — é o único jeito de ver rollback e estado de erro de verdade no
  browser. Na seção de passkey as cerimônias são reais: o &ldquo;servidor&rdquo; mora
  na página, mas o `navigator.credentials` é o do navegador, então o erro que aparece
  é o classificado de verdade.

### Acessibilidade

- **O nome acessível da célula editável sai do conteúdo dela, não do valor cru.**
  Achado no browser real: com `aria-label` montado a partir do valor, uma coluna
  `<Money cents={850000} />` era anunciada como "Editar Salário: 850000" sobre uma
  célula que **mostra** `R$ 8.500,00` — reprova o WCAG 2.5.3 (Label in Name) e deixa
  controle por voz sem como chamar a célula pelo que ela diz. Agora um
  `Editar {coluna}:` invisível precede o que a coluna renderizou, e o nome passa a ser
  "Editar Salário: R$ 8.500,00". O `axe` do jsdom não pega isso (a regra de
  label-in-name é experimental e desligada).
- **Célula editável tem afordância em repouso**, não só no hover: um sublinhado
  tracejado fraco. Em tela de toque não existe hover, então célula editável idêntica à
  read-only é indescobrível. Hover e foco promovem pra caixa inteira.
- **Alvo de toque da célula cresce até o `<td>` inteiro** sob `pointer: coarse`
  (`::after` com o inset exatamente igual ao padding da célula). Passa dos 44px sem
  invadir a linha vizinha, que é o que um hit-slop simétrico faria numa tabela densa.

## [0.35.0] — 2026-08-02

### Adicionado

- **Módulo `perf` — quanto custou rodar inferência no dispositivo do
  usuário.** Quando o modelo roda no navegador, não existe gráfico de
  servidor: o que chega é "o app está lento no celular do fulano", e sem
  número isso pode ser três coisas que pedem correções opostas — download de
  modelo, forward pass pesado, ou NMS com threshold baixo demais.

  ```typescript
  import { createInferenceProfiler } from "tempest-react-sdk";
  import { Detector } from "tempest-react-sdk/vision";

  const profiler = createInferenceProfiler();
  const detector = await profiler.stage("load-model", () => Detector.create("/models/detect.onnx"));
  const results = await profiler.stage("detect", () => detector.predict(blob));
  profiler.mark("forward-pass", results[0].speed.inference);

  const report = await profiler.report({
    models: [{ name: "detector", cacheName: "app-models", url: "/models/detect.onnx" }],
  });
  // { timings, totalMs, device, models, measuredAt }
  ```

  `stage` / `stageSync` / `mark` alimentam o relatório; nomes repetidos
  acumulam, e uma etapa que lança ainda é medida (registro no `finally`) antes
  de repropagar. As etapas são medidas de forma **independente**, não como um
  ladrilhamento da execução: duas iniciadas juntas recebem cada uma o seu span
  inteiro, então a soma pode passar do `totalMs` — a leitura honesta para um
  pipeline que decodifica a imagem enquanto as sessões carregam.

  Junto vêm `readDeviceProfile()` (`hardwareConcurrency`, `deviceMemory`,
  `performance.memory` — os dois últimos só no Chromium, `null` no resto e em
  SSR), `cachedResponseBytes()` (tamanho de um asset no Cache Storage lido do
  `Content-Length`, porque materializar o blob traria dezenas de MB de pesos
  para a memória a cada medição) e `formatDurationMs()` (`"<1 ms"` em vez de
  `"0 ms"`, que se leria como "não medido").

  O navegador não expõe joules nem FLOPs. Tudo que a plataforma não reporta
  vem `null`, para a UI mostrar "—" em vez de um número inventado.

- **`tempest-react-sdk/vision`: `predict()` agora reporta o tempo de cada
  etapa.** Re-vendorizado do `@mauriciobenjamin700/ort-vision-sdk-web@0.3.0`.
  Os envelopes de resultado sempre tiveram um campo `speed` — e ele sempre
  esteve vazio, porque nenhuma tarefa o preenchia. Agora `results[0].speed`
  traz `{ load, preprocess, inference, postprocess }` em milissegundos, e
  `Speed`/`SpeedTimer` estão exportados do subpath.

### Alterado

- `Results.speed` (subpath `/vision`) passou de `Readonly<Record<string,
number>>` para `Readonly<Speed>`, então `speed.inference` é `number` e não
  `number | undefined`.
- O aviso de depreciação de `decodeYoloV8` / `decodeYoloV8Anchors` /
  `decodeYoloV8Seg` agora aponta para a `0.4.0` do pacote vendorizado. Os
  aliases seguem exportados aqui.

## [0.34.0] — 2026-08-02

### Corrigido

- **O cliente WebSocket não respondia ao `ping` do servidor Tempest — os
  dois SDKs não se falavam.** O `tempest-fastapi-sdk` emite
  `{"type":"ping"}` e espera `{"type":"pong"}`; o `createWebSocket` não
  tratava ping recebido, e o que existia era o oposto — um `pingInterval`
  que **envia** `{"type":"ping"}` ao servidor, frame que o servidor
  Tempest não conhece. Heartbeats incompatíveis nas duas direções, e a
  partir da v0.197.0 do SDK Python isso vira desconexão com código `4408`
  a cada timeout.

  Novo `respondToPing` (default `true`) responde `pongPayload` a todo
  ping recebido, antes do `onMessage`. `pingInterval` segue `0` por
  default — contra um servidor Tempest ele deve ficar desligado.

- **`onOpen` / `onClose` / `onError` ficavam presos no primeiro render.**
  Só `onMessage` era guardado em ref; os demais entravam no
  `createWebSocket` dentro de um `useEffect` com deps `[url, enabled]`,
  capturavam a closure inicial e liam estado velho para sempre. Agora
  todos passam por ref. Pelo mesmo motivo, `protocols`, `maxRetries`,
  `initialBackoff`, `maxBackoff`, `pingInterval` e `queueWhileClosed`
  entraram no dep array: mudar uma reabre a conexão com o valor novo em
  vez de ser ignorada.

- **`close()` durante `CONNECTING` poluía o console de todo app em dev.**
  O `ws.close()` era chamado sem olhar o `readyState`, e com o StrictMode
  do React (monta → desmonta → monta) o primeiro socket sempre morre no
  meio do handshake — `WebSocket is closed before the connection is
established` em **toda** sessão de desenvolvimento. O fechamento agora
  é adiado para o `onopen` quando o socket ainda está conectando.

### Adicionado

- **`queueWhileClosed` + `maxQueuedMessages` em `createWebSocket` /
  `useWebSocket`.** Sem fila, uma ação enviada durante o backoff de
  reconexão sumia em silêncio e a UI não distinguia "não enviou" de
  "enviou e o servidor ignorou". Com a opção ligada o `send()` bufferiza
  (teto de 100 por default, descartando o mais antigo) e drena no `open`
  seguinte, mais antigo primeiro. Um `close()` explícito limpa a fila.

- **`configureApiAuth` no template do `create-tempest-app`.** O
  `src/lib/api.ts` nascia importando `@/stores/auth`, então um projeto
  sem contas precisava editar os dois arquivos ou carregar um store
  morto. A dependência agora aponta ao contrário: o cliente não sabe nada
  de auth e o store é que se registra nele — apagar `@/stores/auth` deixa
  o cliente funcionando sem autenticação.

- **`lastMessage` documentado como foto, não fila.** Cada frame é um
  `setState`, então dois no mesmo tick colapsam num render e só o último
  fica visível — e uma ação no servidor costuma emitir vários frames em
  sequência. Quem precisa de todos os eventos usa `onMessage`; o JSDoc e
  a receita agora dizem isso onde a API é lida.

- **`AIChat` — conversa com um modelo, no formato que ChatGPT, Claude e
  DeepSeek convergiram.** Turnos por papel (`user` / `assistant` /
  `system`), resposta em Markdown (reusa `Markdown` + `CodeBlock`),
  raciocínio em bloco colapsável, cursor de streaming, ações por turno
  (copiar, gerar de novo, editar-e-reenviar, 👍/👎) e um composer que
  troca **Enviar** por **Parar** enquanto a resposta chega. 9,41 KB
  brotli na fatia importada.

  É um componente **novo**, não um `variant` do `Chat`. Uma thread humana
  é endereçada por autor e se preocupa com estado de entrega; um
  transcript de modelo é endereçado por papel, não tem estado de entrega
  nenhum, e precisa de três coisas que uma thread humana nunca precisa:
  saída parcial, raciocínio separado da resposta e re-perguntar. Um
  `variant` misturaria dois modelos de dados no mesmo `props` e deixaria
  `authorId`/ticks mortos no caminho LLM.

  O transporte fica com o app — "como eu faço streaming do meu backend"
  tem resposta diferente por provider. O contrato é reescrever o
  `content` do último turno e manter `streaming: true` nele; o
  `AbortController` que o app passa pro `onStop` é dele.

  Exporta também `AIChatComposer` e `AIChatTurn` (pra layout próprio) e
  os helpers `visibleTurns`, `isGenerating`, `lastAssistantId`,
  `tailSignature`, `aiChatStrings`, `roleLabel`, `turnTime`.

- **`onEditError` no `AIChatTurn`, ligado ao `onSendError` do painel.**
  Uma edição de prompt que rejeita preserva o rascunho no editor e
  reporta o erro, em vez de virar unhandled rejection — a mesma regra
  que o composer já seguia.

### Acessibilidade

- **O transcript é `role="log"` _sem_ `aria-live`.** Região viva sobre
  texto em streaming faz o leitor de tela reler a resposta a cada token.
  Os dois momentos que importam ("Gerando resposta", "Resposta
  concluída") são anunciados por um `role="status"` separado; o turno em
  andamento leva `aria-busy` e a resposta pronta é lida do log no ritmo
  de quem lê. O `axe` do jsdom não pega essa classe de erro — foi
  decisão de projeto, verificada no browser.

- **A linha de ações do turno fica sempre visível onde não existe
  hover** (`@media (hover: none)`). Ação escondida atrás de `:hover` num
  celular é ação inexistente: o primeiro toque cairia no que estiver
  embaixo.

### Responsivo

- **Medido no browser em 360×640, 390×844, 740×360 (celular em
  paisagem), 768×1024, 1440×900, 1920×1080 e 3840×2160.** Em toda
  largura: zero overflow horizontal na página e no transcript, composer
  sempre visível, tabela e bloco de código rolando na própria caixa.

- **A largura da coluna de leitura virou knob:
  `--tempest-ai-chat-width`** (default `48rem`), no lugar de `48rem`
  fixo em cinco regras. Coluna limitada é a resposta certa do celular
  até um desktop 1920, mas de 2560 pra cima a troca se inverte — 768px
  no meio de uma tela de sala é quase só espaço vazio, e só o app sabe a
  que distância a pessoa está sentada. Um valor move os turnos, o
  indicador de "pensando", as sugestões e o composer juntos.

  Tamanho de tipo **não** é resolvido no componente: escalar fonte pra
  TV é decisão de `typography.css`/`density.css`, e uma rampa local
  brigaria com os tokens que todo app tematiza.

- **Alvo de toque das ações do turno vai a 44×44 em `pointer: coarse`**,
  via hit-slop de `::after` que não move um pixel do que se vê — o mesmo
  truque que o `Button` usa nos tamanhos icon-only. 28×28 passa o piso
  de 24×24 da WCAG 2.5.8 mas fica abaixo dos 44×44 da 2.5.5, e são
  quatro botões lado a lado. Mesmo tratamento no botão de voltar ao fim
  do transcript.

  Confirmado com device de toque emulado (`pointer: coarse` e
  `hover: none` verdadeiros): a linha de ações fica com `opacity: 1` e o
  alvo efetivo mede 44×44.

### Performance

- **Só o turno que cresce re-parseia Markdown.** O elemento
  `<Markdown>` de cada turno é memoizado por `content`, e o React
  descarta o re-render de um filho referencialmente idêntico. Sem isso,
  um transcript de cinquenta turnos re-parsearia toda resposta já pronta
  a cada token da mais nova.

- **A dependência do efeito de rolagem não é a lista, é
  `tailSignature()`.** Streaming acrescenta ao _último_ turno; um app
  que mutasse esse objeto no lugar manteria a mesma dependência
  enquanto o texto cresce, e a visão pararia de seguir a resposta.
  Tamanho da lista + identidade do último turno + tamanho do texto dele
  cobrem as duas formas.

### Alterado

- **Budgets do `size-limit` acompanharam a nova superfície**:
  `styles.css` 26 → 28 kB, teto do barrel ESM 94 → 98 kB, CJS 113 →
  118 kB. Nova fatia medida: `{ AIChat }` com teto de 11 KB.

### Documentação

- **`AIChat` documentado em `components/advanced`** (PT-BR + EN-US), no
  padrão tutorial: mínimo funcional primeiro, streaming do zero com o
  laço de `fetch` + `ReadableStream` completo, tabela "você fez / o
  componente faz", raciocínio, ações por turno, sugestões, props e as
  decisões de projeto (resposta é Markdown / prompt é texto puro,
  resposta é documento e não bolha, por que o log não é `aria-live`).

- **Números medidos do README atualizados** — 3969 testes / 451
  arquivos, fatias e tetos remedidos com `npm run size`, incluindo a
  fatia do `AIChat`.

## [0.33.2] - 2026-08-02

### Corrigido

- **O leitor compacto roteava diferente do scikit-learn quando um valor caía
  exatamente no limiar de um corte.** O `sklearn.tree` converte a entrada
  para float32 antes de percorrer a árvore, então um limiar guardado como
  `5.099999904632568` — um valor float32 alargado — e uma entrada `5.1`
  comparam **iguais** lá e vão para a esquerda. Comparando em float64, a
  linha vai para a direita.

  Numa floresta de 20 árvores sobre o iris isso trocava o voto de uma árvore
  em 2 de 105 linhas: probabilidade errada por exatamente 0,05. A comparação
  agora usa `Math.fround`, igual ao Python.

  A fixture `iris_forest` foi escolhida deliberadamente entre as linhas que
  caem no limiar — verifiquei que ela **de fato** separa as duas regras
  (0,05 de diferença), porque fixture que não exercita o caso é guard
  decorativo.

### Documentação

- **"Antes de tudo: de onde vem o modelo"** abre a página `tabular`, com
  diagrama do fluxo e as duas metades — o Python que escreve a pasta e o
  React que a lê — ambas rodando como estão. Antes o primeiro exemplo já
  usava `/models/classifier.onnx` sem dizer de onde o arquivo saía, e o
  passo em Python só aparecia na terceira seção.
- Duplicação removida: o passo de export era ensinado duas vezes, com
  exemplos diferentes.
- `imaging`: o primeiro exemplo agora diz de onde vem o `file`.

## [0.33.1] - 2026-08-02

### Corrigido

- **A rota compacta exigia `onnxruntime-web` instalado — o oposto do que ela
  promete.** `src/tabular/assets.ts` importava o runtime no topo do módulo,
  então importar `tempest-react-sdk/tabular` num projeto sem o peer lançava
  `ERR_MODULE_NOT_FOUND`, mesmo para quem só ia usar o `CompactPredictor`.

  O runtime passou a entrar por `import()` **dinâmico**, dentro do
  `TabularPredictor.create` — o primeiro momento em que ele realmente
  existe para ser usado. `configureOrtAssets` guarda o caminho e o predictor
  o aplica na criação da sessão, então a API pública não mudou.

  Sem o peer, a rota ONNX agora falha com `ModelLoadError` dizendo
  `npm install onnxruntime-web` e apontando a alternativa compacta — em vez
  de um erro de resolução de módulo.

  **Achado instalando o pacote publicado num projeto vazio.** Nenhum teste
  pegou: todos importavam módulos folha diretamente, e a árvore de
  desenvolvimento sempre tem o peer instalado. Agora há guard
  (`peer-independence.test.ts`) travando import estático nos módulos que o
  barril alcança.

## [0.33.0] — 2026-08-02

## [0.32.1] — 2026-08-01

## [0.32.0] — 2026-08-01

### Adicionado

- **Três rotas para rodar sklearn no navegador, à escolha do app.** O custo
  não é o modelo: `onnxruntime-web` são **25,6 MB de WebAssembly** (6,0 MB
  gzipped) antes da primeira predição, contra 20 KB de uma floresta em ONNX.

  - **A — `CompactPredictor`, sem runtime nenhum.** Lê o formato `.tmc` que o
    `export_sklearn_to_compact` do `tempest-fastapi-sdk` escreve. Modelo
    linear é produto escalar, árvore é comparação encadeada: ~2 KB de leitor
    no lugar de 6 MB gzipped. Cobre linear, árvore, floresta, extra-trees,
    seus regressores e `StandardScaler`/`MinMaxScaler` em Pipeline; o que não
    cobre, **recusa exportar** em vez de aproximar.
  - **B — `.ort` com build mínimo do ORT.** Testado: o bundle padrão carrega
    `.ort` normalmente, então dá para preparar a rota antes de compilar o
    runtime sob medida. Documentado com a medição que evita a ilusão — o
    `.ort` **aumenta** o arquivo (526 B → 2.360 B); quem encolhe é o binário
    do runtime.
  - **C — ONNX padrão.** Continua igual, e é a escolha certa quando o app já
    carrega `onnxruntime-web` para outra coisa: custo marginal zero,
    cobertura total.

  `loadEdgePackage(url, { runtime: "auto" | "compact" | "onnx" })` escolhe.
  `"auto"` prefere a compacta quando o pacote a carrega. Pedir `"compact"`
  num pacote sem ela **dá erro dizendo isso**, em vez de baixar 25 MB de
  WebAssembly em silêncio.

  **As duas rotas devolvem o mesmo objeto, inclusive o tipo do rótulo.** O
  teste que fechou isso pegou uma divergência real: a rota compacta devolvia
  `"0"` onde o ONNX devolve `0`. O formato passou a gravar o dtype das
  classes do scikit-learn, e trocar de rota deixou de mexer no código do app.

  Testes cross-language: as fixtures são geradas pelo Python junto das saídas
  do scikit-learn, e o leitor JS reproduz rótulos idênticos e probabilidades
  em 5 casas nas 7 famílias.

  **Validado em Chromium real** (`e2e/tabular.spec.ts`, 5 casos contra o
  `dist`): a rota compacta **não busca nenhum `.wasm`** — provado pela
  timeline de recursos da página —, responde igual ao scikit-learn nas 7
  famílias e segue respondendo com o `fetch` derrubado. Medido lá: carga de
  **6,0 ms contra 579,6 ms** do ONNX e predição de **0,0035 ms contra
  0,0575 ms**, com o wasm servido localmente (sem rede, o piso).

- **Manifesto lê a procedência (`source`).** Pacote gerado pelo
  `edge_pipeline_from_pickle` do `tempest-fastapi-sdk` (v0.193.0) carrega o
  nome, o SHA-256 e a versão do scikit-learn que converteu o `.pkl`. Campo
  **opcional**, `schema_version` continua `1`: pacote sem ele carrega igual.
  O `.pkl` não viaja para o navegador — pickle é programa Python, não dado —
  mas o carimbo de origem viaja, e é o que rastreia um modelo numa aba de
  volta até a esteira de treino. A fixture dos testes passou a ser gerada
  por esse caminho.

- **`tempest-react-sdk/imaging` — processamento de imagem no navegador, para
  PWA em borda.** Sem dependência: é `createImageBitmap` mais canvas, com as
  armadilhas resolvidas. `resizeImage` (fit `contain`/`cover`/`fill`/`pad`,
  sem ampliar por padrão), `cropImage` (retângulo limitado à imagem),
  `rotateImage` (múltiplos de 90), `flipImage`, `compressToTarget` (busca
  binária de qualidade até caber num orçamento de bytes, e **reporta** quando
  não cabe em vez de lançar), `createThumbnails` (vários tamanhos numa
  decodificação só — decodificar é o custo, não escalar), `decodeImage`/
  `readImageInfo`, `encodeImage`, `supportsImageType`/`bestSupportedType`, e
  os hooks `useImagePreview` (revoga o object URL) / `useImageProcessing`
  (não escreve estado depois do unmount). Novo subpath `./imaging`, budget de
  5 KB.

  **Três achados medidos em Chromium e Firefox:**

  1. Foto de celular vem deitada — retrato gravado como paisagem mais etiqueta
     de rotação. O módulo decodifica com `imageOrientation: "from-image"`;
     medido: JPEG 120x60 com `Orientation=6` sai 60x120.
  2. Pedir AVIF onde não há encoder **devolve `image/png` sem erro**, nos dois
     motores. Por isso todo retorno traz o formato produzido, não o pedido.
  3. **A redução em passos foi implementada e depois apagada.** Xadrez de
     512 px reduzido para 32 px deu resultado idêntico ao `drawImage` único
     com `imageSmoothingQuality = "high"` (desvio padrão 0,0 nos dois),
     enquanto o caminho em passos custou 39,19 ms contra 0,13 ms numa foto
     4000x3000 — 300x mais, com três canvas intermediários. Benefício não
     mensurável a 300x o custo não é garantia, é peso morto.

  Os testes de pixel rodam em Chromium de verdade (`e2e/imaging.spec.ts`,
  10 casos contra o `dist` construído), incluindo um JPEG com segmento EXIF
  montado à mão para provar a orientação e a remoção do metadado no
  reencode. Os unitários em jsdom cobrem a geometria e os erros.

- **`tempest-react-sdk/tabular` — modelos de scikit-learn rodando no navegador,
  offline.** Contraparte da camada de borda do `tempest-fastapi-sdk`: o mesmo
  `.onnx` que `export_sklearn_to_onnx` produz, servido como asset estático e
  executado no cliente. `TabularPredictor` (resolve nome de entrada e qual
  saída é rótulo/score, valida largura da linha antes do runtime, `dispose()`),
  `useTabularPredictor` (carga assíncrona, cancelamento no unmount, liberação da
  sessão, `isReady`/`reload`), cache de modelo em Cache Storage
  (`fetchModelBytes` cache-first, `isModelCached`, `cacheModelBytes`,
  `clearModelCache`) e assets do runtime (`configureOrtAssets`, `ortAssetUrls`,
  `ORT_WASM_ASSETS`). `onnxruntime-web` continua peer opcional; novo subpath
  `./tabular` com budget de 6 KB.

  **Quatro achados medidos em browser real, não deduzidos** — cada um vira erro
  com instrução em vez de mensagem crua do runtime:

  - Importar `onnxruntime-web/webgpu` carrega um WebAssembly **sem o domínio
    `ai.onnx.ml`**, e a sessão nem abre (`No Op registered for
TreeEnsembleClassifier`). Modelos sklearn são feitos desses operadores, então
    o default é `["wasm"]` e o caso vira `UnsupportedGraphError`.
  - O ONNX Runtime Web **não embute o `.wasm`**, nem nos builds `.bundle`: sem os
    binários ao lado, falha com `Aborted(both async and sync fetching of the wasm
failed)`. Daí `ortAssetUrls` existir para o precache.
  - Rótulo int64 chega como `bigint` — `label === 1` dá `false` em silêncio e
    `JSON.stringify` lança. Convertido para `number`.
  - Export do `skl2onnx` com ZipMap (o default dele) devolve sequência de mapas,
    que o runtime web recusa ler; o erro aponta `export_sklearn_to_onnx`.

  **Pacote de borda (contrato entre os dois SDKs):** `loadEdgePackage` e
  `fetchEdgeManifest` leem o diretório que o `edge_pipeline` do
  `tempest-fastapi-sdk` publica (grafo + gzip + baseline + `manifest.json`).
  Trazem a **ordem das colunas do treino** — o campo que evita o erro que
  nenhuma checagem de runtime pega, features certas na ordem errada
  respondendo com confiança e errado — mais as classes por coluna de score e
  uma `version` derivada do conteúdo, para checar novidade sem baixar o
  modelo. `schema_version` mais novo que o leitor é recusado com instrução;
  campo desconhecido é ignorado. A fixture dos testes foi **gerada pelo
  próprio `edge_pipeline`**, não escrita à mão.

  Os testes do predictor rodam contra **modelos reais** exportados pelo
  `tempest-fastapi-sdk` (fixtures de ~1,5 KB) e conferem rótulo e probabilidade
  contra o que o scikit-learn prevê — mock testaria o contrato que eu escrevi, não
  o que o ONNX Runtime tem. O `dist` construído foi verificado num Chromium real,
  incluindo o caminho offline com `fetch` derrubado.

  `error.name` é string literal em toda a hierarquia: com `new.target.name` o
  build minificado reportava `error.name === "t"`.

- **Aba "Design de Software" na documentação** — 11 páginas bilíngues ensinando o
  desenho do app que consome o SDK: camadas de um app frontend e a regra da seta
  única, estrutura de pastas por feature, fluxo de dados (`apiClient` → serviço →
  Query → página → UI), onde mora cada estado, pensando em componentes, limites
  objetivos, tipagem forte, estratégia de testes, 15 anti-padrões com refactor e
  um checklist de revisão. Estilo tiangolo: motiva → código completo → explica →
  Recap.
- **Nav em 7 abas de topo** (`navigation.tabs` + `tabs.sticky`) com paridade de
  tema com o `tempest-fastapi-sdk`: paleta indigo de 3 estados, botões de
  editar/ver a página, `content.tabs.link`, `navigation.path`, diagramas mermaid
  nativos. As 12 entradas raiz antigas viravam 12 abas e lotavam o header.
- **Seção `Design` no `tempest doctor`** — a doc deixou de ser só doutrina. O CLI
  mede o projeto e reporta com arquivo e linha: arquivo acima de 150 (`.tsx`) /
  200 (`.ts`) linhas de código, corpo de função acima de 80, hook acima de 100,
  `<X>Props` com mais de 7 membros, função **exportada** com mais de 3
  parâmetros, `any` em posição de tipo, `@ts-ignore`, `fetch`/`axios` dentro de um
  `.tsx`, `catch` de corpo vazio e cor literal em `style={{ … }}`. Escaneia sem
  parser de TypeScript (o `doctor` roda em projeto que ainda não instalou nada):
  um mask que apaga comentário, string e regex mantendo offset e linha, e brace
  matching por cima dele.
- **Marcador `@tempest-limits <regra> — <motivo>`** como saída de emergência
  escrita. Estourar um limite é permitido; estourar em silêncio não. O `doctor`
  suprime a regra citada, conta os waivers, e **reporta o marcador sem motivo** —
  waiver sem explicação é exatamente o que ele existe pra evitar. Um
  `eslint-disable` de `no-explicit-any` já vale como waiver daquela linha: o
  mecanismo padrão ganha.
- **`tempest doctor --no-design` e `--no-css`** pra pular uma passada.

### Notas

- A seção `Design` **nunca** derruba o exit code do `doctor`: todo achado é
  `warn` ou nota. Limite é heurística, e reprovar CI por heurística é o caminho
  mais curto pra alguém silenciar a ferramenta — os gates duros continuam sendo
  `no-explicit-any` como `error` no ESLint e `tsc --noEmit`.
- Aninhamento de JSX e complexidade ciclomática **ficaram de fora** de propósito:
  as duas precisam de parser de verdade pra não acusar quebra de linha do
  Prettier. Continuam com o ESLint (`max-depth`, `complexity`).
- Calibrado no dogfood, e as duas primeiras versões das regras erravam: contar
  `className`/`children`/`...rest` como prop fazia todo primitivo do SDK parecer
  dois componentes, e `param-count` em helper privado pedia objeto nomeado pra
  função de loop apertado. Depois do ajuste, o app que o
  `create-tempest-app` gera sai com **zero achados**.
- O link morto `#codeblock` em `docs/components/advanced.md` foi corrigido —
  MkDocs só reporta anchor inexistente como `INFO`, então `--strict` passava.

## [0.31.1] — 2026-07-27

### Adicionado

- **Fatia de dashboard no `utilities.css`** (opt-in): `.tempest-dashboard`,
  `.tempest-widget` com spans `-half`/`-third`/`-quarter`/`-two-thirds`,
  `.tempest-widget-tall`, `.tempest-stat-row` e a moldura
  `.tempest-widget-frame`/`-header`/`-title`/`-body`. Fecha o item de "receita de página
  inteira" do backlog de CSS — e é **só CSS**, nenhum componente novo: layout de página
  não precisa de componente pra ser dono dele.
- **As colunas reagem ao contêiner, não ao viewport** — primeira vez que o SDK usa
  `@container`. Medido no browser com viewport de 1360px: o mesmo dashboard dentro de um
  painel de 440px vira **coluna única**; com 660px o `-third` e o `-half` dividem a linha;
  com 1060px o `-two-thirds` fica em `span 8` ao lado do `-third` em `span 4`. Media query
  daria o span de desktop pro painel de 440px, e cada widget viraria uma coluna de texto
  amassado — mesmo motivo pelo qual o `Masonry` observa o contêiner.
- **Widget começa em largura total** (`grid-column: 1 / -1`), porque é o estado em que ele
  passa a maior parte da vida; os spans abrem conforme o contêiner ganha espaço.
- `min-height: 0` no `-body`: filho de grid tem `min-height: auto`, então um canvas que
  reporta altura intrínseca grande empurraria a linha em vez de caber nela, e o dashboard
  ganharia barra de rolagem que ninguém pediu.

### Corrigido

- **`.tempest-page` colapsava pra largura do conteúdo dentro de um flex row** (painel de
  preview, split view): sendo flex item, dimensionava pelo conteúdo — o dashboard ficou em
  ~200px com o pai em 500. Ganhou `width: 100%`, igual `.tempest-container` já tinha; em
  fluxo normal a declaração não muda nada. Achado montando a receita na gallery, no
  browser — jsdom não calcula layout, então nenhum teste pegaria.

## [0.31.0] — 2026-07-27

### Adicionado

- **`FilterBar` — filtros de lista com chips e editor**, e o **último item da lista P2**:
  a fila de componentes zerou. Combinados com **E**, achatados.
- **É E achatado, não árvore com OU, e a doc diz o teto**: grupos aninhados
  (`(a OU b) E c`) exigem UI de árvore com operador por nó e outra serialização —
  tentar ser os dois produz um builder desengonçado justamente no caso de 95%.
- **O conjunto cabe na URL e volta dela**: `filtersToSearchParams` /
  `filtersFromSearchParams`, com teste de round-trip. Filtro que não sobrevive a reload
  é filtro que a pessoa redigita toda vez que abre um link que alguém mandou.
- **O que não parseia é descartado, não adivinhado** — operador que o campo não oferece,
  campo desconhecido, `between` com uma ponta só. URL editada à mão é a forma normal
  desse dado chegar, e renderizar chip que o backend não avalia mostraria uma lista que
  não corresponde ao que o chip afirma.
- **O chip lê em palavras com o label da opção** ("Status é Pago", não `paid`), e o botão
  de remover usa a mesma frase no `aria-label`: chip que diz uma coisa pra quem vê e
  outra pra quem ouve são duas verdades diferentes.
- Input segue o **campo**, não o operador (data ganha date picker mesmo no `between`);
  filtro incompleto só desabilita o Aplicar; trocar operador limpa o valor.
- **`Tour` — coachmarks guiados**: escurece a página, destaca um elemento por vez e
  explica. Penúltimo item da lista P2.
- **O elemento destacado continua clicável**, e é isso que faz um coachmark servir. O
  escuro são **quatro retângulos** em volta do alvo, não um overlay com buraco de
  `box-shadow`: sombra **não é hit-testável**, então o buraco feito assim não bloquearia
  clique nenhum — o resto da página continuaria clicável e o alvo, não.
- **O alvo é um seletor CSS, não um ref**: o tour pode ser declarado como dado (config,
  backend, ao lado da cópia) sem cada tela passar refs pra quem renderiza.
- **Passo com alvo ausente aparece centralizado**, não desaparece — recurso escondido por
  permissão é caso real, e sumir com o passo esconderia a mensagem em silêncio.
- **O card vira pro lado oposto** quando o preferido não cabe (mantém a relação de leitura
  com o alvo), tenta os outros lados depois, e vai pro **centro** quando nada cabe — card
  metade fora da tela é pior que card no meio, e isso acontece quando o alvo é mais alto
  que o viewport. Sempre clampado dentro da viewport.
- Teclado: setas andam, `Esc` sai — tratado **no card**, não na `window`, pra que um tour
  aberto sobre um modal não feche os dois. Card é `role="dialog"` + `aria-modal`, nomeado
  pelo título e descrito pelo corpo, com armadilha de foco e "Passo 2 de 5" visível.
  Entrou no sweep do `axe`.
- Tetos do barrel subiram com os dois componentes novos: ESM 91 → 94 kB, CJS 110 → 113 kB,
  `styles.css` 25,5 → 26 kB. Tetos de "ninguém importa isso" — nenhuma fatia importada
  mudou.
- Persistir "já viu" fica com o app (`open` + `onClose`/`onFinish`): a chave tem versão,
  escopo por usuário, e às vezes mora no backend.

## [0.30.0] — 2026-07-27

### Adicionado

- **`Markdown` — renderizar texto que veio de gente**, com parser próprio e **zero
  dependência**. Headings, parágrafos, listas (aninhadas e numeradas), citação, código
  cercado (via `CodeBlock`), regra, tabela GFM com alinhamento, e o inline usual.
- **A segurança é estrutural, não promessa de escape**: `dangerouslySetInnerHTML` **não
  existe** no componente. O parser produz árvore de nós, o render vira elementos React, e
  filho de React só pode ser texto — então `<script>` num comentário renderiza como os
  caracteres que a pessoa digitou. Não é "HTML sanitizado", **é texto**; por isso não há
  sanitizador nem lista de tags permitidas.
- **URL passa por allowlist de esquema**, não blocklist: link aceita `http`/`https`/
  `mailto`/`tel`/`sms` e relativo; imagem aceita os mesmos mais `data:image/` **raster** —
  `svg+xml` fica fora porque um SVG é documento e carrega script. Blocklist teria que
  enumerar `javascript:`, `JaVaScRiPt:`, `java\tscript:`, e erraria a que ninguém pensou.
  URL recusada mantém o **rótulo como texto**: apagar as palavras seria pior que apagar o
  link.
- **`#` vira `h2` por default** (`headingOffset`): um comentário dentro de página cujo `h1`
  é o título não pode emitir um segundo `h1`, e o componente nunca passa de `h6`.
- Dois bugs de parser pegos por teste antes do merge: **tabela de uma coluna** (`| --- |`)
  não era reconhecida porque o regex exigia duas, e **URL com parêntese balanceado**
  (`javascript:alert(1)`) deixava o `)` sobrando como texto.
- É **subconjunto de propósito**, e a doc diz o teto: sem HTML embutido, nota de rodapé,
  referência de link ou lista de tarefa. Quem precisa de CommonMark completo usa
  `react-markdown` + `remark` direto — 40 KB e cadeia de plugins que o SDK não paga.
- **`Masonry` — cards de altura desigual empacotados em colunas** com a borda de baixo o
  mais reta que o conteúdo permite. Mede os cards e joga cada um na **coluna mais curta**;
  `index % colunas` produz colunas desiguais no primeiro momento em que as alturas
  divergem, que é o único motivo pra usar masonry.
- **Não é uma linha de CSS de propósito**: `columns` do CSS quebra o card na fronteira da
  coluna, e `grid-auto-flow: dense` mantém cada linha na altura da célula mais alta — a
  borda serrilhada que se usa masonry pra evitar.
- **Breakpoints são do contêiner, não do viewport** (`ResizeObserver`): um masonry dentro
  de drawer é mais estreito que a janela, e media query daria três colunas com 300px.
- Cada card é observado individualmente, então **imagem que carrega depois re-distribui** —
  altura medida na montagem erra exatamente nesse caso. O primeiro paint usa peso 1 pra
  todos, então nunca aparece vazio.
- A ordem de leitura desce a coluna, e a doc diz isso na cara: é layout pra item
  **independente**; se o item 2 precisa vir depois do 1, o que se quer é grid.
- **`Transfer` — dual list pra escolher um subconjunto** (permissões de um perfil, cidades de
  uma rota, colunas de um relatório). Dois painéis, quatro controles, busca em cada lado.
- **Estado é só os ids do lado direito; os painéis são derivados.** Guardar duas listas
  parece mais simples e deriva no primeiro momento em que o catálogo muda por baixo — uma
  permissão removida no servidor fica pendurada no painel que a tinha, e um id nos dois
  lados é um bug que ninguém vê.
- **"Mover todos" respeita o filtro ativo** — move o que você está vendo, não o painel
  inteiro. Era um bug real, pego por teste antes do merge: filtrar por `sao` e clicar
  movia as dez linhas.
- **Busca dobra acento nos dois sentidos** (`sao` acha "São Paulo" e vice-versa). Pra
  público PT-BR isso não é refinamento; um `includes` cru falharia na metade das buscas.
- Linha `disabled` não se move por **nenhum** caminho: a checagem vive no `applyMove`, não
  em cada um dos quatro botões. Marcações são limpas depois de mover, senão o próximo
  clique no botão oposto manda tudo de volta.
- A11y: controles ficam no meio pela grade mas **por último no DOM** (teclado vê o que
  move antes de poder mover), cada painel é uma `region` nomeada pelo título, e cada
  movimento é anunciado num `role="status"`. Entrou no sweep do `axe`.
- **`Chat` — thread de mensagens, e a mesma coisa serve de thread de comentários.** Primeiro
  item da lista P2. Agrupa por autor e por dia, marca o lado do usuário atual, mostra
  estado de entrega, quem está digitando, e traz o composer quando recebe `onSend`.
  Apresentacional e controlado como o resto do SDK: de onde vêm as mensagens (REST,
  `createWebSocket`, SSE) e como o insert otimista é feito ficam com o app.
- **A rolagem só pula pro fim quando o leitor já estava no fim.** Uma thread que sempre
  rola pra mensagem nova arranca quem está lendo o histórico, toda vez que qualquer
  pessoa digita. Verificado no browser real: lendo o topo, três mensagens chegaram e a
  posição não se moveu.
- **Bloco quebra por autor, por dia e por intervalo (`groupWindowMs`, 5 min).** Repetir
  avatar e nome em cada linha de uma rajada vira lista de recibos; juntar uma resposta de
  uma hora depois colocaria um timestamp só em mensagens separadas por uma hora.
- **Estado de falha com retry.** A bolha que falhou mantém o **texto legível** — borda e
  meta em vermelho, não o fundo inteiro — porque reler a mensagem é o que a pessoa faz
  antes de decidir reenviar. Sem isso, o usuário redigita o que já está na tela.
- **`ChatComposer` exportado à parte**, e **não controlado de propósito**: rascunho de
  chat muda a cada tecla, e subir isso pro estado do app re-renderiza a thread inteira
  por caractere. `Enter` envia, `Shift+Enter` quebra linha, e `Enter` **durante composição
  de IME não envia** — compondo japonês ou coreano essa tecla confirma a palavra
  candidata, e enviar ali publica meia palavra.
- **`onSend` que rejeita não vira unhandled rejection.** Re-lançar de dentro de um handler
  de evento DOM apareceria como rejeição não tratada — ruído no console e hit no crash
  reporter, sem nada que o usuário possa fazer. O rascunho fica no campo (o sinal visível)
  e o erro vai pro `onError`/`onSendError`.
- A11y: thread é `role="log"` + `aria-live="polite"`, com `tabIndex={0}` porque área que
  rola sem nada focável dentro é inalcançável por teclado; estado de entrega vai em texto
  via `VisuallyHidden`, não só no glifo ("✓✓" não é lido). Entrou no sweep do `axe`.
- **O timestamp na bolha própria reprovava contraste — pego pela CI, não em revisão.** A
  `--tempest-text-subtle` é resolvida contra o fundo da página e da superfície; sobre
  `--tempest-primary-soft` ela é outro composto, e o browser real mediu abaixo do piso de
  **texto** (4,5:1). A meta row passou pra `--tempest-text-muted`, e dentro da bolha
  tingida usa o foreground da própria bolha (`--tempest-primary-on-soft`). O que
  de-enfatiza ali é o **tamanho**; a cor ainda tem que passar. Mesma armadilha dos tokens
  de sintaxe do `CodeBlock`.
- Tetos do barrel no `size-limit` subiram com os quatro componentes novos: ESM 86 → 91 kB,
  CJS 104 → 110 kB, e o `styles.css` 24 → 25,5 kB. São **tetos explícitos** de "ninguém importa isso" — o que o app paga
  de verdade continua medido por fatia importada, e nenhuma fatia mudou.
- Gallery ganhou a section `Chat` com três exemplos: thread viva (insert otimista +
  digitando + resposta), mensagem que falhou, e thread de comentários.

## [0.29.1] — 2026-07-27

### Corrigido

- **`tempest doctor` quebrava com stack trace em qualquer projeto no TypeScript 7.** O 7 é
  o port nativo: instala com o mesmo nome de pacote, mas o export `.` é um stub de versão
  — a API JS foi pra `typescript/unstable/*`, com outra forma. A CLI resolvia o módulo,
  concluía "tenho TypeScript" e chamava `ts.readConfigFile`, que não existe:
  `TypeError: ts.readConfigFile is not a function` e exit por exceção, no comando que as
  pessoas rodam primeiro. O `tempest fix` morria igual, na passada de alias.
- A detecção agora é por **feature**, não por resolução: o módulo só conta como usável
  quando expõe `readConfigFile`, `createSourceFile` e `forEachChild`. Achado num smoke
  install do pacote publicado, não em revisão — o repo do SDK tem TypeScript 6 e nunca
  exercitava esse caminho.
- **O `doctor` não perde as checagens de tsconfig no TS 7**: o `readTsconfig` ganhou
  parser JSONC tolerante (comentário de linha, comentário de bloco, vírgula sobrando)
  pro caso em que a API do compilador não está disponível. Sem isso, um tsconfig gerado
  pelo Vite — que vem com comentário — derrubaria `strict`/`jsx`/`moduleResolution` pra
  fora do relatório em silêncio. Marcador de comentário **dentro de string** é
  preservado, porque `paths` e `extends` legitimamente têm `//`.
- **Mensagens que dizem a verdade**: "typescript não instalado" era mentira sobre um
  pacote que está ali. Agora as passadas distinguem ausente de API indisponível, citam a
  versão, e o `doctor` ganhou uma linha `[i]` explicando que só os codemods (alias e
  `--extract-css`) ficam de fora — todo o resto do comando roda normal.

## [0.29.0] — 2026-07-27

### Adicionado

- **`tempest fix --extract-css` — o bloco repetido vira classe global, e o TSX é
  reescrito junto** (fecha a [#73](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/73)).
  A análise da 0.28.0 já apontava o caso; agora existe quem execute. A regra sai dos N
  CSS Modules, entra na folha global do projeto, e **cada `styles.x` que apontava pras
  cópias locais passa a apontar pra classe nova** — `className={styles.row}` vira
  `className="u-row"`, e dentro de um `cn(...)` vira `cn("u-row", …)`.
- **Continua opt-in, e é isso que ele é.** As outras passadas do `fix` removem o que
  está comprovadamente morto; esta decide que N telas passam a compartilhar uma classe
  e portanto **mudam juntas**. Decisão de acoplamento entre telas não é limpeza, então
  só roda com a flag — e o `--dry-run` mostra o plano inteiro antes de escrever.
- **Recusa-primeiro, sempre com motivo impresso.** Uma ocorrência só é movida quando:
  o seletor é uma classe sozinha fora de `@media` (mover pra fora mudaria **quando** a
  regra vale); nenhuma outra regra da folha menciona a classe (um `.row:hover` ficaria
  sem sujeito); o módulo continua com outra regra (senão o import vira morto, o ESLint
  o remove e as regras restantes **param de carregar**); a classe é lida só como
  `styles.row`/`styles["row"]` (`styles[key]` ou `Object.keys(styles)` tornam o módulo
  **opaco** e nada nele é extraído); a folha global existe **e** alguém a importa
  (escrever numa folha que ninguém carrega é no-op silencioso); e o nome novo não colide.
- **As chamadas são achadas com o `typescript` do projeto**, não com regex — `styles.row`
  dentro de comentário, template literal ou string não é uso, e regex não sabe a
  diferença. O alias do `tsconfig` é respeitado, então `@/components/Card.module.css`
  resolve igual. Sem `typescript` instalado, a passada avisa e não escreve nada.
- Flags novas: `--extract-css`, `--css-target <arquivo>` (default: a primeira de
  `src/styles/globals.css`, `src/globals.css`, `src/index.css`, …) e `--css-prefix <p>`
  (default `u-`). O parser de argumentos do `fix` passou a entender flag com valor —
  antes o valor cairia na lista de caminhos posicionais e o comando rodaria contra um
  arquivo só.
- **A análise é refeita do disco antes de extrair**, depois da passada de dedupe: cada
  edição aqui é um splice em offset gravado, e reusar o parse velho faria splice em
  posição que já não existe.

## [0.28.1] — 2026-07-27

### Corrigido

- **`urlBase64ToUint8Array` estourava `ReferenceError` dentro do service worker.** Ela
  chamava `window.atob`, e não existe `window` em escopo de worker — então a única
  função que o SDK expõe justamente pra quem monta um fluxo de inscrição próprio
  quebrava no lugar onde esse fluxo mais precisa dela: o handler de
  `pushsubscriptionchange`, que re-inscreve o dispositivo quando o navegador rotaciona
  a inscrição por conta própria. Agora chama `atob` como global, que existe nos dois
  escopos. Achado escrevendo a documentação de adoção, não em revisão de código; tem
  teste que decodifica com `window` stubado como `undefined`.

### Documentação

- **`docs/push.md` (+ `.en.md`) reescrita pra quem já tem app rodando.** A página
  ensinava o caminho felizes de um projeto novo e deixava de fora tudo que o adotante
  encontra primeiro. Novo: seção **"Adotando num app que já existe"** com checklist de 6
  passos e **três cenários de service worker** em abas (nenhum SW — com o
  `vite.sw.config.ts` do build separado; `vite-plugin-pwa` — só `injectManifest` deixa
  escrever o SW; SW próprio — duas linhas, e o aviso de que dois handlers de `push`
  mostram duas notificações).
- **Escopo do SW ganhou aviso `danger`** — SW com hash em `/assets/` não controla a
  home, então `navigator.serviceWorker.ready` nunca resolve e o `subscribe()` fica
  pendurado **sem erro no console**. É o modo de falhar mais comum ao ligar push num app
  com bundler, e a doc não citava.
- **Contrato com o backend documentado**: o JSON exato que chega no `onSubscribe`, as
  duas rotas, e a regra que faltava — **a chave natural é o `endpoint`**, não o usuário.
  Um usuário tem uma inscrição por navegador; backend que guarda uma por usuário
  desliga o desktop quando o celular se inscreve, em silêncio.
- **Seção de desinscrição, que era uma linha.** Ordem das chamadas (`onUnsubscribe`
  antes do `unsubscribe()` do navegador, pra não perder o `endpoint` se o backend
  falhar), **apagar pelo `endpoint`** — os exemplos ensinavam `api.delete("/webpush/my")`
  ignorando o argumento, o que só funciona com um dispositivo —, e as duas coisas que
  ninguém espera: `unsubscribe()` **não** revoga a permissão (`granted` ≠ inscrito), e
  **logout sem desinscrever entrega as notificações da conta anterior pro próximo
  usuário do mesmo navegador**.
- **"Manter a inscrição viva"**: handler de `pushsubscriptionchange` (o SDK não tem
  helper — são 15 linhas no seu `sw.ts`), `404`/`410` do push service como "apague a
  linha", e a armadilha da rotação de chave VAPID — como `subscribe()` reusa a inscrição
  existente, chamar ele depois de trocar a chave reenvia a inscrição velha e os envios
  seguem falhando com `403`.
- **`subscribed` começa `false`** (a checagem é assíncrona, o primeiro render não pode
  saber) e **`refresh()`** serve pro estado que muda fora do app — dois comportamentos
  reais que a doc não explicava e que produzem "bug" de botão piscando.
- Tabela de **troubleshooting** por sintoma, requisito de **HTTPS/localhost**, e o
  detalhe do iOS: sem `manifest.json` instalável, `isPushSupported()` dá `false` mesmo
  no Safari atual.
- `README.md`: a receita de Web Push passou a apagar pelo `endpoint` também.

## [0.28.0] — 2026-07-27

### Adicionado

- **Análise de CSS no `tempest doctor` e no `tempest fix`.** O ESLint não lê `.css` e o
  Prettier só reformata: entre os dois, CSS quebrado passava batido. Agora as duas
  ferramentas leem cada folha do projeto (CSS Modules incluídos) com um **scanner
  próprio, sem dependência** — nem postcss, nem stylelint — e reportam três classes de
  problema.
- **Sintaxe que o browser derruba em silêncio** (`✗`, reprova o `doctor`): `;` faltando
  entre declarações — que é o pior deles, porque `padding: 8px⏎margin: 0;` é **uma**
  declaração válida com valor `8px margin: 0` e o browser mata as duas sem dizer nada —,
  declaração sem `:`, valor vazio, bloco nunca fechado, `}` sobrando, comentário/string/`(`
  sem fechar, declaração fora de regra, `{` sem seletor. Nada disso quebra o build do
  Vite, e é exatamente por isso que custa uma tarde.
- **Semântica: CSS válido que ainda está errado** (`!`): declaração duplicada com o mesmo
  valor (a primeira é morta), declaração sobrescrita com valor diferente na mesma regra,
  seletor declarado duas vezes no mesmo contexto de `@media`, propriedade inexistente com
  sugestão da mais próxima (`bacground-color` → `background-color`), `@at-rule`
  inexistente, token `--tempest-*` que não existe, `var()` que ninguém define e não tem
  fallback, e regra vazia.
- **Sugestão de global sobre local repetido** (`i`) — a checagem que o CSS Modules **não
  pode** fazer por você: o escopo garante que `.card` de um módulo nunca colide com o de
  outro, e o preço é que nada te conta que os dois são idênticos. Bloco de ≥ 3 declarações
  repetido em ≥ 3 regras e ≥ 2 arquivos vira `global-candidate`; quando o bloco é um
  idioma que o `utilities.css` já entrega (`.tempest-row`, `.tempest-stack`,
  `.tempest-center`, `.tempest-cluster`, `.tempest-spread`, `.tempest-truncate`,
  `.tempest-grid-auto`, `.tempest-card`) o achado nomeia a classe. Agrupa por declaração,
  não por nome de classe. Também aponta valor literal que é **exatamente** o de um token
  — e só quando **um único** token tem aquele valor, porque `4px` é o valor de vários.
- **O `fix` remove três coisas, todas comprovadamente mortas**: declaração repetida com
  valor idêntico, regra que repete uma anterior declaração por declaração, e regra vazia
  em folha comum. Sempre a cópia **anterior** — CSS é last-wins, então remover a de baixo
  mudaria o resultado quando algo no meio mexe na mesma propriedade; remover a de cima não
  muda nada do que o browser computa. Em `.module.css` regra vazia é reportada e **nunca**
  removida: pode ser a classe-marcador que o JS referencia via `styles.x`. Folha com erro
  de sintaxe não é escrita — offset tirado de um parse adivinhado não serve pra splice.
- Novas flags e superfície: `tempest fix --no-css` pula a passada; `--dry-run` lista
  **todos** os erros e avisos (a cauda de sugestão fica limitada a 10) e virou a
  superfície de revisão do CSS; o `doctor` ganhou a seção **Stylesheets** com no máximo 6
  achados por severidade e o número do que ficou de fora.
- **A tabela de tokens é lida, nunca chumbada** — do `styles.css`/`utilities.css`
  instalado (ou do `src/styles/` quando a CLI roda de dentro do repo do SDK). Uma cópia
  dentro da CLI derivaria no primeiro token novo e passaria a acusar o código correto do
  app, que é pior do que não checar.
- **`var()` com fallback nunca é reportado** — `var(--tempest-card-padding, …)` é o
  idioma de knob do próprio SDK, e o fallback garante que renderiza. Essa única regra
  derrubou 43 falsos positivos quando a análise rodou no CSS do SDK.

- **`CodeBlock` — amostra de código com realce, número de linha e botão de copiar.**
  Dez gramáticas (`ts`, `js`, `tsx`, `json`, `css`, `html`, `bash`, `python`, `sql` e
  apelidos). O realce é **scanner de padrões, não parser**: reconhece comentário,
  string, número, palavra-chave e pontuação, e não sabe nada de escopo ou tipo. É teto
  escolhido — parser de verdade por linguagem é dependência do tamanho do resto do SDK.
  Onde não tem certeza, emite texto normal em vez de emitir errado; linguagem
  desconhecida vira bloco sem cor, que é resultado normal e nunca erro.
- **Tokens de sintaxe próprios, `--tempest-code-*`** — e essa foi a correção que só
  apareceu medindo no browser. A primeira versão reaproveitava a rampa de chart com o
  argumento de que ela "já é validada nos dois modos". Ela é — pro piso de **marca**
  (3:1). Cor de sintaxe é **texto** e precisa de **4,5:1**: medida como texto, uma
  palavra-chave em `--tempest-chart-1` deu 3,47:1 no escuro e uma string em
  `--tempest-chart-3` deu 2,03:1 no claro. Os dez tokens novos foram resolvidos em
  OKLCH contra **os dois fundos** em que podem cair — a superfície do bloco e a linha
  marcada depois que o realce compõe sobre ela; resolver só contra a superfície deixava
  uma palavra-chave em 4,17:1 na linha marcada.
- `src/styles/colors.contrast.test.ts` lê o `colors.css` e reafere cada token nos dois
  modos contra os dois fundos, pra que uma edição futura de rampa não volte a baixar
  disso em silêncio.
- **O `<pre>` é sempre focável**, ao contrário dos outros contêineres de rolagem do SDK,
  onde a parada de tabulação é condicional. Um bloco de código não tem nada focável
  dentro e existe pra ser alcançado, lido e selecionado por conta própria.
- Número de linha é `aria-hidden` + `user-select: none`: selecionar o bloco no mouse e
  copiar devolve a fonte, sem os números. Verificado no browser lendo a seleção.
- O `\n` que separa as linhas é caractere de verdade e fica **fora** da caixa da linha.
  Dentro dela — a linha é `inline-block` — ele é consumido pelo próprio box e as dez
  linhas do exemplo foram parar lado a lado numa fileira só. Também só apareceu no
  browser.

- **`QRCode` — símbolo QR codificado no browser, sem dependência.** Um gerador
  remoto entregaria o conteúdo — link de pagamento, token de sessão, convite — a um
  terceiro; o encoder inteiro custa **3,2 KB brotli** importando `{ QRCode }`.
  Implementação completa da ISO/IEC 18004: seleção de modo, versões 1–40, os quatro
  níveis de correção, Reed-Solomon sobre GF(256), intercalação de blocos e os 8
  padrões de máscara com a função de penalidade da norma.
- **Validado contra um decoder independente, não contra si mesmo.** As tabelas da
  norma são transcritas à mão e uma entrada errada gera um símbolo perfeitamente
  plausível que escaneia como nada — comparar o encoder com ele mesmo confirmaria o
  erro de digitação. Os testes codificam e mandam o resultado pro `jsqr` (devDep):
  11 round-trips cobrindo URL, os quatro níveis, os três modos, UTF-8 com acento,
  emoji, payload com vários blocos de ECC e versão ≥ 7. No browser real, os 8
  símbolos da seção do gallery foram rasterizados em canvas e decodificados.
- **Preto no branco nos dois temas, de propósito** — a única parte do SDK que ignora
  os tokens. Leitor de QR espera escuro sobre claro; ligar os módulos em
  `--tempest-text` inverteria eles no dark mode e deixaria símbolo claro sobre fundo
  branco, que não lê como nada.
- Desenhado em **SVG num único path** com as corridas horizontais fundidas: um
  símbolo versão 10 tem 3 481 módulos, e um elemento por módulo custa tempo de pintura
  de verdade. Fica nítido em qualquer tamanho e imprime na resolução da impressora.
- `aria-label` default **nomeia o conteúdo** (`QR code: https://…`) — leitor de tela
  não escaneia, então o dado tem que chegar como texto.
- Conteúdo que não cabe nem na versão 40 lança `QRCapacityError` em vez de desenhar
  um símbolo truncado que escaneia errado.
- `encodeQR` e `matrixToPath` são exportados pra quem precisa desenhar por conta —
  canvas, PDF, etiqueta térmica.
- **`Sparkline` — mini-gráfico inline, na entrada raiz e sem recharts.** Uma coluna de
  tendência numa tabela não deveria obrigar o app a instalar uma biblioteca de gráfico
  inteira: são ~40 linhas de SVG. Três variantes (`line`, `area`, `bar`), tamanho e cor
  livres, ponto no último valor com anel na cor da superfície pra continuar legível em
  cima da linha.
- **`min`/`max` fixam o eixo, e é o que torna várias linhas comparáveis.** Sem eles cada
  sparkline se normaliza contra os próprios extremos — uma linha de 2 a 4 e outra de 200
  a 400 desenham exatamente a mesma forma. O erro não gera aviso nenhum: os gráficos
  ficam bonitos e mentem. A seção do gallery mostra as duas colunas lado a lado.
- **`role="img"` com a série descrita em palavras** (quantidade de pontos, direção,
  pontas, extremos). Um sparkline não tem eixo nem legenda pra servir de apoio: sem essa
  frase o leitor de tela chega nele e não lê nada. `valueFormatter` entra na descrição;
  `label` substitui quando o texto ao redor já diz o que está plotado.
- Valores não-finitos são filtrados antes de projetar — um `NaN` dentro de um atributo
  `d` anula o path inteiro **em silêncio**, e o gráfico some sem erro. Série achatada
  fica centrada em vez de colada numa borda, que é a leitura honesta de "não variou" e
  evita dividir por um domínio de altura zero.

- **Escalas contínuas de data viz — `sequentialScale` e `divergingScale`.** As 8 cores
  de série codificam **identidade**; heatmap e choropleth codificam **quanto**, e isso
  pede _um_ hue escalonado por claridade. Era a última lacuna da fatia de CSS no
  roadmap: escala contínua ainda era responsabilidade do app.
- Tokens novos: `--tempest-chart-sequential-1…7` e `--tempest-chart-diverging-1…9`
  (1–4 frio · 5 neutro · 6–9 quente), nos dois modos. **As rampas não foram escolhidas
  a olho**: os passos são calculados em OKLCH com claridade espaçada por igual — passo
  igual de dado parece passo igual de cor, o que não acontece espaçando em RGB — e
  validados por script em ambos os modos (claridade monótona, gap ≥ 0,06 entre passos
  adjacentes, hue único, ponta perto da superfície passando 2:1 no recorte ordinal).
- **Saem da raiz, não do `/charts`**: são matemática de token pura, sem recharts, e
  quem mais precisa delas — choropleth do `/br`, heatmap feito à mão — não tem motivo
  pra instalar recharts. Medido: **365 B brotli** importando da raiz, e o bundle não
  menciona recharts. O `/charts` re-exporta só por descoberta.
- Devolvem `var(--tempest-chart-…)` em vez de hex, então um heatmap pintado uma vez
  segue o tema. **Sequencial deixa o zero recuar** pra superfície de propósito (é o que
  "quase nada" deve parecer); `ordinal: true` começa no passo 3 pra quando cada passo é
  uma marca que alguém precisa ver.
- **Cada braço da divergente escala pelo próprio alcance**: num domínio assimétrico
  (−5 a +80) os negativos ainda usam o braço frio inteiro. Escalar os dois pelo mais
  largo colapsaria todo negativo no passo ao lado do meio e esconderia o sinal. O meio
  é cinza nos dois modos — meio colorido lê como terceira categoria em vez de "sem
  desvio".
- `createTheme` reescreve as duas escalas a partir do hue da marca, usando o `danger`
  do tema como polo quente pra "quente" e "ruim" não discordarem na tela. Sem cor pra
  derivar, não sobrescreve nada — os defaults validados sobrevivem em vez de virar
  chute.
- `scaleSteps` devolve a rampa inteira pra montar a legenda: sem faixa rotulada nas
  pontas ninguém converte cor de volta em número.

### Corrigido

- **Quatro tokens inexistentes no CSS do próprio SDK**, achados pela análise nova — todos
  `var()` **sem** fallback, ou seja, propriedade que resolvia pra nada em runtime:
  `--tempest-duration-normal` na transição do `Carousel` (não existe; virou
  `--tempest-duration-base`), `--tempest-primary-solid` e `--tempest-primary-on` no
  `.navbar.primary` (viraram `--tempest-primary` e `--tempest-primary-foreground`) e
  `--tempest-danger-on` no badge do `BottomNavigation` (ganhou o fallback `#fff` que o
  `NavigationRail` já usava, mantendo o knob).
- **`Table`, `VirtualList` e `ScrollArea` viraram alcançáveis por teclado enquanto rolam.**
  Um contêiner de rolagem cujo conteúdo não tem nada focável dentro é inacessível pelo
  teclado: o foco nunca pousa onde as setas rolariam, então quem navega assim **vê** a
  barra de rolagem e não tem como movê-la. Os três caíam nisso — tabela larga, lista
  virtual (linhas posicionadas em absoluto) e área de rolagem com texto puro.
- A parada de tabulação (`tabIndex={0}` + `role`/`aria-label`) aparece **só enquanto o
  transbordo é real** e some quando o conteúdo cabe. Colocá-la sempre poluiria a ordem
  de tabulação com um stop por contêiner na página, inclusive nos que não rolam.
  Verificado no browser: no `Table`, encolher pra 390 px cria a parada e as setas passam
  a rolar de fato (`scrollLeft` 0 → 80); voltar pra 1400 px remove.
- Novo hook público `useScrollOverflow(ref, axis?)` com a medição. Observa **a caixa e o
  conteúdo**: conteúdo cresce dentro de caixa parada e caixa encolhe em volta de conteúdo
  parado, e olhar só um perde metade das transições. Diferença de 1 px é arredondamento
  de layout, não transbordo.
- Nomes novos: `Table.scrollLabel`, `ScrollArea.scrollLabel` (default `"Área rolável"`) e
  `VirtualList.label`. Uma parada de foco que não anuncia nada é pior que parada nenhuma.

- **As duas fontes do mesmo token discordavam da direção no modo escuro.** O
  `colors.css` declara token 1 = passo mais escuro no dark (o que recua pra superfície
  escura), mas o `buildRamp` invertia e o `createTheme` escrevia token 1 = mais claro —
  então um tema **gerado** pintava todo heatmap invertido no escuro. Pego medindo os
  tokens no navegador, não em revisão: o `buildRamp` passou a devolver ordem de token
  (índice 0 = ponta "perto de zero", por modo), e tem teste amarrando o gerado ao que o
  `colors.css` declara.

## [0.27.0] — 2026-07-26

### Adicionado

- **`<ImageCropper>` — recorte com proporção fixa, par natural do `FileUpload`.** O
  frame fica parado e a imagem pana/zooma atrás dele: é o modelo que um fluxo de
  avatar ou de foto de documento quer, onde o app decide a proporção de saída e o
  usuário só escolhe o que cai dentro. Por construção não existe recorte fora da
  proporção — retângulo arrastável livre é outro componente.
- **Exporta os pixels naturais, não o preview.** O recorte é lido do tamanho original
  via canvas. Verificado no navegador com fonte de 480×320: o avatar 1:1 sai
  **320×320** e o 16:9 sai **480×269**, não os ~293 px que o preview media. É o erro
  mais comum em cropper caseiro. `maxSize` capa a maior aresta, porque uma foto de
  12 MP recortada pra um avatar de 96 px é megabyte de desperdício.
- **Borda vazia é impossível.** A imagem é sempre clampada pra cobrir o frame, em pan
  **e** em zoom — inclusive ao dar zoom-out, quando um offset que era legal deixa de
  ser. É o outro defeito clássico: arrastar até o frame mostrar fundo e assar a faixa
  transparente no arquivo exportado.
- Teclado de igual peso: setas movem (`Shift` move 4×), `+`/`-` dão zoom, `0`
  centraliza; roda do mouse também. A geometria mora em `crop-geometry.ts` como
  funções puras (`coverScale`, `clampOffset`, `computeCropRect`, `outputSize`), com
  teste próprio — `getContext` não existe no jsdom, então a matemática precisava ser
  testável fora do componente.
- `crop()` devolve `Promise<Blob | null>` e **nunca lança**: antes de carregar, sem
  contexto 2D ou com encoder recusando, o retorno é `null`. `File`/`Blob` viram object
  URL revogada na troca de fonte e no unmount.
- **Imagem sem tamanho intrínseco é rejeitada.** Um SVG sem `viewBox` decodifica bem e
  reporta `naturalWidth: 0` — aceitar isso habilitaria os controles sobre uma imagem
  com a qual a matemática de recorte não pode fazer nada. Pego na verificação no
  navegador, não em revisão de código.
- **`<Scheduler>` — agenda com grade de tempo.** O `Calendar` é seletor de data:
  responde "qual dia?". Este responde "o que tem nesses dias, e quando", o que exige
  estrutura diferente — eixo vertical de tempo, evento dimensionado pela duração e
  sobreposição resolvida em colunas. Visão de dia, de N dias ou de semana pelo mesmo
  prop (`days`).
- **Sobreposição é a parte que quase toda implementação erra.** Eventos sobrepostos
  são agrupados em **clusters de sobreposição mútua** e **todos no cluster
  compartilham a mesma contagem de colunas** — é isso que faz as larguras baterem.
  Coluna é reaproveitada assim que libera, e encostar não é sobrepor. Verificado no
  navegador: três eventos numa segunda usam **2** colunas (dois deles não se sobrepõem
  entre si), dois encostados na terça ficam com largura cheia, e na quarta a coluna
  liberada é reusada.
- **Horário local sem armadilha de DST**: o intervalo de dias é montado incrementando
  o **dia do calendário**, não somando 24 h em milissegundos — num limite de horário de
  verão o dia tem 23 ou 25 horas, e a aritmética de milissegundo duplicaria ou pularia
  data.
- **Evento cruzando meia-noite aparece nas duas colunas**, cada segmento clipado à
  janela visível do seu dia. Verificado: 23:00–01:00 rende um pedaço em 95,83% do
  primeiro dia e outro em 0% do seguinte.
- Faixa própria pra evento `allDay` (atravessando os dias que cobre, e não renderizada
  quando não há nenhum), linha de "agora" que só aparece se hoje está no intervalo e
  dentro da janela, `onSlotClick` com o instante já snapado e clampado — e que **não**
  dispara quando o clique caiu num evento. O layout é puro em `scheduler-layout.ts`,
  com 39 casos de teste próprios.
- **Dois defeitos de acessibilidade pegos no navegador, não em revisão.** O `axe` do
  jsdom não pinta, então não mede contraste: o horário do evento tinha `opacity: 0.85`
  sobre o fill e **reprovava AA** — o sweep do browser no `e2e.yml` acusou. A hierarquia
  agora vem de tamanho e peso, que não custam contraste. E a região que rola na
  vertical não era focável (`scrollable-region-focusable`), então quem usa teclado não
  conseguia rolá-la; virou focável com nome, como `group` e não `region` — um `region`
  nomeado é landmark, e duas agendas na mesma página seriam dois landmarks de nome
  idêntico.
- **Não é `role="grid"`**, e isso foi decisão forçada por evidência: grade ARIA exige
  filhos `row`, e os eventos são irmãos das colunas dentro de um único CSS grid — um
  wrapper `row` faria as colunas deixarem de ser itens do grid. O `axe` reprovou a
  primeira versão com `aria-required-children` + `aria-required-parent`. Cada dia é um
  `group` rotulado; o leitor de tela tabula os botões de evento e o nome do grupo dá o
  dia.

### Alterado

- **`tempest doctor` passa a servir projeto de terceiro que ainda não usa o SDK.** Era
  inútil exatamente onde deveria ajudar mais: num app React + Vite **saudável** que só
  não tinha adotado o SDK, ele dava **duas falhas e exit 1** por um único fato ("você
  não instalou isto ainda") e enterrava os achados acionáveis — sem lockfile, sem
  `@vitejs/plugin-react`, sem linter — no meio de avisos que eram só a opinião do SDK.
- Agora detecta o caso e roda em **modo genérico**. SDK ausente é `info`, não falha. As
  checagens que são convenção saem do relatório: alias `@/*`, `createViteConfig`, import
  do `styles.css`, o `src/main.tsx` esperado. O motivo do aviso de `moduleResolution`
  também deixa de citar subpath do SDK quando ele não está em jogo.
- Continua checando o que vale pra qualquer app: versão do Node, instância duplicada de
  React, dependência declarada e não instalada, peer não satisfeita, `@types/react`
  desalinhado, `strict`/`jsx`/`moduleResolution`, lockfile, ESLint/Prettier, `.env` no
  `.gitignore` e variável de cliente sem `VITE_`. E fecha com uma seção de **como
  adotar** — auditar o projeto de alguém e não dizer qual é o próximo passo lê como
  anúncio.
- SDK **instalado mas não declarado** no `package.json` passou de falha a aviso: é
  drift de declaração, não app quebrado.
- **O `doctor` ganhou testes** — não tinha nenhum. 15 casos rodam o CLI de verdade como
  subprocesso contra fixture em disco, porque o que mais importa nele é o **exit code**,
  e só executando como o usuário executa isso é testado.

## [0.26.1] — 2026-07-26

### Adicionado

- **`tempest doctor` detecta cópia dupla de `lucide-react`.** Checagem **separada** da
  de instâncias duplicadas de React e libs com estado, porque a falha é de outra
  natureza: duas cópias de lucide não quebram hooks nem contexto — elas duplicam bytes
  e, o que é grave, deixam as **tabelas de slug geradas** do `/icons` apontando pra
  exports que a cópia mais antiga não tem. Três sinais: avisa quando o `package.json`
  do app declara lucide numa faixa diferente da do SDK (a **causa**), avisa quando
  existe cópia aninhada sob `node_modules/tempest-react-sdk/` (a **prova**), e
  **reprova** (exit 1) quando a versão instalada é mais antiga do que as tabelas
  exigem — esse é o caso que quebra o build com `… is not exported by lucide-react`
  apontando pra dentro do SDK, onde a causa é difícil de achar.
- A mensagem cobre o único caso em que declarar lucide está certo: **pnpm** com
  isolamento estrito, e aí apontando a faixa do próprio SDK. Declaração com faixa
  idêntica sai como `info`, não aviso — é redundante, não quebrado.
- A lógica mora em `bin/lib/doctor/lucide.mjs` como função pura, então tem teste: o
  `doctor` não tinha nenhum até aqui, e um diagnóstico que erra o veredito é pior que
  não existir.

## [0.26.0] — 2026-07-26

### Adicionado

- **`tempest-react-sdk/icons` — os 1997 ícones do lucide endereçáveis por slug.**
  Os 23 slots de ícone dos componentes aceitam só `ReactNode`, então nome que chega
  pronto (menu servido pela API, campo de CMS, tabela de configuração) não tinha
  resposta dentro do SDK. A saída de fora era o `DynamicIcon` do `lucide-react`, e ela
  é destrutiva: o mapa `dynamicIconImports` é um módulo de 116 KB com **uma chamada
  `import()` por ícone**, então o bundler é obrigado a criar ~1997 fronteiras de chunk
  — enxurrada de requisições em dev, milhares de arquivos minúsculos no build. Ele
  ainda resolve o ícone num `useEffect` (primeiro paint sempre sem ícone, layout
  pulando) e **lança** em nome desconhecido, justamente no caso em que o nome vem de
  fora.
- **Dois caminhos, um componente.** Slug **literal** (`<Icon name="save" />`) é achado
  em tempo de build pelo plugin `tempestIcons()` e vira import estático comum — **zero
  requisição extra**. Slug de **runtime** carrega **um shard por letra inicial**: no
  máximo 25 requisições, nunca uma por ícone. Renderizar ~130 ícones diferentes na
  gallery pediu **9** chunks, verificado no navegador.
- Medido: `{ Icon }` custa **2,95 KB brotli** no bundle inicial; o maior shard (`s`,
  247 ícones) **19,2 KB** e o mediano ~2,4 KB, ambos sob demanda; os 25 shards somados
  dão ~124,5 KB (teto que nenhum app paga inteiro). A lista dos 1997 slugs
  (`iconNames`, ~5,7 KB) fica **fora** do custo do `<Icon>` — mora em módulo próprio,
  porque só um seletor de ícone precisa dela.
- **Slug inexistente nunca derruba a tela**: renderiza `fallback` (nada, por default) e
  emite `console.warn` uma vez por slug **só em dev** — e só quando o nome é realmente
  inexistente, nunca enquanto um ícone válido está carregando (`iconStatus` distingue
  `"loading"` de `"missing"` olhando se o shard da letra já chegou).
- Os **248 aliases depreciados** do lucide continuam resolvendo (`alert-circle` →
  `circle-alert`), então slug gravado no banco anos atrás segue renderizando. O alias
  resolve pro canônico **antes** de escolher o shard.
- Exports: `Icon`, `IconProvider`, `createIconRegistry`, `useIcon`, `preloadIcons`,
  `iconStatus`, `peekIcon`, `loadIcon`, `resolveIconAlias`, `isIconName`, `iconNames`,
  `iconAliases`, tipo `IconName` (união dos 1997 slugs — só tipo, custo zero, mas dá
  autocomplete e pega typo no `tsc`).
- **`tempestIcons()`** em `tempest-react-sdk/vite`, ligado por default no
  `createViteConfig` (`icons: false` desliga). Varre a árvore de source no
  `buildStart` em vez de colher módulos no `transform`: depender da ordem de transform
  deixaria o módulo virtual carregar antes de todo consumidor ser visto, e o registro
  sairia curto num start frio de dev — silenciosamente, porque os slugs faltando ainda
  renderizam pelo caminho lazy.
- **`tempest gen icons`** no CLI, pra projeto que não usa Vite ou que prefere um
  arquivo versionado: mesmo scan, escreve um `createIconRegistry({…})` de verdade.
- **`<VirtualTable>` — tabela que aguenta 40 000 linhas numa grade rolável.** O
  `Table` renderiza tudo o que recebe e o `DataTable` pagina pra manter esse número
  pequeno; nenhum dos dois respondia "me mostre as 40 000 linhas de uma vez". Agora
  só a janela visível está no DOM: verificado no navegador, **20 `<tr>`** para
  `aria-rowcount=40000`, com `scrollHeight` de 1,6 M px.
- **Continua uma `<table>` de verdade.** A janela é feita com **duas linhas
  espaçadoras** (uma acima da fatia, uma abaixo) em vez de posicionar linhas com
  `position: absolute`. Absoluto colapsaria o layout de tabela: cada largura de
  coluna teria que ser calculada à mão e o elemento deixaria de ser uma tabela pra
  tecnologia assistiva. Com espaçadoras o browser continua fazendo o layout das
  colunas (larguras declaradas respeitadas: 110/200/160/130/130/120 px no demo) e o
  leitor de tela continua anunciando uma grade.
- **`aria-rowcount` na tabela e `aria-rowindex` em cada linha carregam os números
  reais**, não os da janela — sem isso o leitor de tela anuncia "linha 3 de 20"
  enquanto o usuário está na linha 5003 de 40 000. É o detalhe que quase toda tabela
  virtualizada erra. Rolando até a linha 30 000 no navegador: `aria-rowindex` de
  29997 a 30016, ainda 20 linhas no DOM.
- Cabeçalho fixo (`position: sticky`) com ordenação por coluna (asc → desc → sem
  ordem) expondo `aria-sort`, `onRowClick` por clique **e** por `Enter`/`Espaço`,
  `scrollToIndex` (rolar até a linha 30 000 na mão não é opção), `caption` como nome
  acessível, e `emptyMessage`.
- `table-layout: fixed` + `border-collapse: separate` não são detalhe estético:
  layout `auto` dimensiona as colunas pelas linhas que estão no DOM **agora**, então
  elas pulavam no meio da rolagem; e um `<th>` sticky dentro de tabela colapsada
  perde a borda de baixo ao rolar, porque a borda compartilhada pertence à célula que
  saiu.
- **`<NotificationCenter>` + `useNotificationInbox` — a metade que faltava do web
  push.** Um push mostra a notificação do sistema e **desaparece**: no que depende da
  UI do app, ela nunca existiu, e quem fechou o toast não tem onde reencontrar
  aquilo. O módulo `push` cuidava de assinar e receber; não havia inbox.
- **A ponte é uma mensagem, e ela precisava existir.** O service worker roda fora da
  página e não pode tocar em estado React. O worker faz `postMessage` e
  `useNotificationInbox` escuta por default — mais nada. Filtra por `type` (default
  `"tempest:notification"`) porque o canal de mensagens do SW é **compartilhado**: sem
  isso, um ping de progresso de sync ou um aviso de cache atualizado apareceria no
  inbox do usuário.
- O hook mantém a lista mais-nova-primeiro, deduplicada por `id` (re-adicionar um id
  **atualiza** em vez de duplicar) e limitada a `limit` (default 100 — um inbox
  alimentado por push cresce sem fim e mora em memória). Expõe `unreadCount`, `add`,
  `markRead`, `markUnread`, `markAllRead`, `remove`, `clear`.
- **Persistência ficou de fora de propósito.** Onde um inbox mora (servidor, Dexie,
  `localStorage`) muda por app, e um default errado seria pior que nenhum: `onChange`
  reporta toda mudança e `initialItems` lê de volta.
- **O painel é controlado e é só o painel.** Recebe a lista e emite intenção; monta
  dentro do `Popover`/`Drawer`/rota do app. Um componente dono do inbox **e** de uma
  estratégia de posicionamento serviria pra menos casos, não mais.
- **Abrir é ler**: ativar uma notificação chama `onMarkRead` junto com `onSelect` —
  senão todo app teria que lembrar de chamar os dois e o contador continuaria contando
  algo que o usuário já viu. Sem handler nenhum, as linhas viram texto puro em vez de
  botões: nada de alvo clicável que não faz nada.
- **Não lida não é só cor**: barra à esquerda + fundo tingido + `aria-current="true"`,
  porque cor sozinha não sobrevive a monocromia nem a daltonismo. Timestamp relativo
  em `<time dateTime>` (com `now` injetável, pra o demo e os testes serem
  determinísticos) e o controle de descarte nomeia a notificação
  (`aria-label="Descartar: …"`).

- **`<Kanban>` + `applyKanbanMove`** — quadro de colunas com cards que trocam de
  estágio, reordenável dentro da coluna e móvel entre colunas, por ponteiro **ou**
  teclado. A máquina de arrasto é o `useSortable`: o quadro não reimplementa nada
  disso, que era exatamente o motivo de o enabler existir antes do componente.
  `onMove` dispara uma vez por movimento confirmado e `applyKanbanMove` é o reducer
  (exportado porque todo consumidor precisa do mesmo — e é onde vive o off-by-one).
  Coluna `locked` recusa entrada mas deixa card sair.
- **`useSortable` ganhou suporte a grupos** (aditivo): `getItemProps(index, group)`,
  `getEmptyGroupProps(group)` para coluna vazia poder receber drop, `activeGroup`/
  `overGroup` no retorno, e `fromGroup`/`toGroup` no `onReorder`. Movimento que troca
  de grupo conta como movimento mesmo no mesmo índice — o card muda de coluna.

### Alterado

- **`lucide-react` apertado de `>=0.400.0` para `^1.26.0`.** A faixa antiga era frouxa
  demais pra sustentar tabela nome→ícone: nomes de export foram renomeados dentro dela
  (`CircleAlert` era `AlertCircle`), então uma tabela gerada contra 1.x pode
  simplesmente não existir em 0.4.x e o app quebra no build. O `examples/gallery` foi
  alinhado junto (pinava `^0.575.0`).
- **`npm run build` roda o `vite build` com heap de 6 GB.** A entrada `icons` empurra o
  rollup de tipos do API-Extractor acima do heap default do Node (~4,2 GB) e o build
  morria com `Reached heap limit`. É custo só de build — não afeta consumidor nem
  runtime.
- **O comparador de ordenação saiu do `DataTable` para `compareValues` em
  `utils/`.** Estava privado num componente, e o `VirtualTable` precisava do mesmo —
  duplicar significaria que "ordenado" passaria a querer dizer coisas diferentes em
  duas tabelas do mesmo SDK. Comportamento idêntico ao anterior; agora exportado no
  barrel para quem ordena listas fora de uma tabela.

### Corrigido

- **`useSortable` expunha o grupo por ref lido no render.** Mesmo defeito que as
  regras do React Compiler acharam no `RefreshIndicator`: ref não é reativo, então
  `aria-selected` e a classe do card dependiam de um valor pelo qual o React não
  re-renderiza. Grupo virou **estado**, com o ref apenas como espelho para a leitura
  síncrona do listener de `pointerup`. Na mesma linha, `commit` passou a **receber**
  os grupos em vez de lê-los de ref: ele acaba dentro dos props que o render
  distribui, e leitura de ref em qualquer ponto dessa cadeia é acesso em tempo de
  render.
- **`ref` do `useSortable` virou `setContainer`.** O nome antigo prometia um objeto
  legível quando é um **callback**, e as regras do Compiler sinalizavam todo
  consumidor por causa disso.
- **Contador mutável durante o render no `Kanban`.** O índice flat vinha de
  `flatIndex++` dentro do `map` — mesma família do `let timer` do `Tooltip`. Agora os
  offsets por coluna são derivados com `useMemo`, sem mutação: render replayado não
  retoma de contador meio-avançado.
- **Três defeitos de ARIA no quadro, achados pelo sweep `axe`**: `role="option"` não
  é permitido em `<article>`; `<header>` fora de elemento de seccionamento vira
  landmark `banner` (três colunas = três banners duplicados); e um `listbox` único no
  quadro reprova `aria-required-children`, porque o cabeçalho da coluna quebra a
  posse dos `option`. A estrutura final é **um `listbox` por coluna com cards**,
  nomeado pelo título — coluna vazia não é listbox, já que zero `option` também
  reprova.

### Adicionado

- **`tempest fix` converte import relativo pra `@/`.** O `@/` era a convenção do
  scaffold e do `doctor`, mas nada no ferramental convertia pra ela: nem o ESLint
  nem o Prettier reescrevem caminho de módulo, então `../../services/api` sobrevivia
  a quantos `fix` você rodasse, e o projeto acumulava duas convenções (arquivo novo
  com `@/`, arquivo antigo com `../`). A regra é uma só — **nenhum import sobe de
  diretório**: todo specifier que começa com `../` **e** resolve dentro da base do
  alias vira `@/…`; irmão (`./x`) continua relativo, porque já diz "isso mora aqui
  do lado"; e caminho que resolve **fora** da base fica intacto (é isso que protege
  `../../../vite.config`).
- A conversão roda **antes** do `eslint --fix`, não depois: trocar o specifier muda
  o grupo de ordenação do `simple-import-sort`, então na ordem inversa o resultado
  sairia desordenado e só o `fix` seguinte arrumaria.
- Alcança `import`, `export … from`, `import type`, `import()` dinâmico,
  `vi.mock`/`vi.doMock`, e `@import`/`url()` em `.css` (o Vite resolve alias em
  stylesheet também). Usa a AST do **`typescript` do próprio projeto**, então string
  parecida com caminho em comentário, template literal, variável ou `import()`
  interpolado nunca é reescrita — e `require()` fica de fora por decisão.
- **O alias vem do `tsconfig.json`, não é chumbado**: prefixo e base saem de
  `compilerOptions.paths`, seguindo `extends` e aceitando JSONC, então `~/*`, `#/*`
  e base `app/` funcionam. **Sem `paths` declarado a conversão não roda** — adivinhar
  `@` → `src` só porque existe um `src/` geraria import que não resolve (o
  `examples/gallery` deste repositório é exatamente esse caso: tem `src/` e nenhum
  alias). O comando avisa apontando o conserto e segue pro ESLint sem tocar em nada.
- Flags novas do `fix`: `--dry-run` lista arquivo, linha e antes/depois sem escrever
  e sem rodar ESLint/Prettier; `--no-alias` reproduz o comportamento anterior.
- **`useSortable` + `moveItem` — a primitiva de drag & drop que faltava.** Não
  havia nada de DnD nos 45 hooks, e isso bloqueava três itens do roadmap de uma vez
  (Kanban, reordenar lista, ordenar fila de upload). O hook cuida **só** da
  interação: ponteiro unificado (mouse/toque/caneta) com pointer capture, e
  `onReorder` disparando **uma vez** por movimento confirmado — nunca durante o
  arrasto, porque aí uma lista controlada re-renderizaria a cada `pointermove` e os
  índices mudariam debaixo do próprio arrasto. Você desenha o preview com
  `overIndex` e aplica a mudança com `moveItem` (helper puro, não mutante).
- **Caminho de teclado de igual peso, não um extra**: `Espaço` pega, setas movem,
  `Espaço`/`Enter` soltam, `Escape` cancela — mesmo estado, mesma confirmação, mesmo
  `onReorder` do caminho de ponteiro. Reorder que só funciona arrastando exclui
  quem navega por teclado, e é onde a maioria das implementações falha. A semântica
  é `role="listbox"` + `role="option"` + `aria-roledescription` (localizável).
- O hit-test lê os **rects vivos** dos filhos `[data-sortable-index]` em vez de
  supor altura fixa, então linha de altura variável funciona. Mudança em
  `itemCount` no meio de um arrasto **cancela** o arrasto: a lista não tem mais os
  índices em que ele se baseava, e confirmar moveria a linha errada.

### Corrigido

- **`tempest lint`/`format` tratavam flag como caminho.** Os três comandos
  repassavam a cauda do argv inteira como lista de caminhos, então
  `tempest lint --max-warnings 0` contava a flag como caminho e o ESLint rodava com
  a flag e **sem padrão de arquivo**. Agora flag e caminho posicional são separados:
  o caminho continua default `.`, e as flags são repassadas pro binário.
- **O `doctor` sumia com a seção TypeScript em silêncio.** A leitura do
  `tsconfig.json` era `JSON.parse` puro dentro de um `try/catch` que devolvia `null`,
  então comentário no JSON (JSONC, que o `tsc` aceita) fazia o `doctor` pular a
  seção inteira sem dizer nada, e `paths` herdado via `extends` aparecia como "sem
  alias". Passa a ler pela API do compilador, com a cadeia de `extends` mesclada e
  os valores mantidos crus (`"bundler"`, `"react-jsx"`) em vez de normalizados pra
  enum numérico.

## [0.25.0] — 2026-07-25

### Corrigido

- **Tema gerado reprovava contraste AA.** O sweep `axe` no browser (que roda no
  `e2e.yml`, ao contrário do sweep em jsdom — jsdom não pinta, então não mede
  contraste) reprovou o chip `+N` do `AvatarGroup` e o label ativo do `Stepper`
  nos temas gerados. A causa não era o CSS dos componentes: os pares de token
  afinados à mão dão 6.2:1, mas o **ramp neutro gerado** dava 4.2:1 — e caía para
  3.5:1 quando eu tentei corrigir tirando a ancoragem. O erro de fundo era usar
  **uma única curva de lightness** para marca e para neutro: medindo as escalas do
  `colors.css` em OKLCH, a neutra é bem mais larga (`0.982 → 0.210`) que a de marca
  (`0.966 → 0.251`), porque neutro carrega superfície quase branca e texto quase
  preto. Agora existem duas curvas, ambas com os valores **medidos** das escalas
  embutidas, e a neutra não é ancorada (ancorar comprime exatamente a faixa que ela
  precisa ter larga). `createColorScale` ganhou as opções `neutral` e `anchor`.
- **O guard que faltava**: um teste percorre os 6 presets e assere
  `text-muted`/`surface-3` ≥ 4.5:1, `text`/`surface-3` ≥ 7:1 e `text`/`bg` ≥ 7:1.
  Sem ele, esse tipo de regressão só aparecia no CI — e o docstring da curva antiga
  ainda afirmava estar "afinada contra as escalas do colors.css", o que não era
  verdade.

- **`<Tooltip>` deixava de cancelar a abertura pendente.** O handle do timer vivia
  num `let` no corpo do componente, e esse binding é **recriado a cada render** —
  então qualquer re-render entre o `mouseenter` e o `mouseleave` (update do pai,
  mudança de estado em outro lugar) descartava o handle, o `clearTimeout` cancelava
  nada e o tooltip abria com o ponteiro já fora. Virou `useRef` + cleanup no
  unmount. Achado pela regra `react-hooks/immutability`, e coberto por um teste de
  regressão que **falha** na implementação antiga (verificado apontando o teste
  para a versão anterior do arquivo).
- **`<RefreshIndicator>`: `engaged` saía de um ref lido no render.** Ref não é
  reativo, então a classe renderizada dependia de um valor pelo qual o React nunca
  re-renderiza — só parecia certo porque os handlers de toque também chamavam
  `setPull`. Agora é estado de verdade.
- **`useAudio` criava o player durante o render.** `if (!ref.current) ref.current =
createAudioPlayer()` é efeito colateral em tempo de render; virou inicializador
  de `useState`, que roda exatamente uma vez. De brinde o valor deixou de ser
  nullable, e as duas `useCallback` que dependiam dele ganharam a dep que faltava.

### Alterado

- **Regras do React Compiler ligadas** (`eslint-plugin-react-hooks` v7 completo).
  17 sites que escreviam o "latest ref" no corpo do hook passaram a escrever em
  `useEffect` — legítimo aqui porque quem consome esses refs são subscriptions,
  timers e handlers, que só disparam depois do commit.
- **Regras escopadas a código de produto.** Teste e gallery ficam de fora das
  regras do Compiler: um teste escreve em ref e faz stub de global justamente pra
  simular ambiente que o componente não controla, e sinalizar isso é ruído, não
  segurança. O par clássico (`rules-of-hooks`, `exhaustive-deps`) continua valendo
  em todo lugar. Isso derrubou o volume de 91 para 53 diagnósticos antes de
  qualquer refatoração.
- **5 hooks ficam explicitamente exentos**, com o porquê no próprio arquivo:
  `useStableCallback` (mover pra effect abriria janela de staleness de um commit
  num primitivo que outros hooks usam — o caso de uso do futuro `useEffectEvent`),
  `useDeepMemo` (o cache é ref lido e escrito no render, e a escrita é idempotente,
  então replay de render não muda resultado), `usePrevious` e `useIsFirstRender`
  (o acesso ao ref no render **é** o contrato), e `usePushSubscription` +
  `Tooltip` (o ref é lido dentro de callback diferido, não no render).
- **`set-state-in-effect` fica desligada por ora**, com a justificativa no próprio
  `eslint.config.js`: são 19 sites em 18 arquivos que semeiam estado a partir de
  sistema externo (media query, storage estimate, geolocalização, install prompt,
  status de socket…). Cada um precisa de decisão própria — derivar, migrar pra
  `useSyncExternalStore`, ou manter com justificativa — e juntar esse julgamento na
  mesma mudança que ligou as regras deixaria os dois irrevisáveis. O follow-up
  religa como `error`.

### Corrigido

- **`createTheme` não entregava a sua cor de marca.** O degrau `500` era forçado na
  lightness alvo da curva, então `primary: "#7c3aed"` voltava como `#9161fe` —
  mesma matiz, mesma croma, **re-clareado**. A doc até afirmava
  `theme.light["--tempest-primary-500"] // "#7c3aed"`, o que simplesmente não era
  verdade. Agora a escala é **ancorada** no `500`: a lightness da marca é o ponto
  fixo e as duas metades do ramp são reescaladas em volta dela, preservando a forma
  da curva e a monotonicidade — inclusive para marca muito clara (amarelo) ou muito
  escura (navy), que ganham um trecho mais curto do lado apertado. **Quem já gerou
  tema na 0.25.0 verá as cores mudarem** (para a cor certa).
- **Paleta de 6 cores virava 8 no gráfico.** `createTheme({ chart: [6 cores] })`
  escrevia `--tempest-chart-1..6`, mas o `resolveChartColors` seguia lendo até o
  `-8` e pegava os dois defaults embutidos do SDK — um gráfico com 7 séries saía
  com paleta misturada, 6 da marca + 2 sobras. O factory agora escreve
  `--tempest-chart-count` e o leitor para ali (clampado ao total de tokens
  existentes; contagem malformada é ignorada). Descoberto **olhando** a section
  nova do gallery: com o preset violeta, `chart-7`/`-8` continuavam laranja e teal.
- **`<Wizard>` tinha string de UI cravada em inglês.** O sufixo `(optional)` do
  passo opcional era hardcoded num SDK que tem i18n — no gallery em PT-BR aparecia
  “Opcional (optional)”. Virou a prop `optionalLabel`.
- **Gallery cortava demo largo no celular.** `.example` tem `overflow: hidden`, e
  como item de grid não encolhe abaixo do conteúdo por default, uma tabela com
  `min-width` empurrava a coluna e o conteúdo ficava **inalcançável** em 390px em
  vez de rolar. `min-width: 0` nos filhos do `.example-body` devolve a rolagem pro
  container do próprio demo — a mesma armadilha de flex/grid que a classe
  `.tempest-fill` documenta.

### Adicionado

- **4 sections novas no gallery** (37 → 41) cobrindo tudo que a 0.25.0 publicou e
  que não tinha demo: `createTheme` com troca de preset ao vivo + escala gerada +
  contraste medido + tokens de série; vitrine do `utilities.css`; `TreeView` +
  `Wizard`; `SignaturePad` + `Lightbox` + `AvatarGroup`. Efeito prático: essas
  features passam a ser exercidas pelo smoke Playwright do gallery no CI, e dá pra
  verificar pixel — foi assim que os quatro bugs acima apareceram.
- **README ganhou a seção de rebranding** — o `createTheme` era a feature principal
  da 0.25.0 e não tinha uma linha na vitrine que o npm renderiza.

### Corrigido

- **Outbox podia entregar fora de ordem.** `enqueuedAt` era `Date.now()` puro e é
  a chave de ordenação **tanto** do `listPending()` **quanto** do laço de entrega
  do `flush()`. Dois enqueues dentro do mesmo milissegundo — o normal num burst —
  empatavam, e o empate deixava a ordem para o índice: um `create` podia ser
  entregue **depois** do `update` que depende dele, e o servidor recebe uma
  atualização de registro que ainda não existe. Agora o timestamp é estritamente
  crescente por instância do motor (empate avança 1ms), então a fila é FIFO de
  verdade. Custo: o `enqueuedAt` pode ficar alguns milissegundos à frente do
  relógio durante um burst. Achado porque o teste "lists pending entries in enqueue
  order" falhava **de forma intermitente** — passava quando os dois enqueues caíam
  em milissegundos diferentes. O teste de regressão agora **congela** `Date.now()`,
  então o empate é garantido em vez de sorteado.

### Adicionado

- **`createTheme` — a marca inteira a partir de uma cor.** Trocar a marca exigia
  escrever ~30 valores só de `primary` (dez degraus × claro/escuro + os aliases
  de hover/active/soft) e acertar na mão a **inversão do ramp** no tema escuro.
  Agora `createTheme({ primary: "#7c3aed" })` deriva tudo: escalas de `primary` e
  `gray`, os quatro status (`-fg`/`-bg`/`-border`/`-solid`), tokens de gráfico,
  escala de radius e o focus ring. Devolve `{ light, dark, css }` — só as
  famílias passadas são geradas, então um tema é **patch** e não fork do
  `colors.css`.
- **A escala é derivada em OKLCH**, não em HSL: lightness em HSL não é
  perceptual, e é isso que faz uma paleta gerada parecer quebrada em algumas
  matizes (um amarelo e um azul com o mesmo `L` têm brilho bem diferente). A
  matiz e a croma da cor de entrada são preservadas, então marca discreta gera
  escala discreta em vez de ser "corrigida". Conversões expostas (`hexToOklch`,
  `oklchToHex`, `createColorScale`, `contrastRatio`, `relativeLuminance`,
  `readableForeground`) — zero dependência nova.
- **Contraste é medido, não convencionado.** `--tempest-primary-foreground` é
  escolhido por contraste entre branco e o cinza escuro (hardcodar branco
  produziria botão ilegível em marca clara — amarelo, lima, ciano), e
  `--tempest-primary-on-soft` desce no ramp até passar de 4.5:1 sobre a tinta
  soft. Isso saiu de um teste que falhou: o passo fixo `600` do emerald gerado
  parava em 4.41:1, e o azul embutido só alcança 4.37:1 no `500` — os dois
  reprovavam AA por um fio. `themeContrast()` expõe a medição pra quem quer
  assertar a própria marca no teste.
- **`applyTheme(theme)`** instala o tema num `<style id="tempest-theme">` que ele
  mesmo gerencia — idempotente, então um seletor de marca pode ser acionado à
  vontade sem empilhar folhas mortas no `<head>`. Retorna o disposer, aceita
  `id`/`target` (subárvore ou shadow root) e é no-op fora do browser.
  `readThemeToken(name, element?)` lê um token computado pra JS que não aceita
  `var()` (canvas, `<meta name="theme-color">`, libs de gráfico).
- **6 presets de marca** (`themePresets`: `tempest`, `violet`, `emerald`, `rose`,
  `slate`, `amber`) como **objeto de opções**, não CSS — dá pra espalhar e
  sobrescrever um campo. `getThemePreset(name)` devolve `undefined` para nome
  inválido, então um valor vindo de `localStorage` não quebra o boot.
- **Tokens de data viz** — `--tempest-chart-1` … `--tempest-chart-8` (categóricas,
  espaçadas por matiz) + `--tempest-chart-grid` / `--tempest-chart-axis`, com
  versão clareada no bloco dark.
- **`tempest-react-sdk/utilities.css` — camada de layout opt-in.** Os CSS Modules
  resolvem o **dentro** de cada componente; o que sobrava pro app era o **em
  volta** — casca de página, form de duas colunas, linha de ações, card, região
  que rola na horizontal. Todo app reescrevia esse CSS. Agora são ~50 classes
  prefixadas `tempest-`, escritas **só com tokens** `--tempest-*` (nenhuma cor
  literal, nenhum número mágico), então a camada acompanha o tema e o modo escuro.
  Primitivas: `container`, `stack`, `cluster`, `row`, `center`, `spread`,
  `grid-auto` (responsivo **sem media query**), `sidebar-layout`, `form-grid` +
  `form-span`, `fill`/`fixed`, escala de `gap`/`pad`, `truncate`/`clamp-2..4`,
  `card`/`panel`/`inset`/`divider`, `scroll-x`/`scroll-y`, `page` +
  `page-header`/`page-title`/`toolbar`, `aspect-video`/`aspect-square`,
  `visually-hidden`, `numeric` (tabular-nums), `busy`.
- **Ajuste por instância via custom property**, não por variante de classe:
  `--tempest-grid-min`, `--tempest-stack-gap`, `--tempest-sidebar-width`,
  `--tempest-container-width`, `--tempest-form-columns` etc. — `style={{
"--tempest-grid-min": "220px" }}` resolve sem escrever CSS.
- **Novo subpath `./utilities.css`** e um passo de build (`scripts/copy-css-assets.mjs`)
  que copia o arquivo pra `dist/` **sem** passar pelo grafo de módulos: o
  `cssCodeSplit: false` do Vite juntaria a camada dentro do `styles.css`, e ela
  precisa continuar separada pra ser de fato opt-in. Budget próprio no
  `size-limit`: **1.13 KB brotli** (limite 3 KB).

Fica **opt-in de propósito**: são nomes de classe globais, e um app que já tem
sistema de layout próprio não deve pagar por eles. E não é um Tailwind — a decisão
"CSS Modules + tokens é a estratégia de estilo dos componentes" segue de pé; isto
é ferramenta pro código do app, não um segundo caminho de estilizar o SDK.

Um teste de contrato guarda essas promessas (prefixo em toda classe, zero cor
literal, zero `!important`, só tokens `--tempest-*` referenciados, fora do
`index.css` e presente no `exports`) — sem ele a camada apodrece em silêncio.

- **`<TreeView>`** — árvore acessível para dado hierárquico (categorias,
  permissões por módulo, pastas, organograma), que era a lacuna mais óbvia do
  catálogo: os 104 componentes cobriam lista e tabela, e nada cobria hierarquia.
  Implementa `role="tree"` com **roving tabindex** — uma única linha tabulável, e
  as setas movem o foco dentro do widget; sem isso uma árvore de 500 nós
  adicionaria 500 paradas na ordem de tabulação da página. Teclado completo
  (`↓`/`↑`, `→` expande ou desce, `←` colapsa ou sobe pro pai, `Home`/`End`,
  `Enter`/`Espaço`), `aria-level` por profundidade, nós desabilitados pulados na
  navegação, expansão e seleção controladas ou não. `children: []` é **galho
  vazio** (mostra chevron, anuncia `aria-expanded`); folha é `children` ausente.
  O chevron é decoração `aria-hidden`, não um segundo controle focável — a linha
  já carrega o estado, e o clique nele expande sem selecionar.
- **`<Wizard>`** — fluxo multi-passo com validação por passo. O `Stepper` era só
  o **indicador visual**: índice ativo, gate antes de avançar, botão pendente e
  chamada de conclusão ficavam por conta de cada app. `validate` por passo aceita
  função sync ou async (`() => form.trigger([...])` é o caso típico), e um gate
  que **lança** conta como "não permitido" — um `validate` ligado a checagem de
  rede não deve deixar o usuário num fluxo meio-avançado quando a requisição
  falha. Pulo pra trás é livre; pulo pra frente valida **cada passo atravessado**.
  `content` aceita nó ou função que recebe os controles (`next`/`back`/`goTo`/
  `validating`), e `renderActions` substitui a linha de botões.
- **`<Stepper>` ganhou `description` por passo e `onStepClick`** (aditivo). O
  indicador continua **read-only por default**: num fluxo com gates, deixar pular
  livremente contradiz o motivo do fluxo existir.
- Os dois entraram no sweep de acessibilidade em jsdom (`axe`), sem violações.
- **`<SignaturePad>`** — captura de assinatura em canvas, pra comprovante de
  entrega, ordem de serviço e termo de aceite. Eventos `pointer` (mouse, dedo e
  caneta pelo mesmo caminho), traços guardados como **listas de pontos** e canvas
  redesenhado a partir delas — é o que torna `undo` possível: canvas guarda pixel,
  não histórico. O buffer é escalado por `devicePixelRatio` (sem isso o traço sai
  borrado no celular, o defeito clássico de canvas 1x), e a cor default é a cor
  **computada** do canvas, que o CSS liga em `--tempest-text` — então a tinta
  segue o tema em vez de ser preto fixo. Handle imperativo com `clear`, `undo`,
  `isEmpty`, `toDataURL` e `toBlob` (a doc recomenda `toBlob` pro upload: data URL
  é base64, ~33% mais bytes).
- **`<Lightbox>`** — visualizador de imagem em tela cheia com navegação. Overlay
  `role="dialog" aria-modal` com foco preso e rolagem da página travada, teclado
  completo (`Esc`, `←`/`→`, `Home`/`End`), contador, faixa de miniaturas e
  **pré-carregamento das vizinhas** via `Image()`, pra que `→` não pisque um
  quadro vazio. `alt` é obrigatório no item: galeria sem rótulo é inutilizável em
  leitor de tela. `loop` default `true` — num visualizador de foto, fim morto na
  última imagem é lido como bug mais vezes do que como limite.
- **`<AvatarGroup>`** — fileira de avatares sobrepostos com chip `+N`. Um único
  `role="group"` com um nome acessível, e o chip carrega a contagem restante, pra
  que o total não fique escondido do leitor de tela. Sobreposição ajustável por
  `--tempest-avatar-overlap`, proporcional ao `size` por default. O chip só é
  focável quando existe `onOverflowClick` — botão sem ação é ruído de tabulação.
- Os três (com exceção do `Lightbox`, que monta em portal) entraram no sweep de
  acessibilidade `axe`, sem violações.

### Corrigido

- **Gráficos ignoravam o tema.** O módulo `/charts` usava `DEFAULT_CHART_COLORS`
  **hardcoded em JS**: rebrandar o app via tokens não mexia em nenhuma série, e
  virar o tema escuro deixava cores de tema claro num canvas escuro. Os cinco
  gráficos agora resolvem `--tempest-chart-*` em runtime (`useChartColors`, que
  re-resolve observando `data-tempest-theme`); `colors` explícito continua
  ganhando e curto-circuita o observer. `DEFAULT_CHART_COLORS` passou a ser o
  **fallback** (sem `styles.css`, fora do browser, página sem os tokens).
- **A doc de charts ensinava algo que não funciona.** Ela sugeria
  `colors={["var(--tempest-color-primary)"]}`; recharts aplica cor como
  **atributo de apresentação** do SVG e navegador nenhum resolve `var()` ali —
  custom property só resolve em declaração CSS, então a série renderizava
  inválida (invisível). A seção foi reescrita (PT + EN) com o porquê e com o
  caminho certo (`resolveChartColors` / `readThemeToken`), e a coluna "default"
  das tabelas de props deixou de mentir.

## [0.24.0] — 2026-07-25

### Adicionado

- **Release sincroniza as três superfícies: git tag, npm e GitHub Release.**
  Havia 30 tags e 30 versões no npm contra **zero** GitHub Releases — quem
  chegava pelo repositório não tinha changelog navegável nem tarball por versão.
  O `release-npm.yml` ganhou, depois do publish: **guard de versão** (aborta se a
  tag não descrever o `version` do `package.json`, antes de publicar qualquer
  coisa), **read-back do registry** (o npm precisa servir a versão _e_ apontar
  `dist-tags.latest` pra ela, com retry pela propagação) e **criação do GitHub
  Release** com as notas extraídas da seção do CHANGELOG + tarball anexado —
  idempotente, então re-rodar a mesma tag edita o Release em vez de falhar.
- **`scripts/changelog.mjs`** — `notes <versão>` extrai a seção do CHANGELOG (só
  cai no `[Unreleased]` com `--allow-unreleased`, pra um backfill nunca colar as
  notas do ciclo seguinte numa tag antiga) e `close <versão> [data]` fecha o
  `[Unreleased]` numa seção datada. O `release.sh` chama o `close` no bump, então
  a tag que sai já carrega notas datadas.
- **`make releases-check`** (relatório tag × npm × Release, só leitura),
  **`make releases-sync`** e **`make releases-sync-dry`** (backfill dos Releases
  faltantes via `scripts/sync-github-releases.sh`, idempotente).

### Alterado

- **`react-router-dom@7` → `react-router@8`.** O advisory
  [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) (CSRF
  em modo RSC) cobre **todo** o intervalo `7.12–8.2` e a linha `react-router-dom`
  **parou no 7.18.1** — não existe `react-router-dom@8`, as bindings de DOM
  passaram a morar no próprio `react-router`. Como o SDK já re-exportava a
  superfície inteira (`Link`, `Outlet`, `useNavigate`, …), a troca é interna:
  quem importa de `"tempest-react-sdk"` não muda uma linha. **Quem importava
  `react-router-dom` direto** no app precisa trocar o especificador para
  `react-router` (a API é a mesma). O advisory nunca alcançou o SDK — modo RSC
  não é alvo (client-only), mas poluía o `npm audit` de todo consumidor.
- **Tooling atualizado até o topo**: Vite 7 → **8**, `@vitejs/plugin-react` 5 →
  **6**, `vite-plugin-dts` 4 → **5** (a opção `rollupTypes` virou `bundleTypes` e
  o `@microsoft/api-extractor` agora é dependência explícita), ESLint 9 → **10**,
  `@eslint/js` 10, `globals` 17, `eslint-plugin-react-hooks` 5 → **7**,
  `eslint-plugin-react-refresh` 0.4 → **0.5**, TypeScript 5.9 → **6.0**,
  `lucide-react` 0.575 → **1.26**, `@testing-library/jest-dom` 6 → **7**,
  `size-limit` 12 → **13**, `@types/node` 24 → **26**, Playwright 1.62. O peer de
  `vite` aceita `^8` e o de `@vitejs/plugin-react` aceita `^6`.
- **`npm audit` do app gerado: 0 vulnerabilidades** (era 8 highs). Validado
  scaffoldando um app do zero contra o tarball local, nos dois templates (base e
  `--pwa`): `npm install` limpo, `typecheck`, `lint` e `build` passando.
- **TypeScript 7 ficou de fora, e não por preguiça**: `typescript-eslint@8.65`
  declara peer `typescript >=4.8.4 <6.1.0`, então o 7.x derrubaria o lint com
  tipos. O 6.0.3 é o teto suportado hoje.
- **Templates (`template/`, `template-pwa/`) na mesma stack** — ESLint 10,
  TypeScript 6, Vite 8, `plugin-react` 6, `sharp` 0.35, React 19.2.8. O preset
  `reactHooks.configs.recommended` do plugin v7 (que passou a incluir as regras
  do React Compiler) fica **fora** por default: um app novo reprovaria no dia um.
  As duas regras clássicas (`rules-of-hooks`, `exhaustive-deps`) continuam ligadas
  e o resto é opt-in, comentado no `eslint.config.js` gerado.
- **`WebSocket` — `payload` agora é `string | Blob | BufferSource`** em
  `createWebSocket`/`useWebSocket` (era `string | ArrayBufferLike | Blob |
ArrayBufferView`). O lib DOM do TS 6 tirou `SharedArrayBuffer` de
  `BufferSource`, e `WebSocket.send` nunca aceitou SAB de fato — o tipo antigo
  prometia mais do que a plataforma entrega.
- **`tsconfig.json` sem `baseUrl`** — deprecado no TS 6 (erro `TS5101`), com
  `paths` passando a usar `./src/*`. O `tempest doctor` também passou a checar
  instância duplicada de `react-router`, além de `react-router-dom`.

### Corrigido

- **App gerado reprovava `npm run lint` no dia um.** Os fontes do `template/`
  nunca passaram pela própria regra `simple-import-sort/imports` que o template
  liga, então `npm run lint` num projeto recém-criado saía com 6 erros. Imports
  ordenados na fonte; app novo agora linta limpo.
- **Pre-commit quebrava com ESLint 10.** O v10 resolve o config **por arquivo**,
  então o `lint-staged` passava a achar o `template/eslint.config.js` e o
  typescript-eslint abortava com `No tsconfigRootDir was set, and multiple
candidate TSConfigRootDirs are present`. Os dois configs agora fixam
  `parserOptions.tsconfigRootDir: import.meta.dirname`, e os plugins que só o
  template usava (`simple-import-sort`, `unused-imports`) entraram como devDep da
  raiz — de brinde, os fontes do template passaram a ser lintados de verdade.
- **CLI não mencionava o `.env`.** O `create-tempest-app` imprimia
  `npm install` + `npm run dev`, mas `src/lib/api.ts` lê
  `import.meta.env.VITE_API_URL` — sem `.env` a base do cliente HTTP fica
  `undefined`. Os next steps agora incluem `cp .env.example .env` (omitido quando
  o diretório já tem um `.env`).

### Documentação

- **Getting started reescrito em cima do modo `.`** (`docs/index`,
  `docs/tutorial/index`, `docs/scaffold`, `docs/cookbook`, README — PT + EN):
  `mkdir my-app && cd my-app && npx -p tempest-react-sdk create-tempest-app .` é
  o caminho recomendado, com tabela explicando **cada pedaço** do comando
  (`npx`, `-p`, nome do `bin`, destino), tabela comparando os dois modos
  (`.` / sem argumento / nome de pasta) e uma seção de troubleshooting com o erro
  real de cada sintoma.
- **Duas afirmações falsas removidas da doc**: (1) `npm create tempest-app`
  **não** funciona — não existe pacote `create-tempest-app` no npm (404), a CLI é
  o `bin` do SDK; (2) rodar sem argumento **não pergunta** um nome de projeto com
  default `my-tempest-app` — é idêntico a passar `.` (merge no diretório atual),
  conforme `bin/create-tempest-app.mjs`.
- Referências a `react-router-dom@7` viraram `react-router@8` na doc de
  roteamento, arquitetura, cookbook, auth, error-boundary e tutorial (PT + EN);
  o "Versão atual: 0.7.0" cravado no cookbook virou link pra página do npm, que
  não desatualiza.

### Testes

- **Cobertura de branches 80.8% → 90.1%** (linhas 90.2% → 97.4%, statements
  87.5% → 95.0%, funções 89.1% → 95.6%), com ~440 testes novos em 24 arquivos.
  Pisos do CI subiram pra 96/94/94/89 (linhas/statements/funções/branches).
  Alvos: `relative-time` (todas as unidades/plurais nos 2 locales), `sw/cache`
  (stale-while-revalidate, timeout de rede, `Range` malformado),
  `sw/background-sync` (4xx vs 5xx, expiração, replay sem Background Sync API),
  `geo/leaflet-map` (era 0% — leaflet mockado + o caminho real de peer ausente),
  `TrajectoryMap`, `BrazilMap`/`BrazilStateMap` (choropleth, pan/zoom, markers),
  `use-camera-stream` (todo o mapeamento de `DOMException`), `Layout`,
  `DataTable`, `MultiSelect`, `DropdownMenu`, `PinInput`, `Carousel`,
  `Resizable`, `Calendar`, `TimePicker`, `Combobox`, `FileUpload`, `Dropzone`,
  `DateRangePicker`, `RichTextEditor`, `useFocusTrap`, `useLocalStorage`,
  `useKeyboardShortcut`, `useInstallPrompt`, `useStorageEstimate`,
  `useServiceWorkerUpdate`, `ThemeProvider` (listener de `prefers-color-scheme`),
  `createWebSocket`, `createTempestAuth`, `createOfflineSync`, `cache-inspect`,
  `create-push-handler`, `geocode` e `tempestPwaIcons` (sharp mockado).
- **Cobertura de branches 90.1% → 95.0%** (linhas 97.4% → 98.5%, statements
  95.0% → 97.1%, funções 95.6% → 96.4%), +303 testes (1969 → 2272). Pisos do CI
  subiram pra 98/97/96/94. Alvos: `sw/cache` e `background-sync`, `sse/create-event-stream`,
  `ws/create-web-socket` (guards pós-`close`), `http/api-client` e
  `upload-with-progress`, `usePaginatedQuery`, `useOfflineMutation`,
  `persistQueryClientOffline`, `createOfflineSync`, `createOfflineStore`,
  `createTempestAuth`, `br/geocode`, `br/scales`, `br/svg-utils` (suíte nova),
  `br/BrazilMap`, `tempestPwaManifest`, `tempestPwaIcons`, `tempestPwaDevSw`,
  `initial-theme`, `ThemeProvider`, `posthog-adapter`, `sentry-adapter`,
  `useOAuthCallback`, `useIntersectionObserver`, `usePoll`, `useDeepMemo`,
  `useEventListener`, `useLocalStorage`, `usePushSubscription`, `storage`,
  `deepMerge`, `br-validators` e os componentes `Table`, `Input`, `Sidebar`,
  `RefreshIndicator`, `Drawer`, `ContextMenu`, `NavigationMenu`, `Menubar`,
  `Command`, `Divider`, `Checkbox`, `StepperInput`, `Carousel`, `AppShell`,
  `Layout`, `TimePicker`, `Combobox`, `Dropzone`, `FileUpload`, `Resizable`,
  `PinInput`, `DropdownMenu`, `MultiSelect`, `DataTable`, `Calendar`,
  `DateRangePicker` e os três charts.
- **Restam 237 branches** (5%), sendo **28 inalcançáveis** neste setup: são
  guards `typeof window === "undefined"` dentro de hooks/componentes, e o
  react-dom precisa de `window` pra renderizar — remover o global quebra o
  próprio `render()`. O resto é cauda de 1-2 branches defensivas espalhadas em
  ~120 arquivos (props opcionais com default, `?? fallback` inalcançável por
  causa do default, ramos de geometria com buracos).

### Corrigido

- **Toolbar do `<RichTextEditor>` ficava com estado velho.** O `useEditor` do
  tiptap v3 **não** re-renderiza a cada transação (default
  `shouldRerenderOnTransaction: false`), e o componente lia `isActive()` e
  `can()` direto no corpo do render — então clicar em Negrito com o cursor
  colapsado armava a marca sem mudar o documento, nenhum evento de update
  chegava, e o botão não acendia. Undo/Redo tinham o mesmo problema no
  `disabled`. Agora a toolbar assina exatamente esses valores via
  `useEditorState`, que re-renderiza só quando um deles muda (mais barato que
  re-render por tecla digitada). Encontrado ao cobrir os branches
  `isActive(...) && styles.active`, que nunca executavam.

### Qualidade

- **Lint 100% limpo** — os 13 warnings de
  `react-refresh/only-export-components` vinham de módulos de contexto que
  exportam o hook junto do provider (`ThemeProvider`+`useTheme`,
  `I18nProvider`+`useI18n`/`useTranslate`, etc.), que é a forma da API pública:
  um caminho de import por módulo. Em vez de silenciar a regra, um override
  lista **os nomes exatos** permitidos nesses arquivos — um export novo e não
  previsto continua avisando (verificado).

### Documentação

- **Escopo cravado: client-side only, PWA offline-first.** O SDK **não** vai pra
  SSR/RSC — nenhum módulo declara `"use client"`, os componentes assumem browser
  e o App Router do Next não é alvo. Registrado como decisão em `CLAUDE.md`, no
  README (seção de stack) e numa seção nova "Escopo: só client-side" na página de
  Arquitetura (PT + EN), com o porquê: cobrir os dois mundos custaria em cada API
  (dois caminhos de render, hidratação, `window` proibido no topo do módulo) e o
  offline-first sairia pior.
- **CSS Modules é a única estratégia de estilo, e isso é definitivo.** O item
  "CSS opcional / `data-tempest-classname` para Tailwind/Stitches/Linaria" saiu
  do backlog e virou decisão em `CLAUDE.md` + aviso em `docs/styles.md` (PT +
  EN): dois caminhos de estilo dobrariam a superfície de cada componente e
  diluiriam os tokens. Conviver lado a lado com um utilitário no resto do app
  continua suportado (prefixo `tempest_` + tokens legíveis via `var()`).
- **`SSR-safe` virou `safe sem window`** na doc de hooks (PT + EN). O termo
  antigo prometia render no servidor; o que os guards
  `typeof window === "undefined"` realmente entregam é não explodir fora do
  browser (testes em Node, contexto de service worker, plugin de build). Nota
  explícita no topo da página apontando pra decisão de escopo.

## [0.23.0] — 2026-07-24

### Adicionado — PWA & Offline-First

- **Camada observável no `createOfflineSync`** (`/offline`) — o motor agora
  expõe `getState()` + `subscribe(listener)` com um `SyncState`
  (`phase`/`pending`/`lastSummary`/`lastError`/`lastSyncedAt`). Aditivo e
  não-breaking. `SyncRunSummary` ganhou `lastError`. Novos tipos `SyncPhase`,
  `SyncState`.
- **`useOfflineSync(sync, opts)` + `useSyncStatus(sync)`** (`/offline`) — hooks
  React sobre o motor via `useSyncExternalStore`; flush opcional no mount, no
  evento `online` e por intervalo. `useSyncStatus` devolve um `tone` pronto pra
  badge.
- **`useServiceWorkerUpdate({ url })`** (entrada principal) — registra o SW e
  expõe `{ updateAvailable, applyUpdate, registration }` pro fluxo de update
  com consentimento.
- **`useStorageEstimate`** + **`estimateStorage`** + **`requestPersistentStorage`**
  (entrada principal) — quota do Storage API (`usage`/`quota`/`ratio`/`persisted`)
  e `navigator.storage.persist()` pra evitar despejo do IndexedDB.
- **`<OfflineIndicator>`**, **`<SyncStatusBadge>`**, **`<UpdatePrompt>`**
  (componentes) — UI de status offline / sincronização / atualização do SW.
- **`useOfflineMutation`** (`/query`) — mutation otimista que enfileira no
  outbox, atualiza o cache do TanStack Query, dá flush e faz rollback em falha.
- **`lastWriteWins` / `higherVersionWins`** (`/offline`) — resolvedores de
  conflito prontos pro `applyRemote`.
- **Coerência multi-tab** no `createOfflineSync` (`/offline`) — opção `crossTab`
  (+ `broadcastChannelName`) propaga `SyncState` entre abas via
  `BroadcastChannel`; novo método `dispose()` fecha o canal.
- **`upsertById` / `removeById`** (`/query`) — builders de `applyOptimistic` pra
  cache de lista no `useOfflineMutation`.
- **`useOnline(opts?)`** (entrada principal) — probe de reachability opt-in
  (`pingUrl`/`intervalMs`/`timeoutMs`) que capta captive portal / link morto
  além do `navigator.onLine`.
- **Flush cross-tab via Web Locks** no `createOfflineSync` — quando `crossTab`
  está ligado e a Web Locks API existe, o `flush` é serializado entre abas
  (uma roda, as outras pulam e pegam o resultado pelo broadcast).
- **`persistQueryClientOffline`** (`/query`) — persiste o cache do `QueryClient`
  no IndexedDB (`dehydrate`/`hydrate`) e restaura no boot; `restore`/`flush`/
  `clear`/`unsubscribe`. Sem depender de `@tanstack/react-query-persist-client`.
- **`<SyncStatusBadge sync={...}>`** — variante conectada que auto-fia
  `useSyncStatus` (além do modo apresentacional por `tone`).
- **Navigation Preload** no `installPrecache` (`/sw`) — habilita a API no
  `activate` e serve `event.preloadResponse` (opção `navigationPreload`,
  default `true`).
- **Periodic Background Sync** no `installBackgroundSync` (`/sw`) — listener
  `periodicsync` (opção `periodicSyncTag`) + helper de main-thread
  `registerPeriodicSync`.
- **`inspectCaches` / `clearCaches`** (`/sw`) — observabilidade e limpeza do
  Cache Storage (contagem + bytes, filtro por prefixo/regex/predicado).
- **Docs**: nova página bilíngue **PWA & Offline-First** (`docs/pwa.md`); seções
  novas em `offline-sync`, `query`, `hooks` e `components/feedback`.

### Mudado — empacotamento

- **`dist/` agora preserva o grafo de módulos** (`preserveModules` no Rollup):
  um arquivo por módulo de origem em vez de um bundle único por entrada. O
  bundle único fazia o bundler do app não conseguir provar que os statements
  eram livres de efeito colateral, então importar só `cn` arrastava ~8.5 KB
  gzip de componentes não usados. Medido com `npm run size` (brotli):

  | fatia importada                                                        | antes   | agora   |
  | ---------------------------------------------------------------------- | ------- | ------- |
  | `{ cn }`                                                               | 7.8 KB  | 118 B   |
  | `{ Button }`                                                           | 7.8 KB  | 820 B   |
  | app típico (5 componentes + router + providers + HTTP + auth + 1 hook) | 12.8 KB | 6.83 KB |

  Sem mudança de API: mesmas entradas (`tempest-react-sdk.js` / `.cjs`),
  mesmo `styles.css` único, mesmos subpaths. O tarball publicado continua em
  2.5 MB (212 → 1804 arquivos, +0.3 MB descompactado).

- **Budgets de `size-limit` reescritos por fatia** — as entradas agora medem o
  que um app realmente paga (`{ cn }`, um componente, app típico, HTTP, forms
  BR, offline/PWA, geo) em vez de só o barrel inteiro. O barrel virou um teto
  explícito ("ninguém importa isso") em 80 KB ESM / 95 KB CJS: medir o total
  fazia o gate crescer junto com cada feature e não dizia nada sobre custo pro
  consumidor — os budgets estavam a 3% de estourar.

### Corrigido — acessibilidade

- **`Modal` sem nome acessível** — o `role="dialog"` não era ligado ao `title`.
  Agora o título recebe um id e o diálogo aponta pra ele via `aria-labelledby`;
  diálogo sem título aceita `aria-label`. O `<h3>` do header só é renderizado
  quando existe `title` (antes sobrava um heading vazio quando só havia o botão
  de fechar).
- **`PasswordInput` e `ChipInput` com label solto** — o `<label>` não tinha
  `htmlFor` nem o input tinha `id`, então o campo ficava sem nome acessível
  (`getByLabelText` não achava). Ambos passaram a gerar id (respeitando um `id`
  vindo do caller), associar o label e apontar `aria-describedby` pro erro ou
  helper. `ChipInput` também aceita `aria-label` pra quando o label vive fora.
- **`Progress` sem nome acessível** — `role="progressbar"` exige nome; agora sai
  de `aria-labelledby`, `aria-label` ou do `label` visível, nessa ordem.
- **Contraste abaixo de AA em `Calendar` / `DateRangePicker`** — os dias fora do
  mês combinavam `--tempest-text-subtle` com `opacity: 0.55`, resultando em
  2.11:1 em botões clicáveis. A opacidade saiu.
- **Novo token `--tempest-primary-on-soft`** — texto sobre
  `--tempest-primary-soft` usava `--tempest-primary`, que dá 4.37:1 (AA pede
  4.5:1). O token novo aponta pro shade 600 no tema claro e 700 no escuro (~6:1)
  e passou a ser usado em `Toggle`, `ToggleGroup`, `ListTile`, `Stepper`,
  `NavigationRail` e `FileUpload`. Tokens são API pública: apps que
  sobrescreveram a paleta podem redefini-lo.
- **`ToggleGroupItem` só com ícone**: documentado que precisa de `aria-label`.

### Qualidade — cobertura e lint

- **Cobertura passou a gatear o CI** — `vitest.config.ts` não tinha
  `coverage.thresholds` e o `ci.yml` rodava `test:run`, então cobertura era só
  relatório. Agora o CI roda `test:coverage` com pisos em 89% linhas / 86%
  statements / 88% funções / 79% branches (medidos: 90.2 / 87.5 / 89.1 / 80.8).
- **`src/vision/` vendorizado saiu da conta** — os arquivos copiados do
  `ort-vision-sdk-web` (regerados por `npm run vendor:vision`, testados no
  upstream) puxavam 845 linhas descobertas e distorciam a métrica: 78% virou
  90% de linhas ao medir só o que é nosso. As adições próprias do SDK ali
  (`public.ts`, hooks de câmera e luminância) continuam medidas.
- **`pwa-env` ganhou testes** — 19 casos cobrindo iOS/iPadOS com UA de desktop,
  forks Chromium do Android sem prompt API, `intent://` e detecção de
  standalone, incluindo os caminhos sem `window`/`navigator`.
- **Warnings de lint reais resolvidos** — `useKeyboardShortcut`,
  `useGeolocation` e `DataTable` dependem de campos desestruturados de propósito
  (o objeto é literal inline e recriaria o listener/memo a cada render); a
  intenção foi pro docstring e o `exhaustive-deps` silenciado na linha. O
  `eslint.config.js` passou a ignorar saída gerada (`coverage`,
  `test-results`, `playwright-report`, `template-pwa`), que respondia por 3
  warnings de diretiva inútil.

### Testes & CI

- **Sweep de acessibilidade em jsdom** (`src/components/a11y.test.tsx`) — 27
  casos passando `axe-core` em componentes representativos, com helper em
  `test/a11y.ts`. `color-contrast` e `region` ficam desligados nesse nível (jsdom
  não pinta nem monta página) — quem cobre isso é o smoke em browser real.
- **Smoke E2E do gallery com Playwright** (`e2e/gallery.spec.ts` +
  `playwright.config.ts` + workflow `e2e.yml`) — Chromium sobre o build de
  produção do gallery: boot sem erro de console, filtro de busca, troca de
  tema/idioma, ausência de scroll horizontal em viewport de 390px e varredura
  axe com layout real. Novos scripts `npm run e2e` / `npm run e2e:build`.

### Documentação

- **Nova página bilíngue `oauth`** — o módulo `src/oauth/` (`<GoogleSignIn>`,
  `useOAuthCallback`) era o único módulo público sem nenhuma documentação: não
  aparecia no site, no nav nem na tabela de módulos do README. Página no padrão
  tutorial (motivação → exemplo completo → peça por peça → recap), cobrindo a
  injeção do `GoogleLogin` via prop `component`, o default de One Tap ligado, a
  regra de validar o `idToken` no backend e a guarda de StrictMode do
  `useOAuthCallback`. Entrada nova no nav do MkDocs (PT + EN) e no README.

## [0.22.0] — 2026-07-15

### Adicionado

- **`useInstallPrompt`** + helpers de ambiente PWA (entrada principal) —
  orquestra o prompt de instalação: cacheia `beforeinstallprompt`, detecta
  iOS/iPadOS, forks Chromium do Android sem prompt API e modo standalone,
  monta um `intent://` pra abrir no Chrome, aplica cooldown de recusa
  (`declineStorageKey`/`declineCooldownMs` plugáveis) e resolve um
  `InstallMethod` (`"native" | "ios" | "manual" | "none"`). Exporta também
  `isIOS`, `isAndroid`, `isAndroidWithoutPromptApi`, `isStandalone`,
  `buildOpenInChromeIntent` e o tipo `BeforeInstallPromptEvent`.
- **`useLongPressHandlers`** (entrada principal) — hook de long-press que
  devolve handlers espalháveis (mouse/touch/contextmenu) + um guard
  `wasLongPress()` pra suprimir o clique seguinte. Complementa o
  `useLongPress` existente (baseado em ref), com API de props.
- **`shareOrDownloadBlob(blob, fileName, options?)`** (entrada principal) —
  companheiro do `share`: tenta o Web Share API com arquivo e cai para um
  download-anchor quando compartilhar arquivo não é suportado.
- **`writeXlsx(headers, rows)`** (entrada principal) — writer OOXML `.xlsx`
  sem dependência de runtime além de `fflate` (escaping XML, aritmética de
  colunas, células inline-string/number, montagem de sheet/workbook). Só o
  core genérico — mapeamento de linhas fica no app.
- **`registerServiceWorker`** (`/sw`) ganhou opções de auto-update:
  `autoUpdate`, `updateIntervalMs`, `reloadOnActivate` — poll de
  `registration.update()` + reload no `controllerchange` (guarda de refresh),
  direto sobre `navigator.serviceWorker`, sem `vite-plugin-pwa`.

### Dependências

- `fflate` promovido a dependência direta (era peer implícito) — usado pelo
  `writeXlsx`; externalizado no bundle.

## [0.21.0] — 2026-07-15

### Adicionado

- **`createOfflineSync`** (entrada principal, peer `dexie`) — motor de
  sincronização offline-first sobre `createOfflineStore`: **outbox** durável
  (IndexedDB), **flush single-flight** (push → pull), **guarda de offline**,
  **loop de paginação** e **watermark**, tudo atrás de três callbacks de
  transporte (`deliver`, `pullPage`, `applyRemote`). Entregas que falham ficam
  na fila com `attempts`/`lastError` incrementados; `flush` colapsa gatilhos
  concorrentes e é pulado sozinho quando offline (`summary.skipped`). Expõe
  `enqueue`, `flush`, `pendingCount`, `listPending`, `clearOutbox`,
  `resetWatermark`. Formaliza o que a receita _Offline Sync_ montava à mão.
  Novos tipos: `OfflineSync`, `OfflineSyncConfig`, `OutboxEntry`, `OutboxOp`,
  `PullPage`, `SyncRunSummary`, `SyncTrigger`, `WatermarkStore`.

## [0.20.0] — 2026-07-15

### Adicionado

- **Hooks de câmera e luminância** (`tempest-react-sdk/vision`) — primitivas de
  browser para apps de visão pararem de reimplementar:
  - `useCameraStream(options?)` — adquire um `MediaStream` via `getUserMedia`
    (câmera traseira por padrão, `constraints` sobrescrevível), pluga num
    `<video ref={videoRef} />`, expõe `status`/`error` tipados (kinds
    `unsupported | permission-denied | no-camera | in-use | insecure | unknown`)
    e libera as tracks no unmount/`retry()`.
  - `computeImageLuminance(source, reusableCanvas?)` — luminância média BT.709
    (0..255) de `<img>`/`<video>`/`<canvas>`, com downsample para
    `LUMINANCE_SAMPLE_MAX_EDGE`; `isLuminanceAcceptable(luminance, threshold)`;
    `LowLuminanceError` (carrega `luminance` + `threshold`).
  - `useLiveLuminance(videoRef, options?)` — loop `requestAnimationFrame`
    (throttle `intervalMs`, pausável) que amostra a luminância de um `<video>`.
- **`useObjectUrl(blob)`** (entrada principal) — cria um object URL para um
  `Blob` e o revoga no unmount / quando o blob muda.

## [0.19.1] — 2026-07-14

### Corrigido

- **Input** — adornos interativos passados em `leftIcon`/`rightIcon` (um botão de salvar/limpar/revelar) não recebiam clique: o slot tinha `pointer-events: none` (pensado só para ícones decorativos), o que matava o clique no botão e ainda deixava o `<input>` por baixo capturá-lo. Agora os filhos dos slots têm `pointer-events: auto` — ícones decorativos seguem deixando o clique passar para o input, mas botões voltam a ser clicáveis.
- **Button** — o conteúdo (`leftIcon` + label + `rightIcon`) era renderizado em um `<span>` sem layout, ficando inline, sem `gap` e com o ícone desalinhado do texto (mais visível em botões `fullWidth`). O conteúdo agora vive em um `.content` `inline-flex` centralizado com `gap`.

## [0.19.0] — 2026-07-06

### `tempest doctor` — diagnósticos de problemas silenciosos

Relatório agrupado por seção (estilo `flutter doctor`) + checks novos pra problemas que **não geram erro de build** mas quebram em runtime ou custam horas:

- **Instância duplicada** de React / libs com contexto (`@tanstack/react-query`, `zustand`, `react-hook-form`, `react-router-dom`) — detecta cópia aninhada sob `tempest-react-sdk` (duas instâncias = hooks/context quebrados). Pulado quando o SDK é `file:`/`link:` local.
- **`@types/react` × `react`** com majors divergentes.
- **Peers opcionais de subpaths usados** — importa `/charts` sem `recharts`, `/editor` sem `@tiptap/react`, `/vision` sem `onnxruntime-web`, ou `TrajectoryMap tileUrl=` sem `leaflet`.
- **tsconfig**: `moduleResolution` fora de `bundler`/`node16`/`nodenext` (subpath exports não resolvem tipos), `jsx` ≠ `react-jsx`, `strict` off, `skipLibCheck` off.
- **SDK desatualizado** vs `latest` no npm (best-effort, timeout curto, pula offline).
- **Versões de toolchain**: TypeScript (≥5), Vite (≥5), `@vitejs/plugin-react` instalado, React major ≥18, `engines.node` satisfeito, aviso de Node **não-LTS** (major ímpar).
- **Deps declaradas mas não instaladas** (drift `package.json` × `node_modules`) + **`peerDependencies` do app** não satisfeitas.
- **Lockfile**: ausente, múltiplos (npm/yarn/pnpm misturados) ou **desatualizado** (`package.json` mais novo que o lock).
- **`styles.css` importado mais de uma vez**; com testes + `vitest`, aviso se `tsconfig.types` omite `vitest/globals`.
- **Env & secrets** (seção nova): `.env` no `.gitignore` (evita vazar segredo), variáveis `import.meta.env.*` sem prefixo `VITE_` (undefined no client).
- Seções (Environment/Project/Dependency health/TypeScript/Integration/Tooling/Env & secrets), linhas de versão e de info. Matchers de uso ancorados em imports/JSX reais (evita falso-positivo de strings em docs/exemplos).

Docs (CLI) bilíngues atualizadas.

### Pan/zoom, cor por região, busca de município e perf (`/br`)

- **Pan & zoom** (`zoomable`, opt-in) em `BrazilMap`/`BrazilStateMap`: roda-do-mouse (zoom no cursor) + arrastar (pan) + duplo-clique/botão **Reset**. Hook `useMapZoom`.
- **Cor por região** (`colorByRegion`) no `BrazilMap`: tinge cada UF pela macro-região (categórico). `REGION_COLORS` + `regionLegendItems()` (pra `<MapLegend items>`).
- **`MunicipalitySearch`**: autocomplete offline de município (debounced, `searchMunicipalities`), casável com o `selected` de um `BrazilStateMap`.
- **Perf**: listas de paths dos dois mapas agora são memoizadas — hover/tooltip não reconstrói mais todos os polígonos (relevante em estados com centenas de municípios).

Tests novos (zoom, região, busca). Docs bilíngues (Parte 7). Gallery: exemplo de região + busca+zoom no drill-down.

### Marcadores, escalas de cor e legenda nos mapas (`/br` + geo)

- **Marcadores (`markers`)** em `BrazilMap`, `BrazilStateMap` e `TrajectoryMap`: pontos `{ latitude, longitude, label?, color?, radius?, id? }` plotados sobre o mapa (incluídos no auto-fit), com `onMarkerClick(marker, index)`. Novo tipo `GeoMarker` (em `geo`) + componente `MapMarkers`.
- **Escalas de cor**: `sequentialScale`, `quantizeScale`, `thresholdScale` + `interpolatePalette` e paletas colorblind-safe (`SEQUENTIAL_BLUES/GREENS/VIRIDIS`, `DIVERGING_RDBU`). Nova prop `colorScale` em `BrazilMap`/`BrazilStateMap` (precede o ramp de 2 cores).
- **`MapLegend`**: legenda de gradiente contínuo (min/mid/max + `format`) ou faixas discretas (`items`).
- **Fix**: o choropleth não tingia de verdade — o `fill` via atributo era sobrescrito pela regra CSS `.state`. Passou a usar `style` inline (vence o CSS). Afetava `BrazilMap`/`BrazilStateMap` desde a introdução do choropleth.

Tests novos (escalas, legenda, marcadores). Docs bilíngues (Parte 6). Gallery: choropleth Viridis + legenda + marcadores de capitais.

### Geocoding offline + geodata reproduzível (subpath `/br`)

- **`scripts/gen-br-geodata.mjs`** — script reproduzível que baixa as fronteiras do IBGE (UF + municípios), simplifica (Douglas-Peucker ~2 km), divide por UF e **computa centroides**. Substitui o processo manual; roda via `npm run gen:geodata`. Cache em `scripts/.geodata-cache/` (git-ignored).
- **Centroides embutidos** em cada feature (UF e município) — `properties.centroid = [lon, lat]` (centroide ponderado por área).
- **Geocoding offline** (novo `geocode.ts`, índice de centroides ~97 KB gzip carregado lazy): `reverseGeocode(coord)` (point-in-polygon exato, carrega a geometria de um estado), `nearestMunicipality(coord)` (centroide mais próximo, rápido/aproximado), `geocodeMunicipality(name, uf?)`, `searchMunicipalities(query, {uf,limit})`, `municipalityCentroid(id)`, `stateCentroid(uf)`. Tipos `MunicipalityCentroid`, `NearestMunicipality`, `ReverseGeocodeResult`. Zero rede.
- Receita "onde estou?" (`usePositionTracker` + `reverseGeocode`) nas docs.

12 tests novos. Docs bilíngues (Parte 5). `size-limit` da entry `br` ajustado (inclui o índice de centroides lazy).

## [0.18.0] — 2026-07-06

### Tooltips de hover nos mapas do Brasil (`BrazilMap` + `BrazilStateMap`)

Passar o mouse sobre um estado ou município agora mostra uma **dica flutuante estilizada** com nome + metadados (antes só havia o `<title>` nativo com o nome cru).

- **`BrazilMap`** — tooltip com **nome, sigla, região e nº de cidades** (+ valor do choropleth quando `values` está setado). Ex.: `São Paulo (SP) · Sudeste · 645 cidades`.
- **`BrazilStateMap`** — tooltip com **nome do município + código IBGE** (+ valor do choropleth).
- Novas props em ambos: `showTooltip` (default `true`) liga/desliga; `renderTooltip((data) => ReactNode)` customiza o conteúdo. Tipos `BrazilMapTooltipData` (`{ uf, name, value? }`) e `BrazilStateMapTooltipData` (`{ id, name, value? }`).
- O `<title>` nativo foi removido (evita tooltip duplicado); a acessibilidade fica no `aria-label` de cada shape, e o tooltip visual é `aria-hidden` pra não duplicar no leitor de tela. Tooltip segue o cursor, não intercepta hover (`pointer-events: none`), e usa tokens `--tempest-*`.

6 tests novos (hover mostra/esconde, valor do choropleth, `showTooltip={false}`, tooltip municipal). Docs bilíngues atualizadas. Sem breaking changes.

## [0.17.0] — 2026-07-06

### Submapas de estado — `BrazilStateMap` (todos os municípios de uma UF)

Extende o subpath [`tempest-react-sdk/br`](#0160--2026-07-06) com o nível de **município**, ainda **sem API paga ou externa**.

- **`BrazilStateMap`** — submapa SVG de **um estado** com **todos os seus municípios** clicáveis. `uf` (obrigatório), `onSelect({ id, name })` (id = código IBGE de 7 dígitos), `selected` (casa por id ou nome, aceita lista), `values` (choropleth por município via id/nome), `showLabels` (off por padrão — denso). Reusa os helpers SVG/projeção compartilhados com o `BrazilMap`.
- **`loadStateMunicipalities(uf)`** — carrega lazy a geometria municipal de uma UF. O dataset municipal (GeoJSON IBGE simplificado, Douglas-Peucker ~2 km, ~2 MB no total) é **dividido por estado**: um chunk por UF (~40-70 KB gzip), com um import dinâmico explícito por UF — só o estado exibido é baixado, o país inteiro nunca cai num bundle só. Tipos `MunicipalityFeature`, `StateMunicipalities`, `Municipality`.
- **Receita drill-down**: `BrazilMap` (nacional) → clique num estado → `BrazilStateMap` (municípios). Demonstrada na galeria.
- Helpers SVG (`ringsOf`/`geometriesBounds`/`geometryPath`/`geometryCentroid`/`lerpColor`) extraídos pra `svg-utils`, compartilhados entre os dois mapas.

4 tests novos. Docs bilíngues atualizadas (`br.md`/`br.en.md`, Parte 4 + receita), seção da galeria com drill-down nacional→estado→município. Budget `size-limit` da entry `br` ajustado (mede a superfície opt-in completa, incluindo todos os chunks lazy). Sem breaking changes.

## [0.16.0] — 2026-07-06

### Mapa do Brasil + dados de localidade — novo subpath `tempest-react-sdk/br`

Mapa nacional clicável das 27 UFs + dataset de estados/cidades, **sem API paga ou externa**. Complementa o módulo [`geo`](#0150--2026-07-05). Espelha o `utils/locations` do `tempest-fastapi-sdk`.

- **`BrazilMap`** — mapa SVG das 27 unidades federativas a partir de um GeoJSON do IBGE **simplificado (Douglas-Peucker ~2 km) e empacotado** (~119 KB cru / ~36 KB gzip, chunk lazy — só carrega quando o mapa monta). Clicável (`onSelect(uf)`, estados focáveis por teclado), destacável (`selected` aceita UF ou lista), choropleth (`values` por UF → tinta linear `minColor`→`maxColor`), rótulos de sigla, `<title>`/`aria-label` acessíveis. Reusa a projeção Web Mercator do módulo `geo`.
- **`BrazilStateCitySelect`** — seletor encadeado Estado → Cidade (cidade reseta ao trocar o estado; habilita só após escolher UF).
- **Dados** (espelham `utils/locations`): `listStates`, `getState`, `citiesByUf`, `statesByRegion`, `ufChoices`, `cityChoices`, `isValidUf`, `normalizeUf`, `isValidCity` + `loadBrUfGeoJson` (acesso lazy à geometria). Tipos `UF`, `BrRegion`, `BrazilState`, `Choice`. Dataset de ~5600 cidades empacotado.
- **Subpath dedicado** `tempest-react-sdk/br` (padrão charts/vision/editor) — os dados/geometria **não** entram no bundle raiz; só quem importa `/br` paga.

19 tests novos. Docs bilíngues novas (`br.md` / `br.en.md`, padrão tutorial com receitas) em **Integrações**, seção nova na galeria (mapa clicável + choropleth + seletor). `leaflet` continua peer opcional (só pro `TrajectoryMap`). Budget `size-limit`: bundle raiz 54→58 KB (ESM) por conta do módulo `geo`; nova entry `br` (56 KB, empacota dados). Sem breaking changes.

## [0.15.0] — 2026-07-05

### Geolocalização — novo módulo `geo` (self-hosted, sem API paga/externa)

Coleta de latitude/longitude, cálculo de distância/trajetória e plot de mapa **100% no navegador**, sem nenhuma API paga ou externa. Espelha o módulo `geo` do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/) — tipos e matemática batem entre cliente e servidor.

- **Tipos + validadores** — `Coordinate`, `TrackPoint`, `TravelEstimate` (snake_case preservado pra desserializar direto de uma resposta), `TravelMode`, `GeoBounds`; `isValidLatitude`/`isValidLongitude`/`isCoordinate`/`clampLatitude`/`normalizeLongitude`.
- **Matemática offline** — `haversineKm`, `pathLengthKm`, `bearingDeg` (mesma `EARTH_RADIUS_KM` do backend); `estimateTravel` (heurística: grande-círculo × circuity 1.3, velocidade média por modo `car 1.0 · motorcycle 0.95 · bus 1.6`); `boundingBox`/`boundsCenter`/`expandBounds`.
- **Projeção Web Mercator** — `projectMercator`/`unprojectMercator`/`fitProjection` — núcleo do plot tile-free (mesma projeção dos tile servers, então SVG e tiles alinham).
- **Rastreamento ao vivo** — `createPositionTracker` (controller sobre `watchPosition`, filtra jitter, acumula distância) + `usePositionTracker` (hook com ciclo de vida amarrado ao componente).
- **`TrajectoryMap`** — plot **SVG tile-free por padrão** (projeção + auto-fit + polyline + marcadores início/atual + grid + barra de escala em km), **zero request externa**. Prop `tileUrl` (opt-in) sobe uma camada Leaflet real a partir de um tile server **seu** — `leaflet` é peer **opcional, lazy-loaded** (nunca entra no bundle sem `tileUrl`).
- **Rota real opt-in** — `createOSRMBackend` + interface `RoutingBackend`: aponta pro **seu** OSRM (único ponto que toca a rede; caller injeta a URL). Para zero-rede, `estimateTravel`.

52 tests novos. Docs bilíngues novas (`geo.md` / `geo.en.md`) em **Integrações**, seção nova na galeria (com fallback "simular caminhada" sem GPS). Complementa o hook de baixo nível `useGeolocation` (fix único / watch). `leaflet` adicionado como peer opcional. Sem breaking changes.

## [0.14.0] — 2026-06-28

### Ergonomia PWA (remove boilerplate dos apps consumidores)

Lote motivado pela migração do `famachapp-pwa`: cada item abaixo elimina código genérico que o app reimplementava na mão.

- **`InstallButton`** — botão de instalação ligado ao prompt PWA (`useBeforeInstallPrompt`). Renderiza **nada** quando o app não é instalável (prompt ainda não capturado, já instalado, ou rodando standalone) — pode soltar em qualquer lugar sem guardar visibilidade. Herda todas as props do `Button` (`variant`/`size`/`leftIcon`/…); `onResult` recebe a escolha do usuário.
- **`InstallBanner`** — banner inferior dispensável que convida a instalar o PWA. Aparece só quando há prompt capturado e o app não está standalone; em plataformas que nunca disparam `beforeinstallprompt` (ex.: iOS Safari) fica oculto. `storageKey` persiste a dispensa em `localStorage`. Props: `title`/`description`/`installLabel`/`dismissLabel`/`icon`/`onResult`.
- **`useBeforeInstallPrompt` → novo campo `isStandalone`** — detecta se o app já roda como PWA instalado (`display-mode: standalone`/`fullscreen`/`minimal-ui` ou `navigator.standalone` no iOS). Reage a mudanças de display-mode e a `appinstalled`. Use pra esconder afordâncias de instalação de quem já instalou.
- **`ThemeProvider` → `attribute` aceita `string | string[]`** — espelha o tema resolvido em mais de um atributo. Resolve o caso comum "componentes do SDK leem `data-tempest-theme`, mas o CSS do app usa outro atributo" (ex.: `["data-tempest-theme", "data-theme"]`) sem um effect de sync no consumidor.
- **`ThemeProvider` → nova prop `themeColor={{ light, dark }}`** — sincroniza `<meta name="theme-color">` com o tema resolvido (chrome do navegador / status bar do PWA). Antes, cada app fazia isso num hook próprio.
- **`Spinner` → `caption` + `overlay`** — `caption` renderiza um texto visível abaixo do spinner; `overlay` centraliza num container de área cheia (fallback de Suspense/rota). O caminho "bare" (`<Spinner />` sem caption/overlay) permanece idêntico — back-compat total.

12 tests novos. Docs bilíngues atualizadas (Tema, Feedback, Ações, Hooks). Sem breaking changes.

## [0.13.0] — 2026-06-28

### Correções

- **`styles.css` agora inclui os design tokens.** Bug presente desde a v0.1.0: o `dist/styles.css` publicado continha só os CSS Modules dos componentes, **sem** os tokens `--tempest-*` (`colors/typography/motion/density/reset/responsive/print`) — porque nada no grafo JS importava `src/styles/index.css`, então o Vite o descartava do bundle. Consumidores que faziam `import "tempest-react-sdk/styles.css"` recebiam componentes referenciando variáveis indefinidas (sem cor/tema). Corrigido importando os tokens no barrel raiz; o `styles.css` agora sai temático de um único import, como a doc sempre prometeu. (`styles.css` ~13 → ~19 KB gzip — agora carrega os tokens.)

### Componente novo

- **`AppBar`** — app bar mobile-first de PWA: slot **leading** (botão voltar acessível + `brand`) · **título** (`<h1>`) · **actions** à direita. Sticky + `env(safe-area-inset-top)` por padrão. Sem `onBack`, cai em `window.history.back()`; com router, `onBack={() => navigate(-1)}`. Tons `surface`/`primary`/`transparent`, `centered` (título centralizado estilo iOS), `leading` substitui o lado esquerdo inteiro. Resolve o padrão "voltar + título + ação" que cada PWA reimplementava na mão (ex.: `famachapp-pwa`). Complementa o `Navbar` (3 slots, desktop). Tokens `--tempest-*` cobrem cor/altura/tipografia. 9 tests, docs bilíngues em **Navegação**, vitrine na galeria.

## [0.12.0] — 2026-06-28

### Vision — subpath `tempest-react-sdk/vision` (ONNX Runtime Web)

- Novo subpath **`tempest-react-sdk/vision`**: inferência de visão computacional on-device no navegador — **`Classifier`**, **`Detector`**, **`Segmenter`** (+ `results`, `labels`/`COCO_CLASSES`/`resolveLabels`, `preprocess`, `postprocess` YOLO/YOLOv8, `OrtSession`).
- **Vendorizado** de `@mauriciobenjamin700/ort-vision-sdk-web@0.2.1` (MIT, mesmo autor) — o conteúdo é copiado pra dentro do SDK, **sem depender do pacote npm**. `onnxruntime-web` é **peer opcional, externalizado** (instale + sirva os `.wasm` só se usar visão).
- Mesma API do `ort-vision-sdk` Python. Tests (funções puras: `softmax`/`topK`/`resolveLabels`). Docs bilíngues novas; entry de `size-limit` (~8 KB sem onnxruntime-web).

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
