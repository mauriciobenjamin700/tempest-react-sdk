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
| `colors`         | `string[]`                  | `DEFAULT_CHART_COLORS` | Cores das séries, cicladas por categoria.                                       |
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
| `colors`         | `string[]`                  | `DEFAULT_CHART_COLORS` | Cores das fatias, cicladas por fatia.                                 |
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

Toda a família compartilha uma paleta padrão exportada, `DEFAULT_CHART_COLORS` —
seis cores hex visualmente distintas, aplicadas às séries em ordem cíclica:

```tsx
import { DEFAULT_CHART_COLORS } from "tempest-react-sdk/charts";

// ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4"]
// azul       verde      âmbar      violeta    rosa       ciano
```

Para tematizar, passe seu próprio array em `colors`. As cores são cicladas por
índice da série (ou fatia), então com mais séries que cores ela reinicia do
começo:

```tsx
import { BarChart, DEFAULT_CHART_COLORS } from "tempest-react-sdk/charts";

const marca = ["#0f766e", "#f97316", "#9333ea"];

export function VendasComCoresDaMarca() {
  return (
    <BarChart
      data={vendas}
      index="mes"
      categories={["loja_a", "loja_b", "loja_c"]}
      colors={marca}
    />
  );
}

// Quer só ajustar a primeira cor e manter o resto da paleta?
const minhaPaleta = ["#e11d48", ...DEFAULT_CHART_COLORS.slice(1)];
```

!!! tip "Combine com seus tokens CSS"
    `colors` aceita qualquer string CSS de cor válida — hex, `rgb()`, ou até
    `var(--tempest-color-primary)` lido do seu tema. Assim os gráficos seguem a
    identidade visual do app sem hardcode.

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
