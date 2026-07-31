# Limites objetivos

"Mantenha os componentes pequenos" é um conselho que ninguém consegue aplicar,
porque não é verificável. Duas pessoas discordam sobre "pequeno" e a discussão
morre no gosto.

Limite com **número** resolve isso. O número não precisa ser perfeito — precisa
ser combinado.

## A tabela

| O que                            | Limite      | Ação ao estourar                             |
| -------------------------------- | ----------- | -------------------------------------------- |
| Arquivo `.tsx` de componente     | **150**     | extrai sub-componente ou hook                |
| Corpo de uma função/componente   | **80**      | extrai função pura ou hook                   |
| Hook customizado                 | **100**     | quebra em hooks menores                      |
| Props de um componente           | **7**       | provavelmente são dois componentes           |
| Profundidade de aninhamento JSX  | **4**       | extrai sub-componente                        |
| Complexidade ciclomática         | **10**      | tabela de lookup ou early return             |
| Parâmetros de função             | **3**       | vira um objeto nomeado                       |
| Arquivo `.ts` de serviço/util    | **200**     | separa por responsabilidade                  |

!!! info "Por que 150 e não 200 ou 100?"
    150 linhas é o que cabe em duas telas de editor. É o ponto em que você ainda
    consegue **ler o arquivo inteiro** antes de mudar uma linha — e ler o arquivo
    inteiro é o que evita a mudança que quebra outra parte dele. Acima disso você
    passa a editar por busca, não por compreensão.

## O que o número mede de verdade

Linha é um **proxy**. O que você está de fato limitando é:

| Sintoma                            | Consequência real                                    |
| ---------------------------------- | ---------------------------------------------------- |
| Arquivo longo                      | ninguém lê inteiro → mudança de efeito imprevisto    |
| Função longa                       | não cabe na cabeça → bug de estado intermediário     |
| Muitas props                       | muitos casos → combinação inválida representável     |
| JSX profundo                       | não se enxerga a estrutura → CSS/layout quebra        |
| Complexidade alta                  | caminhos não testados → bug em branch raro           |

Por isso vale contar **linhas de código**, não do arquivo: JSDoc e a `interface`
de props não custam carga cognitiva — ajudam.

## Dogfood: onde o próprio SDK fica

Números reais deste repositório (157 arquivos `.tsx` de produção, contando só
linhas de código):

| Métrica                       | Valor    |
| ----------------------------- | -------- |
| Mediana de linhas por arquivo | **65**   |
| Arquivos acima de 150         | **28**   |
| Maior arquivo                 | `FilterBar.tsx` — 279 |

Ou seja: **o limite não é obedecido em 100% dos casos, de propósito.** A mediana
é 65 porque a regra funciona; os 28 que estouram são widgets de comportamento
irredutível — `ImageCropper` (arrasto + zoom + recorte em canvas), `Calendar`
(grade + teclado + intervalo), `BrazilMap` (SVG + hit-testing).

## A saída de emergência: `@tempest-limits`

Estourar o limite é aceitável quando você **escreve o motivo**. O marcador é
`@tempest-limits <regra> — <motivo>` num comentário do arquivo:

```tsx
/**
 * Interactive image cropper.
 *
 * @tempest-limits file-lines — pointer drag, wheel zoom, aspect-ratio clamping
 * and canvas export share one piece of geometry state. Splitting them would mean
 * threading that state through props and duplicating the clamp maths.
 */
```

- A **regra** é o id da tabela abaixo (`file-lines`, `props-count`, …), várias
  separadas por vírgula, ou `*` para todas.
- O **motivo** vem depois de `—`, `-` ou `:`. Menos de 12 caracteres não conta
  como motivo: o `tempest doctor` reporta o marcador vazio, porque waiver sem
  explicação é exatamente o que ele existe pra evitar.

!!! tip "O que não é aceitável é estourar sem perceber"
    O marcador não é burocracia — é o que transforma "esse arquivo é grande" de
    acidente em decisão. Quem ler daqui a seis meses sabe se pode quebrar.

!!! info "`eslint-disable` também vale"
    Um `// eslint-disable-next-line @typescript-eslint/no-explicit-any` já
    silencia o `any` daquela linha no `doctor` — o mecanismo padrão ganha, sem
    precisar de um segundo marcador.

## `tempest doctor` já cobra isso

O [CLI](../cli.md) tem uma seção **Design** que mede o projeto e reporta cada
estouro com arquivo e linha:

```bash
npx tempest doctor              # inclui a análise de design
npx tempest doctor --no-design  # pula a seção
```

```text
Design
  [i] 42 source file(s) · 1830 lines of code · median 38 — largest: src/pages/Orders.tsx (204)
  [!] src/pages/Orders.tsx:1 — 204 lines of code (limit 150) — extract a sub-component, a hook or a pure function
  [!] src/pages/Orders.tsx:31 — a component must not call the network — move it to a service and read it with useQuery
  [!] src/features/orders/OrderTable.tsx:12 — OrderTableProps has 9 props (limit 7) — likely two components in one
  [i] 2 limit(s) waived with a written reason — @tempest-limits markers — nothing to do
```

As regras, e o id de cada uma pro marcador:

