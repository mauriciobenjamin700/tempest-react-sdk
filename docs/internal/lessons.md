# Lições medidas

Cada item é um defeito real que já custou tempo aqui, com o número e o método ao
lado. Leia antes de confiar numa medição, num gate ou numa afirmação da doc.

## Medição

- **Medir o ganho de um empacotamento não é medir o contrato dele.** O #320 mediu
  bytes em quatro bundlers e computed styles de 37 seletores — e não mediu se o
  pacote **ainda importava**. Cada `*.module.js` passou a importar uma folha, e
  `.css` não é formato que o Node carregue: o smoke do release morria em
  `ERR_UNKNOWN_FILE_EXTENSION` (126 módulos ESM e 126 CJS). Ao mudar o que o build
  **emite**, a pergunta do gate não é "ficou menor?", é "quem ainda consegue
  carregar isto?".
- **`sideEffects` só existe se a resolução passar por `node_modules`.** Os checks
  de `size-limit` importam `./dist/...` por caminho, então o esbuild nunca lê
  aquele campo: `{ cn }` mediu 25,19 kB ali e **436 B** num app instalado.
  Quando um número salta de forma implausível, reproduza num app instalado antes
  de mexer no limite.
- **Número escrito em prosa não tem guard — até alguém escrever um.** Auditadas
  depois da 0.64.0, as páginas afirmavam **três** contagens diferentes de
  componentes (104 em `theme`, ~150 em `styles`, 131 no snapshot) para um repo com
  **129**, e o README publicava doze números de bundle de uma release antiga, com
  o teto do barrel errado em mais de 20 kB. Nada podia contradizê-los: os guards
  de doc aferem estrutura (mirror, nav, âncora, exemplo que compila), e nenhum lê
  uma frase. `test/docs-counts.test.ts` fecha isso — cada contagem é medida no
  repo e comparada com as frases que a afirmam.

- **Scraping por regex é uma medição que só parece uma medição.** A primeira
  versão daquele guard contava as chaves do `aliases.ts` com
  `/"[a-z0-9-]+":/` e devolvia **229**; o registry tem **258**, que é o que
  `npm run gen:icons` imprime e o que o cabeçalho do próprio arquivo gerado diz.
  Eu quase publiquei 229 no README como "correção" de um 257 que estava errado
  por um. O guard passou a **importar** `iconNames` e `iconAliases` em vez de
  raspar o texto: quando existe a fonte, contar o arquivo é adivinhar com mais
  passos.

- **Contagem publicada precisa do método junto.** "543 exports" não reproduz:
  contar `export` no `.d.ts` dá ~1250. Só `Object.keys(await import(dist))` bate.
- **Taxa medida por amostragem vai com o N declarado**, e num N onde ela é
  estável. Contagem exata só para o que é determinístico.
- **Medição de contraste tem de desligar `transition`.** Trocar o tema e ler
  `getComputedStyle` logo depois amostra a animação: o mesmo ícone do
  `VideoPlayer` deu 7,32 e depois 2,33 — e 2,33 parece exatamente um defeito real.
- **Vite guarda o CSS do SDK em `node_modules/.vite`, e `vite preview` guarda o
  `index.html`.** Ao validar CSS na gallery, limpe
  `examples/gallery/{node_modules/.vite,dist}`, rebuilde, **reinicie o preview** e
  confira o nome do `assets/index-*.css` que a página carregou.

## Browser: o que a API promete ≠ o que ela emite

- **`requestVideoFrameCallback` não dispara em seek pausado** — só durante
  reprodução (Chromium, 04/09/2026). Antes de esperar um sinal do browser, meça
  se aquele estado o emite.
- **`canvas.captureStream(fps)` não sintetiza frames**; emite quando o canvas
  muda. Um asset que pintava uma cor por segundo produziu vídeo de ~1 fps, e a
  falha parecia bug do código sob teste.
- **`MediaRecorder` nem sempre omite a duração**: o Chromium escreve duração para
  gravação finalizada num único `stop()` (3.000197 s para 3 s de canvas).
  Afirmação sobre bug de browser envelhece — escreva o navegador, a data e o
  valor medido ao lado dela.
- **Toque não dispara `contextmenu`.** Medido em Chrome com emulação (Pixel 7 e
  iPhone 13): um hold de 900 ms produz `pointerdown`, `touchstart`, `pointerup`,
  `touchend`, `click` — e nenhum `contextmenu`.
