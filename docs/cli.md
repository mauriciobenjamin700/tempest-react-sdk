# CLI `tempest`

Além da CLI de scaffolding [`create-tempest-app`](./scaffold.md), o pacote
`tempest-react-sdk` instala um segundo `bin` — **`tempest`** — pra cuidar da
saúde e da higiene do seu projeto no dia a dia: um **doctor** (no estilo do
`flutter doctor`) e um **fix/lint/format** que organiza imports, remove imports
mortos e arruma espaçamento.

Como ele vem dentro do SDK, está disponível assim que você instala a lib — rode
com `npx tempest <comando>` ou pelos scripts `npm run doctor` / `npm run fix`
que o scaffold já cria.

## `tempest doctor`

Faz um diagnóstico do projeto atual e imprime um relatório `[✓] / [!] / [✗]`
**agrupado por seção** (estilo `flutter doctor`) — inclusive **problemas
silenciosos** que não quebram o build mas explodem em runtime ou drenam horas de
depuração:

```bash
npx tempest doctor
```

```text
tempest doctor (/caminho/do/seu/app)

Environment
  [✓] Node 22.13.0
  [i] tempest CLI v0.18.0

Project
  [✓] package.json found
  [✓] tempest-react-sdk in dependencies — ^0.18.0
  [✓] tempest-react-sdk installed — v0.18.0
  [✓] react + react-dom present — v19.2.0

Dependency health
  [!] duplicate instance: react — nested copy under tempest-react-sdk;
      rode `npm dedupe`; duas instâncias quebram hooks/context
  [✓] @types/react matches react — v19
  [!] recharts missing (used by charts) — você importa charts mas recharts não
      está instalado — npm i recharts
  [✓] tempest-react-sdk up to date — v0.18.0

TypeScript
  [✓] tsconfig "@/*" alias
  [!] moduleResolution: node — use "bundler" (senão os subpaths
      tempest-react-sdk/br, /charts… não resolvem tipos)
  [✓] jsx: "react-jsx"
  [!] strict mode off — enable "strict": true

Integration
  [✓] vite.config.ts uses createViteConfig
  [✓] src/main.tsx imports styles.css

Stylesheets
  [i] 34 stylesheet(s) · 210 rules · 806 declarations
  [✗] src/pages/Dashboard.module.css:12 — a `;` está faltando: o valor de
      `padding` engole as declarações abaixo, e o browser derruba todas
  [!] src/components/Card.module.css:8 — `bacground-color` não é propriedade
      CSS — você quis dizer `background-color`?
  [i] src/components/Row.module.css:4 — 7 rules em 6 arquivo(s) declaram as
      mesmas 3 propriedades — uma classe global bate 7 cópias locais
  [i] 2 finding(s) are auto-fixable — rode `tempest fix`

Design
  [i] 42 source file(s) · 1830 lines of code · median 38 — largest:
      src/pages/Orders.tsx (204)
  [!] src/pages/Orders.tsx:1 — 204 lines of code (limit 150) — extract a
      sub-component, a hook or a pure function
  [!] src/pages/Orders.tsx:31 — a component must not call the network — move it
      to a service and read it with useQuery
  [i] 2 limit(s) waived with a written reason — @tempest-limits markers

Tooling
  [✓] ESLint config present
  [✓] eslint installed
  [✓] prettier installed

! 3 warning(s) — usable, but worth fixing.
```

!!! info "O que conta como uso, e o que não conta"
    As checagens que perguntam "esse projeto usa X?" leem o **código**, não a prosa:
    comentários saem antes da busca, então um `@example` mostrando
    `import "tempest-react-sdk/styles.css"` não vira um segundo import, e um docstring
    com `<TrajectoryMap tileUrl=…>` não passa a exigir o `leaflet`. Arquivos de teste
    também ficam de fora — um teste que renderiza um componente justamente para provar
    como ele degrada **sem** o peer opcional não é o projeto pedindo aquele peer.

    Peer marcada como `optional` em `peerDependenciesMeta` nunca é reportada como não
    satisfeita: é exatamente o que "opcional" quer dizer.