| Id                     | O que mede                                                       |
| ---------------------- | ---------------------------------------------------------------- |
| `file-lines`           | linhas de código do arquivo (150 `.tsx` / 200 `.ts`)             |
| `function-lines`       | corpo de função/componente (80)                                  |
| `hook-lines`           | corpo de hook `use*` (100)                                       |
| `props-count`          | membros de `<X>Props` ou props desestruturadas (7)               |
| `param-count`          | parâmetros de função **exportada** (3)                           |
| `explicit-any`         | `any` em posição de tipo, `as any`                               |
| `ts-ignore`            | `@ts-ignore` / `@ts-nocheck`                                     |
| `fetch-in-component`   | `fetch(`/`axios` num `.tsx`                                      |
| `empty-catch`          | `catch` de corpo vazio                                           |
| `inline-style-literal` | cor literal dentro de `style={{ … }}`                            |

!!! note "A seção Design nunca falha o exit code"
    Todos os achados são `warn` ou nota. Limite é heurística com saída de
    emergência escrita — falhar o CI por heurística é o caminho mais rápido pra
    alguém silenciar a ferramenta. Os gates duros continuam onde devem estar:
    `no-explicit-any` como `error` no ESLint e `tsc --noEmit`.

!!! info "O que o doctor **não** mede"
    Profundidade de aninhamento JSX e complexidade ciclomática. As duas precisam
    de um parser de verdade pra não gerar falso positivo com quebra de linha do
    Prettier — ficam com o ESLint (`max-depth`, `complexity`) e com a revisão.

## Como fazer o linter cobrar também

Adicione ao `eslint.config.js` do seu app (o
[template do scaffold](../scaffold.md) traz a base; isto é a camada de design):

```js
{
    files: ["**/*.{ts,tsx}"],
    rules: {
        "max-lines": [
            "warn",
            { max: 150, skipBlankLines: true, skipComments: true },
        ],
        "max-lines-per-function": [
            "warn",
            { max: 80, skipBlankLines: true, skipComments: true },
        ],
        "max-depth": ["warn", 4],
        "max-params": ["warn", 3],
        complexity: ["warn", 10],
        "@typescript-eslint/no-explicit-any": "error",
    },
},
{
    // Testes descrevem cenários; contá-los como código de produção só produz
    // ruído e incentiva teste menos legível.
    files: ["**/*.test.{ts,tsx}"],
    rules: {
        "max-lines": "off",
        "max-lines-per-function": "off",
    },
},
```

!!! warning "`warn` nos limites, `error` na tipagem"
    Limite de tamanho é heurística — `error` transforma cada exceção legítima num
    `eslint-disable`, e `eslint-disable` espalhado é pior que arquivo grande.
    `warn` aparece no PR e alguém decide. Já `no-explicit-any` é `error`: não tem
    caso legítimo que valha o silêncio (veja [Tipagem forte](typing.md)).

Rodando:

```bash
npx tempest lint                      # ESLint com a config do projeto
npx tempest lint --max-warnings 0     # no CI, quando quiser o limite duro
```

Detalhes do CLI em [CLI tempest](../cli.md).

## Encontrando os estouros hoje

Antes de ligar a regra, veja o tamanho do problema:

```bash
# Top 15 arquivos por linhas de código (ignora blank, // e blocos /* */)
find src -name "*.tsx" ! -name "*.test.tsx" | while read -r f; do
  n=$(grep -vcE '^\s*($|//|/\*|\*|\*/)' "$f")
  echo "$n $f"
done | sort -rn | head -15
```

Se aparecerem 3 arquivos acima do limite, corrija hoje. Se aparecerem 60, ligue a
regra como `warn` e resolva o que você já ia tocar — refatoração em massa gera PR
irrevisável e nenhum ganho imediato.

## Os três cortes que resolvem 90% dos casos

### 1. Sub-componente por bloco de JSX

O `.tsx` de 300 linhas quase sempre é 4 blocos visuais num arquivo. Cada bloco
com nome próprio:

```text
OrderDetail.tsx (300)
└── OrderDetail.tsx (60) + OrderHeader.tsx (50) + OrderItems.tsx (70) + OrderTotals.tsx (40)
```

### 2. Hook pra lógica

Estado + efeitos + handlers saem pro `use-<coisa>.ts`. O `.tsx` fica só com
marcação. Exemplo completo em
[Pensando em componentes](components.md#logic-to-hook).

### 3. Função pura pra fora do React

`sortBy`, `paginate`, `formatInvoice`, `buildQuery` não precisam de React —
vão pra `lib/` ou pro arquivo da feature, e ganham teste unitário barato.

!!! danger "Corte que não vale: mover o JSX pra uma função no mesmo arquivo"
    ```tsx
    function renderHeader() { … }   // ❌ não é componente, não é reusável
    ```
    Isso reduz a contagem de linhas da função e não reduz nada do que importa: o
    arquivo continua do mesmo tamanho e o "componente interno" não pode ser
    memoizado, testado nem reusado. Extraia de verdade.

## Recap

- Limite vira número pra parar de ser discussão de gosto: **150** arquivo, **80**
  função, **100** hook, **7** props, **4** aninhamento, **10** complexidade.
- Linha é proxy de **carga cognitiva** — conte linhas de código, não JSDoc.
- O SDK tem mediana 65 e 28 estouros conscientes; a saída de emergência é
  `@tempest-limits <regra> — <motivo>`, nunca o silêncio.
- `npx tempest doctor` mede e reporta com arquivo e linha (sempre `warn`); o
  ESLint cobra com `max-lines` e `no-explicit-any` como `error`.
- Três cortes resolvem quase tudo: sub-componente, hook, função pura.

Próxima: [Tipagem forte](typing.md).
