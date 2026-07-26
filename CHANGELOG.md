# Changelog

Todas as mudanças notáveis seguirão [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