!!! success "Funciona em projeto que ainda não usa o SDK"
    Se o `tempest-react-sdk` não está nas suas dependências, o `doctor` roda em
    **modo genérico**: audita a saúde de um app React + Vite qualquer e **não** reprova
    você por não ter adotado nada.

    As checagens que são convenção do SDK saem do relatório — alias `@/*`,
    `createViteConfig`, o import do `styles.css`, o `src/main.tsx` esperado, os peers
    opcionais dos subpaths. O que continua é o que vale pra qualquer app: versão do
    Node, instância duplicada de React, dependência declarada e não instalada, peer não
    satisfeita, `@types/react` desalinhado, `strict`/`jsx`/`moduleResolution`, lockfile
    (presente, único, não desatualizado), ESLint e Prettier, `.env` no `.gitignore` e
    variável de cliente sem prefixo `VITE_`.

    ```console
    $ npx tempest doctor
    …
      [i] tempest-react-sdk not installed — checking generic React/Vite health only
    …
    Adopting the SDK (optional)
      [i] install — npm i tempest-react-sdk
      [i] import the stylesheet once, in your entry — import "tempest-react-sdk/styles.css"
      [i] not all-or-nothing — one component at a time works
    ```

    Antes disso o comando dava **duas falhas e exit 1** por um único fato — "você não
    instalou isto ainda" — e enterrava os achados acionáveis no meio de avisos que eram
    só a opinião do SDK. Ou seja: era inútil exatamente no projeto onde deveria ajudar
    mais.

!!! tip "Use no onboarding e na CI"
    Rode `tempest doctor` ao clonar um projeto (confirma que tudo está no lugar)
    e como passo rápido na CI. Ele sai com código **1** se houver qualquer `✗`
    (problema bloqueante); avisos `!` não falham o comando.

### O que ele verifica

**Environment** — Node ≥ 22.12 (e aviso se for uma linha **não-LTS**, major ímpar); versão da CLI; versões do **TypeScript** (≥5) e **Vite** (≥5); `engines.node` do `package.json` satisfeito.

**Project** — `tempest-react-sdk` declarado e instalado (com versão); `react`/`react-dom` presentes; **React major** ≥ 18.

**Dependency health** (os silenciosos):

- **Instância duplicada** de React ou de libs com estado/contexto (`@tanstack/react-query`, `zustand`, `react-hook-form`, `react-router`): uma cópia **aninhada** dentro do `tempest-react-sdk` significa **duas instâncias** no runtime — hooks inválidos, `QueryClient`/contexto de RHF que "somem". Sugere `npm dedupe`. _(Pulado quando o SDK é `file:`/`link:` local.)_
- **Deps declaradas mas não instaladas** (drift entre `package.json` e `node_modules`) → `npm install`.
- **`peerDependencies` do próprio app** não satisfeitas.
- **`@types/react` × `react`** com majors diferentes → erros de tipo fantasma.
- **Peers opcionais de subpaths usados**: se você importa `tempest-react-sdk/charts` sem `recharts`, `/editor` sem `@tiptap/react`, `/vision` sem `onnxruntime-web`, ou passa `tileUrl` no `TrajectoryMap` sem `leaflet` — tudo compila, mas quebra no import lazy em runtime.
- **SDK desatualizado** vs o `latest` no npm (best-effort, com timeout curto; pulado offline).
- **`lucide-react` em cópia dupla** — checagem separada da de cima, porque duas cópias de lucide não quebram hooks como um segundo React: elas duplicam bytes e, o que é pior, deixam as **tabelas de slug geradas** do `/icons` apontando pra exports que a cópia mais antiga não tem. Avisa quando o seu `package.json` declara lucide numa faixa diferente da do SDK (é a causa), quando existe cópia aninhada sob `tempest-react-sdk` (é a prova), e **reprova** quando a versão instalada é mais antiga do que as tabelas exigem — esse caso quebra o build com `… is not exported by lucide-react` apontando pra dentro do SDK. Ver [Ícones por slug](./icons.md).

