# Charts (recharts)

Gráficos transformam números em forma: uma tendência que sobe, uma fatia que
domina, um eixo onde uma série cruza a outra. O SDK embrulha o
[recharts](https://recharts.org) em cinco componentes temados — `AreaChart`,
`BarChart`, `LineChart`, `PieChart` e `RadarChart` — que recebem **dados
tabulares simples** (um array de objetos) e cuidam de eixos, grid, legenda,
tooltip e cores pra você.

Você não monta `<XAxis>`/`<YAxis>`/`<Tooltip>` na mão: passa `data`, diz qual
chave é o eixo (`index`) e quais chaves virar séries (`categories`), e o
componente faz o resto.

## Por que um subpath separado

Os gráficos não vêm do barrel principal. Você os importa de
`tempest-react-sdk/charts`:

```tsx
import { BarChart, LineChart, AreaChart } from "tempest-react-sdk/charts";
```

!!! info "Por que isolar os charts num subpath?"
    O `recharts` é uma dependência **pesada** (D3 por baixo). A maioria dos apps
    Tempest não desenha gráfico nenhum — e seria injusto cobrar esse peso de
    todos. Por isso os charts moram num subpath dedicado e o `recharts` fica
    **externalizado** no bundle do SDK. Apps que nunca importam de
    `tempest-react-sdk/charts` **não pagam nada**: o tree-shaking do bundler do
    app remove tudo.

!!! tip "Só quer a forma da série? Não precisa de chart"
    Um mini-gráfico inline — tendência numa célula de tabela, ao lado de um KPI —
    é o [`Sparkline`](./components/data.md#sparkline), que mora na **entrada
    raiz** e é SVG puro. Nenhum `recharts` envolvido. Use os charts desta página
    quando o leitor precisa **ler valores no eixo**.

Isso é o mesmo padrão do **caller injeta a dependência pesada** que o SDK já usa
nos adapters de telemetria (Sentry/PostHog) e feature flags
(GrowthBook/LaunchDarkly): o SDK descreve a integração, mas a biblioteca de
verdade fica por conta do app. A diferença é que aqui o `recharts` é uma **peer
dependency opcional** — você o instala uma vez e os cinco componentes o
reutilizam.

### Instalação

```bash
npm i recharts
```

!!! warning "Sem o `recharts`, os charts não renderizam"
    Como o `recharts` é peer dep **opcional**, o `npm install tempest-react-sdk`
    não o traz junto. Se você importar de `tempest-react-sdk/charts` sem ter
    rodado `npm i recharts`, o build quebra com `Cannot find module 'recharts'`.
    Instale-o no app que de fato usa gráficos.

## A família cartesiana: Area, Bar, Line

`AreaChart`, `BarChart` e `LineChart` compartilham a **mesma** interface de
props, `CartesianChartProps`. Aprenda uma e você sabe as três — troca só o nome
do componente.

O modelo mental é sempre o mesmo:

- `data` — suas linhas (array de objetos).
- `index` — a chave que vira o **eixo X** (rótulos: meses, dias, nomes…).
- `categories` — as chaves que viram **séries** (uma área/barra/linha cada).

### BarChart

```tsx
import { BarChart } from "tempest-react-sdk/charts";

const faturamento = [
  { mes: "Jan", receita: 12000, custo: 8000 },
  { mes: "Fev", receita: 15000, custo: 9000 },
  { mes: "Mar", receita: 18000, custo: 9500 },
  { mes: "Abr", receita: 21000, custo: 11000 },
];

export function FaturamentoMensal() {
  return (
    <BarChart
      data={faturamento}
      index="mes"
      categories={["receita", "custo"]}
      valueFormatter={(v) => `R$ ${v.toLocaleString("pt-BR")}`}
      height={320}
    />
  );
}
```

Duas séries (`receita`, `custo`), agrupadas lado a lado por mês. O
`valueFormatter` formata os números no tooltip **e** no eixo Y.

### LineChart

Mesma forma de dados, mesmo `index` e `categories` — só muda o componente:

```tsx
import { LineChart } from "tempest-react-sdk/charts";

const visitas = [
  { dia: "Seg", organico: 320, pago: 120 },
  { dia: "Ter", organico: 410, pago: 150 },
  { dia: "Qua", organico: 380, pago: 90 },
  { dia: "Qui", organico: 520, pago: 200 },
  { dia: "Sex", organico: 610, pago: 240 },
];

export function VisitasSemanais() {
  return (
    <LineChart
      data={visitas}
      index="dia"
      categories={["organico", "pago"]}
      valueFormatter={(v) => v.toLocaleString("pt-BR")}
    />
  );
}
```

!!! note "`stack` não empilha linhas"
    `CartesianChartProps` tem a prop `stack` por uniformidade, mas o `LineChart`
    a **ignora** — linhas empilhadas raramente fazem sentido. Use `stack` no
    `AreaChart` ou no `BarChart`, onde ele de fato empilha as séries num
    `stackId` comum.

### AreaChart (com `stack`)

```tsx
import { AreaChart } from "tempest-react-sdk/charts";

const trafego = [
  { hora: "08h", desktop: 120, mobile: 80, tablet: 20 },
  { hora: "12h", desktop: 200, mobile: 160, tablet: 30 },
  { hora: "18h", desktop: 90, mobile: 240, tablet: 25 },
  { hora: "22h", desktop: 60, mobile: 300, tablet: 40 },
];

export function TrafegoPorDispositivo() {
  return (
    <AreaChart
      data={trafego}
      index="hora"
      categories={["desktop", "mobile", "tablet"]}
      stack
      valueFormatter={(v) => `${v} sessões`}
    />
  );
}
```

Com `stack`, as três áreas se empilham e o topo mostra o total por hora.

### `CartesianChartProps` — referência

| Prop             | Tipo                        | Default                | O que faz                                                                       |
| ---------------- | --------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `data`           | `ChartData`                 | —                      | Linhas a plotar (array de objetos `chave → string \| number`).                  |
| `index`          | `string`                    | —                      | Chave da linha usada no eixo X (cartesiano) ou eixo angular (radar).            |
| `categories`     | `string[]`                  | —                      | Chaves a plotar, uma série cada.                                                |
| `colors`         | `string[]`                  | tokens `--tempest-chart-*` | Cores das séries, cicladas por categoria.                                       |
| `height`         | `number`                    | `300`                  | Altura do gráfico em pixels.                                                     |
| `width`          | `number`                    | —                      | Largura fixa em px. Quando definida, dispensa o `ResponsiveContainer`.          |
| `stack`          | `boolean`                   | `false`                | Empilha as séries num `stackId` comum (ignorado pelo `LineChart`).              |
| `showLegend`     | `boolean`                   | `true`                 | Renderiza a legenda.                                                            |
| `showGrid`       | `boolean`                   | `true`                 | Renderiza o grid cartesiano.                                                    |
| `showTooltip`    | `boolean`                   | `true`                 | Renderiza o tooltip.                                                            |
| `valueFormatter` | `(value: number) => string` | —                      | Formata valores numéricos no tooltip e no eixo Y.                               |
| `className`      | `string`                    | —                      | Classe extra aplicada ao wrapper do gráfico.                                    |

`ChartData = Array<Record<string, string | number>>` — cada linha mapeia uma
chave de coluna a um rótulo (string) ou valor (number).

!!! tip "Uma série, ou várias"
    `categories` é um array, então você decide quantas séries quer. Uma só
    (`categories={["receita"]}`) desenha um gráfico simples; várias desenham
    séries comparativas, cada uma com a próxima cor da paleta.

## PieChart

A `PieChart` tem uma forma de dados diferente: **uma linha por fatia**. Em vez de
`categories`, você diz qual chave segura o **valor** (`category`) e qual segura o
**rótulo** (`index`).

```tsx
import { PieChart } from "tempest-react-sdk/charts";

const planos = [
  { plano: "Free", usuarios: 4200 },
  { plano: "Pro", usuarios: 1800 },
  { plano: "Business", usuarios: 600 },
  { plano: "Enterprise", usuarios: 120 },
];

export function DistribuicaoDePlanos() {
  return (
    <PieChart
      data={planos}
      category="usuarios"
      index="plano"
      donut
      valueFormatter={(v) => `${v.toLocaleString("pt-BR")} usuários`}
    />
  );
}
```

Cada linha vira uma fatia colorida pela próxima cor da paleta. Com `donut`, o
centro fica vazio (raio interno de 60%) — ótimo pra colocar um total no meio.

### `PieChartProps` — referência

| Prop             | Tipo                        | Default                | O que faz                                                              |
| ---------------- | --------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `data`           | `ChartData`                 | —                      | Linhas a plotar, uma fatia cada.                                      |
| `category`       | `string`                    | —                      | Chave da linha com o **valor** numérico da fatia.                     |
| `index`          | `string`                    | —                      | Chave da linha com o **nome/rótulo** da fatia.                        |
| `colors`         | `string[]`                  | tokens `--tempest-chart-*` | Cores das fatias, cicladas por fatia.                                 |
| `height`         | `number`                    | `300`                  | Altura do gráfico em pixels.                                          |
| `width`          | `number`                    | —                      | Largura fixa em px. Quando definida, dispensa o `ResponsiveContainer`.|
| `donut`          | `boolean`                   | `false`                | Renderiza como rosca (raio interno não-zero) em vez de pizza cheia.   |
| `showLegend`     | `boolean`                   | `true`                 | Renderiza a legenda.                                                  |
| `showTooltip`    | `boolean`                   | `true`                 | Renderiza o tooltip.                                                  |
| `valueFormatter` | `(value: number) => string` | —                      | Formata valores numéricos no tooltip.                                 |
| `className`      | `string`                    | —                      | Classe extra aplicada ao wrapper.                                     |

!!! note "A `PieChart` não tem `showGrid` nem `stack`"
    Pizza não tem grid cartesiano nem empilhamento — essas props da família
    cartesiana simplesmente não existem aqui.

## RadarChart

A `RadarChart` reusa `CartesianChartProps` (mesma assinatura de Area/Bar/Line),
mas plota polígonos num eixo radial: `index` vira o **eixo angular** (os vértices)
e cada entrada de `categories` vira um polígono.

```tsx
import { RadarChart } from "tempest-react-sdk/charts";

const skills = [
  { atributo: "Velocidade", time_a: 80, time_b: 65 },
  { atributo: "Defesa", time_a: 70, time_b: 90 },
  { atributo: "Ataque", time_a: 95, time_b: 75 },
  { atributo: "Resistência", time_a: 60, time_b: 85 },
  { atributo: "Técnica", time_a: 88, time_b: 80 },
];

export function ComparativoDeTimes() {
  return (
    <RadarChart
      data={skills}
      index="atributo"
      categories={["time_a", "time_b"]}
      valueFormatter={(v) => `${v} pts`}
    />
  );
}
```

Dois polígonos sobrepostos comparam `time_a` e `time_b` em cada atributo —
perfeito pra comparar perfis multidimensionais.

!!! note "A `RadarChart` ignora `showGrid` e `stack`"
    O radar sempre desenha seu próprio `PolarGrid` (não há `showGrid`), e não
    empilha séries (`stack` é ignorado). `showLegend`/`showTooltip`/`colors`/
    `valueFormatter` funcionam normalmente.

## Cores e tema

**Você não precisa fazer nada:** por padrão as séries saem dos tokens
`--tempest-chart-1` … `--tempest-chart-8` do tema. Trocar a marca com
`createTheme({ chart: [...] })` move os gráficos junto, e virar o tema escuro
troca a paleta pela versão clareada — sem prop nenhuma no gráfico.

```css
/* o que o SDK já define (colors.css) */
:root {
  --tempest-chart-1: #2563eb; /* azul    */
  --tempest-chart-2: #16a34a; /* verde   */
  --tempest-chart-3: #f59e0b; /* âmbar   */
  --tempest-chart-4: #7c3aed; /* violeta */
  --tempest-chart-5: #ec4899; /* rosa    */
  --tempest-chart-6: #06b6d4; /* ciano   */
  --tempest-chart-7: #ea580c;
  --tempest-chart-8: #0f766e;
}
```

!!! warning "Uma paleta de 6 cores não deve virar 8"
    Se você define só `chart-1..6`, o leitor continuaria andando nos
    `--tempest-chart-7`/`-8` embutidos do SDK e o gráfico com 7 séries sairia com
    paleta misturada — 6 cores da sua marca + 2 sobras. Por isso existe
    `--tempest-chart-count`: o `createTheme` escreve quantas cores o tema tem, e o
    `resolveChartColors` para ali. Definindo tokens à mão, declare junto:

    ```css
    :root {
      --tempest-chart-1: #0f766e;
      --tempest-chart-2: #f97316;
      --tempest-chart-count: 2;
    }
    ```

Sobrescreva no seu CSS, ou gere com o factory de tema:

```tsx
import { applyTheme, createTheme } from "tempest-react-sdk";

applyTheme(createTheme({
  primary: "#0f766e",
  chart: ["#0f766e", "#f97316", "#9333ea"],
}));
```

!!! danger "`colors={["var(--meu-token)"]}` **não** funciona"
    O recharts aplica cor como **atributo de apresentação** do SVG
    (`fill="…"`), e navegador nenhum substitui `var()` ali — custom property só
    é resolvida em **declaração** CSS. Um `var()` passado em `colors` renderiza
    como cor inválida (série invisível).

    É por isso que o SDK **lê os tokens** via `getComputedStyle` e entrega cor
    literal pro recharts. Se você precisa do valor de um token seu em JS, use o
    mesmo caminho:

    ```tsx
    import { readThemeToken } from "tempest-react-sdk";

    const marca = readThemeToken("--minha-marca"); // "#0f766e"
    ```

Para um gráfico específico, `colors` continua ganhando de tudo — é a via de
escape, ciclada por índice da série (ou fatia):

```tsx
import { BarChart, DEFAULT_CHART_COLORS } from "tempest-react-sdk/charts";

export function VendasComCoresDaMarca() {
  return (
    <BarChart
      data={vendas}
      index="mes"
      categories={["loja_a", "loja_b", "loja_c"]}
      colors={["#0f766e", "#f97316", "#9333ea"]}
    />
  );
}

// Ajustar só a primeira cor e manter o resto do fallback:
const minhaPaleta = ["#e11d48", ...DEFAULT_CHART_COLORS.slice(1)];
```

`DEFAULT_CHART_COLORS` é o **fallback**, usado quando os tokens não são
legíveis: sem `styles.css` importado, fora do browser (testes, script de build)
ou numa página que removeu os tokens.

### Resolvendo tokens você mesmo

```tsx
import { resolveChartColors, useChartColors } from "tempest-react-sdk/charts";

// dentro de um componente — re-resolve quando o tema virar
const colors = useChartColors();

// fora do React (canvas, export de imagem, tooltip customizado)
const palette = resolveChartColors();
```

`useChartColors` observa o atributo `data-tempest-theme` e re-resolve na troca de
tema; passar um array explícito curto-circuita o hook (nenhum observer é criado).
Precisa da cor do grid/eixo? `resolveChartChrome("grid" | "axis")`.

!!! tip "Tema escopado numa seção"
    Os dois aceitam um elemento: `useChartColors(undefined, sectionRef.current)`
    resolve os tokens **daquela** subárvore, então uma seção com tema próprio
    pinta seus gráficos com a paleta dela.

## Escala contínua: magnitude e polaridade

As 8 cores de série codificam **identidade** — qual série é qual. Um heatmap ou um
choropleth codifica **quanto**, e isso é outro trabalho: precisa de *um* hue
escalonado por claridade, não de oito hues.

```tsx
import { sequentialScale, divergingScale, scaleSteps } from "tempest-react-sdk";

const cor = sequentialScale({ min: 0, max: 250 });
<rect fill={cor(valor)} />;

// Polaridade: variação contra a meta
const desvio = divergingScale({ min: 80, max: 130, center: 100 });
<rect fill={desvio(realizado)} />;
```

| Export                  | O que faz                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `sequentialScale`       | `{ min, max, ordinal? }` → `(valor) => cor`                   |
| `divergingScale`        | `{ min, max, center? }` → `(valor) => cor`                    |
| `scaleSteps`            | Todos os passos em ordem, pra montar a legenda                 |
| `SEQUENTIAL_STEP_COUNT` | `7`                                                           |
| `DIVERGING_STEP_COUNT`  | `9` (1–4 frio · 5 neutro · 6–9 quente)                        |
| `ORDINAL_START_STEP`    | `3` — primeiro passo que passa 2:1 na superfície                |

!!! info "Sai da raiz, não do `/charts`"
    São matemática de token pura, **sem recharts**. Quem mais precisa delas — um
    choropleth do `/br`, um heatmap feito à mão — não tem motivo pra instalar
    recharts. Custo medido: **365 B brotli** importando da raiz. O `/charts`
    re-exporta só por descoberta.

!!! tip "Devolvem token, não hex"
    O retorno é `var(--tempest-chart-sequential-4)`. Um heatmap pintado uma vez
    segue o tema — inclusive o escuro, cujos passos são **escolhidos** pra superfície
    escura, não invertidos do claro.

!!! warning "Sequencial deixa o zero recuar; ordinal não pode"
    Numa **sequencial** o passo mais claro some na superfície de propósito: é o que
    "quase nada" deve parecer num heatmap. Numa **ordinal** — degrau de funil, faixa,
    tier — cada passo é uma marca que alguém precisa ver, e um passo invisível é um
    dado perdido. Passe `ordinal: true` e a escala começa no passo 3.

    ```tsx
    sequentialScale({ min: 0, max: 4, ordinal: true }); // usa 3..7
    ```

!!! check "Cada braço da divergente escala pelo próprio alcance"
    Num domínio assimétrico (−5 a +80) os negativos ainda usam o braço frio inteiro.
    Escalar os dois braços pelo mais largo — o erro fácil — colapsaria todo negativo
    no passo ao lado do meio e esconderia o sinal.

!!! danger "O meio da divergente é cinza, nunca um hue"
    Um meio colorido lê como uma **terceira categoria** em vez de "sem desvio", que é
    a única coisa que uma divergente existe pra mostrar. Por isso o token 5 é neutro
    nos dois modos.

!!! note "Escala contínua precisa de legenda"
    Sem uma faixa com rótulo nas pontas, ninguém converte cor de volta em número. O
    `scaleSteps` existe pra isso:

    ```tsx
    <div style={{ display: "flex" }}>
      {scaleSteps("sequential").map((cor) => (
        <span key={cor} style={{ background: cor, width: 20, height: 10 }} />
      ))}
    </div>
    <span>0</span> … <span>250</span>
    ```

### Como as rampas foram feitas

Não foram escolhidas a olho. Os passos são **calculados** em OKLCH com claridade
espaçada por igual, então passo igual de dado parece passo igual de cor — o que não
acontece espaçando em RGB. A croma segue um domo: as pontas ficam críveis e o meio
carrega o hue.

Cada rampa foi validada por script nos dois modos: claridade monótona, gap ≥ 0,06
entre passos adjacentes, hue único, e a ponta perto da superfície passando 2:1 no
recorte ordinal. O `createTheme` refaz as duas escalas a partir do hue da marca
(usando o `danger` do tema como polo quente, pra "quente" e "ruim" não discordarem na
tela), então rebrandar move o heatmap junto em vez de deixá-lo azul do SDK.

## Responsivo por padrão, fixo quando preciso

Por padrão, cada gráfico se **estica pra largura do pai** via um
`ResponsiveContainer` do recharts — você controla só a `height`. É o que você
quer em quase todo dashboard: a largura acompanha a coluna.

```tsx
// Largura fluida (preenche o container), altura fixa de 300px (default).
<LineChart data={data} index="dia" categories={["valor"]} />
```

Mas há casos em que você precisa de uma largura **fixa e determinística**: testes
de snapshot, renderização no servidor (SSR), exportar um PNG de tamanho exato. Aí
você passa `width`:

```tsx
// Largura fixa de 600px — sem ResponsiveContainer.
<LineChart data={data} index="dia" categories={["valor"]} width={600} height={300} />
```

!!! warning "`width` desliga o `ResponsiveContainer`"
    Quando você define `width`, o gráfico renderiza **naquela largura exata** e
    **não** é embrulhado num `ResponsiveContainer`. Isso é intencional: o
    `ResponsiveContainer` mede o pai no cliente e não funciona bem em SSR/jsdom,
    onde não há layout calculado. Para uma página normal no navegador, **omita**
    `width` e deixe ele preencher o pai.

## Recap

- Importe os charts de **`tempest-react-sdk/charts`** — subpath dedicado. O
  `recharts` é peer dep **opcional**: rode `npm i recharts` no app que usa
  gráficos. Quem não importa de lá não paga o peso (mesmo padrão do "caller
  injeta a dep pesada" dos adapters de telemetria/flags).
- `AreaChart`, `BarChart` e `LineChart` compartilham `CartesianChartProps`:
  `data` + `index` (eixo X) + `categories` (séries). `stack` empilha em
  Area/Bar; o `LineChart` o ignora.
- `PieChart` usa `category` (valor) + `index` (rótulo), uma linha por fatia, com
  `donut` opcional.
- `RadarChart` reusa `CartesianChartProps` (`index` = eixo angular); ignora
  `showGrid`/`stack`.
- `DEFAULT_CHART_COLORS` é a paleta padrão (6 cores); sobrescreva via a prop
  `colors`, cicladas por série/fatia.
- Sem `width`, o gráfico é **responsivo** (estica no pai via
  `ResponsiveContainer`, você controla a `height`). Com `width`, ele renderiza
  num tamanho **fixo** sem `ResponsiveContainer` — útil pra testes/SSR.