- **`getBoundingClientRect` reporta a caixa transformada.** Um menu que entra com
  `scale(0.96)` mede 4% menor, e um clamp baseado nele deixa o menu crescido
  transbordar. Para geometria de layout, use `offsetWidth`/`offsetHeight`.
- **`Portal` monta num efeito**, renderizando `null` no primeiro passe: um
  `useLayoutEffect` disparado pela abertura lê um ref vazio. O nó entra por
  **callback ref em estado**.
- **Foco programático casa com `:focus-visible`** no Chrome mesmo vindo de toque.

## Quando a doc é o bug

- **Uma frase da doc pode ser o bug — e a correção dela também.** A doc do `http/`
  afirmava que o Vite substitui `process.env.NODE_ENV`; a #301 trocou por "não
  substitui"; medido em 07/09/2026 num app de sondagem (tarball e link `file:`,
  lendo o módulo que o dev server serviu), **o Vite substitui** — 5.4.21, 6.4.3,
  7.3.6 e 8.2.2. A crença errada sobreviveu porque a expressão não é substituída
  no **console do browser**, que é onde é natural ir conferir. Quando a doc
  explica *por que* um mecanismo funciona, essa explicação é afirmação testável.
- **Aviso na doc é falta de superfície.** Regra que a doc manda o consumidor
  implementar é regra que a lib deveria implementar: cada app a implementa um
  pouco diferente e ninguém descobre até o incidente. Foi assim que nasceu o
  `/node-css-loader`.
- **Merge de duas branches que editam a mesma seção engole delimitador.** Juntar
  duas seções em `docs/styles.md` comeu a fence de uma admonition e todo heading
  virou código; o `mkdocs --strict` passou verde. Ao resolver conflito em
  markdown, confira delimitador (``` , `!!!`, tabela) na junção, não só o texto.

## Dados e geometria

- **Dataset unido por nome sempre drifta; una por id estável.** Os arquivos de
  `br/` vinham de duas safras do IBGE comparadas por nome: 44 renomeações depois,
  o seletor oferecia município que o geocoder não achava — sem erro, só resposta
  vazia. O nome é rótulo, não chave.
- **Malha simplificada demais mente sobre conter um ponto.** `qualidade=minima`
  desenha o Rio com 35 vértices e o Centro cai **fora**. Tolerância fixa apaga
  município pequeno inteiro — limite-a a uma fração da diagonal do próprio anel.
- **Lacuna de dado se declara, não se absorve.** O gerador falha quando aparece
  caso não declarado, e o pacote expõe a lista (`pendingGeometryIds()`).

## Código gerado e dependência externa

- **Edit à mão em árvore vendorizada tem data de validade.** O `_topK` do
  `src/vision/` ganhou memoização (65× medido) dentro do arquivo que diz "do not
  hand-edit"; o primeiro `npm run vendor:vision` apagou tudo, e o único aviso foi
  um teste do repo falhando. Melhoria em código vendorizado sobe para o upstream
  e volta pelo vendor.
- **Bump de `lucide-react` renomeia ícone, e o canônico de ontem vira alias.** Na
  1.41, `trash-2` virou alias de `trash`. Ao escolher slug para exemplo de teste,
  prefira um que o mapa de aliases não menciona. Regenerar o registry é parte do
  bump, não follow-up.

## Guards que já salvaram

- `test/docs-anchors.test.ts` pegou heading virando código depois de um merge.
- O guard de exemplos de doc reprovou um exemplo com `deleted: true` e revelou
  que `ChatMessage.body` não podia ser obrigatório.
- A varredura de `noUncheckedIndexedAccess` achou paleta vazia em
  `quantizeScale`/`thresholdScale`.
- O smoke do release barrou a 0.63.0 quando o pacote deixou de importar em Node.

## Precedência e wrappers

**Precedência de opção morre no wrapper.** A correção da #302 quase nasceu
inerte: a regra respeitava `validation` como override, e o `useDescribeApiError`
**sempre** passa `validation` — o ramo nunca rodaria em componente nenhum. Ao
adicionar condição sobre uma opção, confira o que os wrappers do próprio SDK
passam por default, não só o que a função pura aceita.