**TypeScript** — alias `@/*`; **`moduleResolution`** ∈ `bundler`/`node16`/`nodenext` (senão os _subpath exports_ como `tempest-react-sdk/br` não resolvem tipos — silencioso!); **`jsx: "react-jsx"`**; **`strict: true`**; **`skipLibCheck`** ligado; com testes + `vitest`, avisa se o `types` do tsconfig omite `vitest/globals`.

**Integration** — `vite.config.*` usando `createViteConfig`; **`@vitejs/plugin-react`** instalado (JSX/Fast Refresh); import do `styles.css` no entry (e aviso se importado **mais de uma vez**).

**Stylesheets** — análise de **sintaxe e semântica** de todo `.css` do projeto (CSS Modules incluídos): CSS que o browser derruba, declaração morta, nome que não existe, e bloco repetido que pede uma classe global. É a seção detalhada na próxima seção deste guia — [Análise de CSS](#analise-de-css). Aqui o `doctor` mostra no máximo **6 achados por severidade** e diz quantos ficaram de fora; a lista completa sai no `tempest fix --dry-run`.

**Design** — os limites e anti-padrões de [Design de Software](./design/limits.md) medidos no seu código: arquivo/função/hook acima do limite, `<X>Props` com props demais, `any` e `@ts-ignore`, `fetch` dentro de um `.tsx`, `catch` vazio e cor literal em `style={{ … }}`. Mostra **6 achados por severidade** e a mediana de linhas do projeto. Todo achado é `warn` — limite é heurística com saída de emergência escrita (`@tempest-limits <regra> — <motivo>`), então a seção **nunca** derruba o exit code. Pule com `--no-design`.

**Tooling** — config + binários de ESLint e Prettier; **lockfile** presente, único (npm/yarn/pnpm misturados dessincronizam) e **não desatualizado** (`package.json` mais novo que o lock → `npm install`).

**Env & secrets** — **`.env` no `.gitignore`** (senão segredos vazam no commit); variáveis usadas via `import.meta.env.*` **sem prefixo `VITE_`** (o Vite não expõe pro browser → `undefined` em runtime); `.env` vs `.env.example`.

## Análise de CSS

O ESLint não lê `.css` e o Prettier só reformata: entre os dois, **CSS quebrado
passa batido**. O `tempest` analisa cada folha do projeto — inclusive CSS Modules
— em duas frentes, e o resultado alimenta os dois comandos: o `doctor` mostra o
resumo, o `fix` remove a parte que é comprovadamente morta.

```bash
npx tempest doctor                 # resumo, na seção Stylesheets
npx tempest fix --dry-run          # lista completa, sem escrever nada
npx tempest fix                    # remove o que é morto de verdade
npx tempest fix src/components     # só um caminho
npx tempest fix --no-css           # pula a passada de CSS
```

### Sintaxe — o que o browser derruba

Erros (`✗`) são coisas que o browser **descarta em silêncio**. Nenhuma delas
quebra o build do Vite, e é justamente isso que as torna caras:

| Achado | Exemplo |
| -- | -- |
| `;` faltando entre declarações | `padding: 8px⏎margin: 0;` → **as duas** morrem |
| declaração sem `:` | `color red;` |
| valor vazio | `color: ;` |
| bloco nunca fechado / `}` sobrando | `.a { color: red;` |
| comentário, string ou `(` sem fechar | `/* pra sempre`, `content: "ops` |
| declaração fora de qualquer regra | `color: red;` no topo do arquivo |
| `{` sem seletor antes | `{ color: red; }` |

!!! danger "O `;` que falta é o pior deles"
    `padding: 8px` seguido de `margin: 0;` sem ponto e vírgula no meio é **uma**
    declaração sintaticamente válida com valor `8px margin: 0` — o browser
    derruba as duas, sem aviso no console, e o layout fica errado num lugar que
    você não escreveu. É o achado que paga a análise inteira.

### Semântica — CSS válido que está errado

Avisos (`!`) são folhas que o browser aceita e que ainda assim não fazem o que o
autor quis:

- **Declaração duplicada** — `color` duas vezes com o **mesmo** valor: a primeira
  é morta. Auto-fixável.
- **Declaração sobrescrita** — `color` duas vezes com valores **diferentes** na
  mesma regra: uma das duas é um engano. Não é fixável — escolher qual valor você
  quis é palpite dentro do design de alguém.
- **Seletor declarado duas vezes** — no mesmo contexto de `@media`; diz quais
  propriedades a segunda regra mata e pede o merge. Quando as duas regras são
  idênticas declaração por declaração, é auto-fixável.
- **Propriedade que não existe** — `bacground-color`, `dispaly`, `paddign`. Só
  reporta quando existe uma propriedade real a **até 2 edições** de distância,
  então uma propriedade nova que a tabela não conhece nunca é acusada.
- **`@at-rule` inexistente** — `@medai`, `@suports`: o browser pula o bloco todo.
- **Token `--tempest-*` que não existe** — comparado com a tabela lida do
  `styles.css` **instalado**, nunca com uma cópia chumbada na CLI.
- **`var(--x)` que ninguém define** e não tem fallback — resolve pra nada.
- **Regra vazia** — código morto. Em `.module.css` é reportada e **nunca**
  removida: pode ser a classe-marcador que o seu JS referencia via `styles.x`.

- **Token de uma família que existe, mesmo com fallback** — `var(--tempest-primary-contrast, #fff)`
  quando `--tempest-primary-*` tem doze irmãos declarados. É a única exceção à
  regra do fallback, e a admonition abaixo explica por quê.

!!! info "Um `var()` com fallback quase nunca é reportado"
    `var(--tempest-card-padding, var(--tempest-space-5))` é o **idioma de knob**
    do SDK: o nome não é um token, é um gancho que o app pode sobrescrever. Como
    o fallback garante que renderiza, a checagem fica calada. Sem fallback o
    mesmo `var()` resolve pra nada — aí é defeito e é reportado.

    Foi essa regra que derrubou 43 falsos positivos quando a análise rodou no CSS
    do próprio SDK — e deixou de pé **4 bugs reais** (`--tempest-duration-normal`,
    `--tempest-primary-solid`, `--tempest-primary-on`, `--tempest-danger-on` sem
    fallback), corrigidos no mesmo commit que trouxe a análise.

!!! danger "O preço dela era um ponto cego: erro de digitação parece knob"
    Os dois são `var(nome-que-não-existe, fallback)`. O `Scheduler` pintava evento
    com `color: var(--tempest-primary-contrast, #fff)` — esse token **nunca
    existiu**, o `var()` caía no `#fff`, e no tema escuro isso é branco sobre um
    `--tempest-primary` mais claro: **3,67:1**, abaixo do piso de 4,5. Compila,
    roda, e pinta errado para sempre.

    O sinal que separa os dois é **a família já existir**.
    `--tempest-primary-contrast` não é declarado, mas `--tempest-primary-*` tem
    doze irmãos que são: o nome se lê como membro faltando de uma família real.
    `--tempest-card-padding` não tem irmão `--tempest-card-*` nenhum: se lê como o
    que é, um gancho que o componente inventou.

    ```console
    $ tempest fix --dry-run
    [!] src/components/Timeline/Timeline.module.css:41
        `--tempest-primary-solid` is not a token, but `--tempest-primary-*` is a real
        family — the fallback hides the misspelling instead of failing.
        Did you mean `--tempest-primary-soft`?
    ```

!!! check "Medido antes de embarcar, como toda checagem nova de CSS"
    Rodada no `src/` do próprio SDK: **5 achados, 5 defeitos reais, nenhum falso
    positivo**, com 36 knobs legítimos no mesmo repositório calados.

    Dois sinais mais frouxos foram medidos e **descartados**:

    | Sinal | Achados | Reais | Precisão |
    | --- | --- | --- | --- |
    | Família declarada (embarcado) | 5 | 5 | **100%** |
    | Último segmento casa com um token (`--tempest-font-size-sm` ~ `--tempest-text-sm`) | 16 | 3 | 19% |
    | Família sem piso de segmentos | 9 | 5 | 56% |

    O segundo dispara em todo knob de layout do `utilities.css`, que termina em
    `-gap` ou `-width`. O terceiro trata `--tempest-tx` como membro da família
    `--tempest`, que casa com **todo** token que existe — por isso a família
    precisa de pelo menos um segmento depois do prefixo.

    O que a regra embarcada **não** pega é o prefixo errado inteiro:
    `--tempest-font-size-sm` deveria ser `--tempest-text-sm`, mas
    `--tempest-font-size-*` não é família de ninguém, então não há o que casar.
    Nenhum sinal barato separa isso de um knob — e é por isso que a alternativa
    que pegaria os dois tem 19% de precisão.

### Sugestão (`i`) — quando o global bate o local repetido

É a checagem que o CSS Modules **não pode** fazer por você: o escopo garante que
`.card` de um módulo nunca colide com `.card` de outro, e o preço é que nada te
conta que os dois são idênticos. A duplicação é invisível por design.

```text
[i] src/br/MapLegend.module.css:32 — 39 rules em 31 arquivo(s) re-implementam
    `.tempest-stack` do utilities.css — importe "tempest-react-sdk/utilities.css"
    uma vez e use a classe
[i] src/components/Row.module.css:4 — 7 rules em 6 arquivo(s) declaram as mesmas
    4 propriedades (display: flex; align-items: center; gap: 8px; …+1) — uma
    classe global bate 7 cópias locais
```

Duas formas do mesmo achado:

- **`global-candidate`** — bloco com **≥ 3 declarações** repetido em **≥ 3
  regras** e **≥ 2 arquivos** (dentro de um único arquivo, exige a 4ª cópia).
  Agrupa por declaração, não por nome de classe: `.row`, `.line` e `.bar` com o
  mesmo corpo contam como três cópias.
- **`utility-candidate`** — quando o bloco repetido é um idioma que o
  [`utilities.css`](./styles.md) já entrega: `.tempest-row`, `.tempest-stack`,
  `.tempest-center`, `.tempest-cluster`, `.tempest-spread`, `.tempest-truncate`,
  `.tempest-grid-auto`, `.tempest-card`. O casamento ignora o valor do `gap`, e
  distingue vizinhos (uma coluna é `stack`, não `row`).

Além disso, `hardcoded-token-value` aponta valor literal que é **exatamente** o
de um token (`gap: 8px` → `var(--tempest-space-2)`) — e só quando **um único**
token tem aquele valor, porque `4px` é o valor de vários e mandar você usar
`--tempest-space-1` onde você quis uma borda é um palpite dito com confiança.

!!! tip "Sugestão nunca reprova o comando"
    `i` é conselho: pode não valer a pena, e transformar cinco blocos iguais em
    uma classe global é uma decisão de **acoplamento entre telas** que a CLI não
    tem competência pra tomar. Ela mostra o número e sai da frente.

### O que o `fix` remove — e o que ele nunca toca

A passada de CSS remove **três** coisas, todas comprovadamente mortas:

1. declaração repetida com valor idêntico na mesma regra;
2. regra que repete uma anterior declaração por declaração;
3. regra vazia em folha comum (**não** em `.module.css`).

```console
$ npx tempest fix
→ css (dedupe declarations · drop dead rules)
  src/components/Card.module.css 2
    12: removed duplicate `color` — line 14 declares the same value
    31: removed `.title` — line 40 repeats it exactly
  ✓ removed 2 dead declaration(s)/rule(s) in 1 file(s)
```

!!! warning "Sempre a cópia **anterior**, nunca a de baixo"
    CSS é last-wins: remover a declaração de baixo mudaria o resultado sempre que
    algo entre as duas mexer na mesma propriedade. Remover a de cima não muda
    nada do que o browser computa — é o que faz a operação segura.

!!! note "Folha com erro de sintaxe não é escrita"
    Offset tirado de uma folha pela qual o parser teve que adivinhar caminho não
    é offset pra fazer splice. O `fix` reporta o erro, deixa o arquivo intacto e
    sai com código **1**: conserte a sintaxe e rode de novo.

    O `fix` também **não** reescreve valor pra token, não faz merge de seletor
    duplicado e não converte bloco repetido em classe global. Tudo isso é edição
    de design, não limpeza.

### `--extract-css`: mover o bloco repetido pra classe global

O `fix` normal **reporta** bloco repetido e não mexe. Com a flag, ele executa: o
bloco vai pra folha global do projeto, as regras locais somem e **os `styles.x`
no TSX passam a apontar pra classe nova**.

```bash
npx tempest fix --extract-css --dry-run          # revisa o plano, não escreve
npx tempest fix --extract-css                    # aplica
npx tempest fix --extract-css --css-target src/styles/globals.css
npx tempest fix --extract-css --css-prefix shared-
```

```console
$ npx tempest fix --extract-css
→ css extract (bloco repetido → classe global)
  src/components/Card.module.css 1
    removida `.row` (linha 1) → `.u-row` em src/index.css
  src/components/Card.tsx 1
    `styles.row` → `"u-row"` (linha 5)
  src/components/List.module.css 1
    removida `.line` (linha 1) → `.u-row` em src/index.css
  src/components/List.tsx 1
    `styles.line` → `"u-row"` (linha 5)
  ✓ movidas 2 regra(s) local(is) para 1 classe(s) em src/index.css
```

O que ele reescreve no TSX:

```tsx
// antes                                    // depois
<div className={styles.row} />              <div className="u-row" />
<li className={cn(styles.line, on && x)} /> <li className={cn("u-row", on && x)} />
<div className={styles["bar"]} />           <div className="u-row" />
```

!!! danger "É opt-in porque é decisão de design, não limpeza"
    As outras passadas removem o que está **comprovadamente morto**. Esta decide
    que N telas passam a compartilhar uma classe — e portanto **mudam juntas**. É
    uma decisão de acoplamento entre telas; a CLI executa, não escolhe. Por isso
    nunca roda sem a flag, e por isso o `--dry-run` existe.

!!! check "Ela recusa tudo que não consegue provar seguro — e diz o motivo"
    Nenhuma recusa é silenciosa. Uma ocorrência só é movida quando **todas** valem:

    | Condição | Por que |
    | -- | -- |
    | seletor é uma classe sozinha (`.row`), fora de `@media` | mover pra fora de um `@media` mudaria **quando** a regra vale |
    | nenhuma outra regra da folha menciona a classe | um `.row:hover` ou `.row .child` ficaria sem sujeito |
    | o módulo continua com pelo menos outra regra | senão o import vira código morto, o ESLint remove, e as regras que sobraram **param de carregar** |
    | a classe é lida só como `styles.row` / `styles["row"]` | `styles[key]` ou `Object.keys(styles)` tornam o módulo **opaco**: nada nele é extraído |
    | a folha global existe **e** alguém a importa | escrever numa folha que ninguém carrega é no-op silencioso |
    | o nome novo não colide na folha global | use `--css-prefix` |

    ```console
    [!] src/components/Card.module.css:1 não extraído — outra regra na mesma folha
        usa `.row` (linha 12) e ficaria sem sujeito
    ```

!!! info "As chamadas são achadas pelo compilador do **seu** projeto"
    A varredura usa o `typescript` instalado no projeto, não regex: `styles.row`
    dentro de comentário, template literal ou string não é uso, e regex não sabe
    diferenciar. Sem `typescript` instalado, a passada avisa e não escreve nada.
    O alias do `tsconfig` é respeitado, então `@/components/Card.module.css`
    resolve igual.

!!! tip "O nome da classe nova"
    É o nome local que o seu código mais usa (por módulo, e depois por número de
    chamadas), com o prefixo `u-`. Empate é o caso normal — as cópias moram em
    módulos diferentes justamente porque ninguém combinou um nome —, e aí a ordem
    das ocorrências decide, o que mantém o resultado igual entre execuções. O nome
    escolhido aparece **antes** de qualquer escrita, no `--dry-run`.

!!! info "O que a análise deixa de fora, de propósito"
    Folha **minificada** (`*.min.css` ou densidade alta de bytes por linha),
    arquivo acima de **512 KB**, e as pastas `node_modules/`, `dist/`, `build/`,
    `coverage/`, `public/`, `vendor/`. Acima de **600 folhas** o `doctor` avisa
    que bateu o teto em vez de truncar em silêncio. A varredura roda em ~0,3 s
    nas 200+ folhas do próprio SDK.

## `tempest fix`

Arruma o código de uma vez: **converte import relativo pra `@/`**, **remove CSS
morto**, **organiza imports**, **remove imports não usados**, **limpa linhas em
branco extras e espaços no fim**, e roda o **Prettier**.

```bash
npx tempest fix              # o projeto inteiro
npx tempest fix src/app      # só um caminho
npx tempest fix --dry-run    # mostra o que mudaria, não escreve
npx tempest fix --no-alias   # pula a conversão de import
npx tempest fix --no-css     # pula a passada de CSS
npx tempest fix --extract-css  # opt-in: bloco repetido → uma classe global
```

São quatro passadas, nessa ordem: a conversão de alias, a
[análise de CSS](#analise-de-css), `eslint --fix` (com as regras
`simple-import-sort`, `unused-imports/no-unused-imports`,
`no-multiple-empty-lines`, `no-trailing-spaces`, `eol-last`) e `prettier --write`.
A conversão vem **primeiro** de propósito: trocar `../../services/api` por
`@/services/api` muda o grupo de ordenação do `simple-import-sort`, então rodar o
ESLint depois deixa tudo ordenado num único `fix`. O CSS vem antes do Prettier
pelo mesmo motivo: o que a remoção deixa torto, o Prettier arruma na sequência.

!!! tip "`--dry-run` é a superfície de revisão do CSS"
    O `doctor` mostra 6 achados por severidade; o `--dry-run` lista **todos** os
    erros e avisos (só a cauda de sugestões é limitada a 10) e não escreve nada.
    É o que você lê antes de deixar a ferramenta mexer.

### A conversão de import

A regra é uma só: **nenhum import sobe de diretório**.

```ts
// antes                                    // depois
import { api } from "../../services/api";   import { api } from "@/services/api";
import { Button } from "../Button";         import { Button } from "@/components/Button";
import { Row } from "./Row";                // inalterado — irmão continua relativo
import cfg from "../../../vite.config";     // inalterado — resolve fora de src/
```

Um import de irmão (`./x`) fica como está: ele já diz "isso mora aqui do lado",
que é informação que o `@/` joga fora. Um caminho que resolve **fora** da base do
alias também fica — é isso que protege `../../../vite.config` e
`../../../scripts/x`.

O que a conversão alcança, além de `import` e `export … from`:

```ts
import type { User } from "../../types/user";       // import type
const m = await import("../../pages/Dashboard");    // import() dinâmico
vi.mock("../../lib/api");                            // vi.mock / vi.doMock
```

E em arquivo `.css` (o Vite resolve alias em CSS também):

```css
@import "../../styles/tokens.css";        /* → @/styles/tokens.css */
.hero {
    background: url(../../assets/bg.png); /* → @/assets/bg.png */
}
```

!!! tip "Rode com `--dry-run` primeiro num projeto grande"
    O `--dry-run` lista arquivo, linha e o antes/depois de cada import sem
    escrever nada — e sem rodar ESLint ou Prettier. É a forma de revisar o
    diff antes de deixar a ferramenta mexer.

    ```console
    $ npx tempest fix --dry-run
    → alias imports (../ → @/) [dry-run]
      src/pages/admin/Users.tsx 2
        1: "../../lib/api" → "@/lib/api"
        2: "../../styles/tokens.css" → "@/styles/tokens.css"
      ✓ would convert 2 import(s) in 1 file(s)
    ```

!!! info "O alias vem do seu `tsconfig.json`, não é chumbado"
    A base é lida de `compilerOptions.paths` — seguindo `extends` e aceitando
    comentário no JSON. Se o seu projeto usa `~/*` ou `#/*` em vez de `@/*`, é
    esse prefixo que sai na conversão; se usa `app/` em vez de `src/`, é essa a
    base.

!!! warning "Sem `paths` no tsconfig, a conversão não roda"
    Isso é de propósito. O `paths` é o que o **type-checker** honra: um alias
    achado ali é um alias que o `tsc --noEmit` aceita depois da conversão.
    Adivinhar `@` → `src` só porque existe um `src/` produziria import que não
    resolve em projeto nenhum que não tenha o alias configurado. Quando não acha,
    o comando avisa e segue pro ESLint sem tocar em nada:

    ```console
    ! no path alias found — skipping alias pass  add "paths": { "@/*": ["./src/*"] } to tsconfig.json
    ```

    A conversão também precisa do `typescript` instalado no projeto: ela usa o
    compilador **do seu projeto** pra achar as posições de import, então uma
    string parecida com caminho dentro de comentário, template literal ou
    variável nunca é reescrita por engano.

!!! warning "Código morto = imports/vars, não funções inteiras"
    O `fix` **remove imports não usados** e **avisa** sobre variáveis não usadas
    (não apaga, pra não arriscar). Ele **não** faz eliminação de dead code mais
    profunda (funções/exports órfãos) — isso exige análise dedicada e é
    arriscado automatizar. Para isso, use uma ferramenta como `knip` à parte.

!!! warning "TypeScript 7 não tem a API que os codemods usam"
    O 7 é o **port nativo**: instala com o mesmo nome de pacote, mas publica a API JS
    só em `typescript/unstable/*`, com outra forma — o `ts.readConfigFile`/
    `ts.createSourceFile` clássicos não existem lá. Como as duas passadas de codemod
    (a conversão de alias e o `--extract-css`) precisam do AST, elas **saem do
    caminho** e dizem por quê:

    ```console
    ! alias pass skipped — typescript 7.0.2 não expõe a API clássica do compilador…
    ```

    Todo o resto continua: a análise de CSS, o dedupe, o ESLint, o Prettier, e as
    checagens de tsconfig do `doctor` (que caem num parser JSONC próprio). Pra usar os
    codemods, tenha o TypeScript 6 instalado no projeto.

    Antes da 0.29.1 isso não era um aviso: a CLI resolvia o pacote, concluía que tinha
    TypeScript e chamava a API — `tempest doctor` morria com
    `ts.readConfigFile is not a function`.

!!! note "Precisa de ESLint + Prettier no projeto"
    Apps gerados pelo `create-tempest-app` já vêm com tudo configurado. Em um
    projeto pelado, instale: `npm i -D eslint prettier eslint-plugin-simple-import-sort eslint-plugin-unused-imports`.

## `tempest lint` e `tempest format`

```bash
npx tempest lint     # eslint . (só reporta, não altera)
npx tempest format   # prettier --write . (só formatação)
```

`lint` é o relatório read-only; `fix` é o `lint` que corrige + formata. Flags que
você passar são repassadas pro binário (`npx tempest lint --max-warnings 0`), e o
caminho continua sendo posicional.

## Ajuda

```bash
npx tempest --help
npx tempest --version
```

## Recap

- O `bin` **`tempest`** vem dentro do SDK — `npx tempest <comando>`.
- **`doctor`** diagnostica o projeto (estilo `flutter doctor`), sai com código 1 em problemas bloqueantes.
- **`fix`** converte import relativo pra `@/` + remove CSS morto + organiza imports + remove imports mortos + limpa espaçamento + Prettier. `--dry-run` pra revisar, `--no-alias`/`--no-css` pra pular uma passada.
- A **[análise de CSS](#analise-de-css)** acha sintaxe que o browser derruba, declaração/regra duplicada, nome que não existe e bloco repetido que pede uma classe global. O `doctor` resume, o `--dry-run` lista tudo, o `fix` remove só o que é morto.
- A **[análise de design](./design/limits.md)** mede limite de arquivo/função/hook, contagem de props, `any`, `fetch` em componente, `catch` vazio e cor literal inline — sempre como aviso, com `@tempest-limits <regra> — <motivo>` como saída de emergência escrita.
- **`lint`** reporta; **`format`** só formata.
- Veja também: [Scaffold](./scaffold.md) · [Arquitetura](./architecture.md).
