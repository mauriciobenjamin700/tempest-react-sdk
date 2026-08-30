# Módulos, npm e o bundler

!!! tip "Pule esta página se você já sabe…"

    - a diferença entre `import`/`export` (ESM) e `require` (CommonJS);
    - o que `dependencies`, `devDependencies` e `peerDependencies` significam;
    - o que tree-shaking consegue provar e o que ele não consegue;
    - por que um `import` de uma coisa só pode arrastar oito quilobytes.

## O problema

Você importa **uma** função:

```ts
import { cn } from "tempest-react-sdk";
```

E o bundle cresce 8 KB. Você não usou componente nenhum, não montou provider
nenhum, e mesmo assim pagou por coisas que nem sabe que existem.

O motivo não é o pacote ser grande — é o bundler não conseguir **provar** que o
resto é descartável. Esta página é sobre o que ele precisa para provar.

## Módulos ES

Um módulo é um arquivo com escopo próprio. O que sai é o que você exporta:

```ts
// math.ts
export function somar(a: number, b: number): number {
    return a + b;
}

export const PI = 3.14159;
```

```ts
// app.ts
import { somar, PI } from "./math";

console.log(somar(PI, 1));
```

| Forma                                | O que faz                                                       |
| ------------------------------------ | --------------------------------------------------------------- |
| `export function x()`                | Export **nomeado**. É o que o SDK usa, sempre.                   |
| `export default x`                   | Export padrão, um por arquivo. O nome na importação é livre.      |
| `import { x } from "..."`            | Importa um nomeado.                                               |
| `import * as tudo from "..."`        | Importa o namespace inteiro. **Derruba o tree-shaking.**          |
| `import type { X } from "..."`       | Importa só o tipo — some do bundle, não existe em runtime.        |
| `await import("./x")`                | Import **dinâmico**: vira um chunk separado, carregado sob demanda. |

!!! info "ESM é estático, e é isso que permite a otimização"

    `import` só existe no topo do arquivo, com caminho literal. Isso deixa o
    bundler ler o grafo de dependências **sem executar nada** — e é o que torna
    tree-shaking possível. `require()` do CommonJS é uma chamada de função comum,
    que pode estar dentro de um `if`; não dá para analisar da mesma forma.

## npm: os três tipos de dependência

```json
{
    "dependencies": { "react-hook-form": "^7.76.0" },
    "devDependencies": { "vitest": "^4.0.0" },
    "peerDependencies": { "react": "^18 || ^19" }
}
```

| Campo                | Quem instala                       | Para quê                                                   |
| -------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `dependencies`       | Vem junto quando alguém instala você | Código que roda em produção.                              |
| `devDependencies`    | Só quem clona o repo               | Teste, lint, build. Não vai para o consumidor.             |
| `peerDependencies`   | **O app** instala, você só declara | Biblioteca que precisa existir **uma vez só** no app inteiro. |

!!! warning "Peer dependency não é sobre bytes — é sobre correção"

    Duas cópias de `zod` custam kilobytes. Duas cópias de **React** ou de
    **react-router** custam funcionamento: cada cópia tem o próprio contexto, e o
    componente que consome o contexto da cópia B não enxerga o provider montado
    pela cópia A. O sintoma clássico é
    `useNavigate() may be used only in the context of a <Router>`.

    Por isso o `tempest-react-sdk` declara `react`, `react-dom` e `react-router`
    como peers e **todo o resto** como dependência direta: o critério é carregar
    contexto React, não popularidade.

## Tree-shaking, e o que ele precisa

Tree-shaking é o bundler removendo o que ninguém importou. Ele consegue provar
isso quando três coisas valem:

1. **O módulo é ESM** (grafo estático).
2. **O import é nomeado** — `import { cn }`, não `import * as sdk`.
3. **Não há efeito colateral** no módulo — nada roda só por ele ter sido carregado.

O item 3 é o que o campo `sideEffects` do `package.json` declara:

```json
{ "sideEffects": ["**/*.css"] }
```

Isso diz: "todo arquivo deste pacote é livre de efeito colateral, **exceto** os
`.css`" — e os `.css` precisam ficar de fora porque importar um arquivo de estilo
**é** o efeito colateral desejado. Sem essa exceção o bundler removeria os estilos.

!!! danger "O que quebra o tree-shaking no seu próprio código"

    - `import * as X from "..."` — o bundler não sabe qual membro você usa.
    - Código de topo de módulo com efeito (`window.algo = ...`, registrar listener).
    - Reexportar tudo por um barrel que executa algo ao ser importado.

## Onde isso aparece no SDK

O `tempest-react-sdk` publica o `dist/` com o **grafo de módulos preservado**: um
arquivo de saída por módulo de origem, em vez de um bundle por entrada.

A diferença é mensurável. Com bundle por entrada, importar só `cn` arrastava ~8,5 KB
gzip — o bundler não conseguia provar que o resto daquele arquivo único era livre de
efeito. Com `preserveModules`, o piso caiu para centenas de bytes.

O custo é que `dist/` tem milhares de arquivos. Isso é esperado, não regressão — o
tarball tem o mesmo tamanho.

E é por isso que o orçamento de tamanho do CI é medido **por fatia importada**, não
pelo barrel inteiro:

```json
{
    "name": "slice: one component (`Button`)",
    "import": { "./dist/tempest-react-sdk.js": "{ Button }" },
    "limit": "1.5 KB"
}
```

Medir o barrel diria só "o pacote cresceu", que cresce com toda feature e não
informa nada sobre o que **você** paga. O barrel continua tendo um teto, mas como
teto explícito de entrada inteira — não como orçamento de consumidor.

!!! tip "Import dinâmico é o outro lado da moeda"

    Rota que ninguém abriu não precisa estar no bundle inicial. O
    `defineRoutes([...])` do SDK aceita `lazy: () => import("./Pagina")`, e o
    `<AppRouter>` já monta o `<Suspense>` — veja
    [Roteamento](../routing.md).

## Recap

- ESM é estático: `import` no topo, caminho literal — é o que permite analisar o
  grafo sem executar. ✅
- `dependencies` vem junto; `devDependencies` fica no repo; `peerDependencies` o
  **app** instala.
- Peer dep existe por **correção**, não por bytes: duas cópias de uma lib com
  contexto React quebram em runtime.
- Tree-shaking precisa de ESM + import nomeado + ausência de efeito colateral;
  `sideEffects` é como o pacote declara isso.
- `import * as X` derruba o tree-shaking; `import type` some do bundle.
- No SDK, `dist/` preserva o grafo de módulos e o orçamento do CI é medido por
  fatia importada.

📚 **Referência canônica:** [MDN — Módulos JavaScript](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide/Modules)

➡️ **Próxima página:** [TypeScript: o mínimo que o SDK usa](typescript.md)
