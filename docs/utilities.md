# Utilitários

Coleção de funções puras, sem dependência de React, pra resolver as tarefas chatas do dia a dia — agrupar listas, mesclar objetos, debouncar callbacks, formatar bytes. Tudo é importado direto de `tempest-react-sdk` e funciona em qualquer ambiente JS (browser, Node, worker).

```ts
import { groupBy, pick, debounce, formatBytes } from "tempest-react-sdk";
```

!!! tip "Tree-shaking"
    Cada função é um export nomeado independente. Importe só o que usar — o bundler do seu app remove o resto.

---

## Arrays

Helpers de coleção que **nunca mutam** a entrada — sempre devolvem um novo array (ou objeto).

| Função                     | Assinatura                                                  | O que faz                                                        |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `groupBy(items, key)`      | `<T, K>(items: T[], key: (item: T) => K) => Record<K, T[]>` | Agrupa items em baldes pela chave retornada por `key`.           |
| `uniqueBy(items, key)`     | `<T>(items: T[], key: (item: T) => unknown) => T[]`         | Remove duplicatas, mantendo a primeira ocorrência de cada chave. |
| `chunk(items, size)`       | `<T>(items: T[], size: number) => T[][]`                    | Quebra a lista em pedaços de no máximo `size` items.             |
| `range(start, end, step?)` | `(start: number, end: number, step?: number) => number[]`   | Gera uma faixa numérica `[start, end)` com passo `step` (1).     |

```ts
import { groupBy, uniqueBy, chunk, range } from "tempest-react-sdk";

groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? "even" : "odd"));
// { odd: [1, 3], even: [2, 4] }

uniqueBy(
  [
    { id: 1, v: "a" },
    { id: 1, v: "b" },
    { id: 2, v: "c" },
  ],
  (u) => u.id,
);
// [{ id: 1, v: "a" }, { id: 2, v: "c" }]

chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]

range(0, 5); // [0, 1, 2, 3, 4]
range(0, 10, 2); // [0, 2, 4, 6, 8]
range(5, 0, -1); // [5, 4, 3, 2, 1]
```

!!! warning "`chunk` exige `size >= 1`"
    Chamar `chunk(items, 0)` lança `RangeError`. `range` com passo na direção errada (ou `0`) devolve `[]` em vez de estourar.

---

## Objetos

Cópias imutáveis e merge recursivo. Nenhuma dessas funções altera a entrada.

| Função                   | Assinatura                                                | O que faz                                                           |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `pick(obj, keys)`        | `<T, K extends keyof T>(obj: T, keys: K[]) => Pick<T, K>` | Novo objeto só com as chaves pedidas (chaves ausentes são puladas). |
| `omit(obj, keys)`        | `<T, K extends keyof T>(obj: T, keys: K[]) => Omit<T, K>` | Novo objeto sem as chaves indicadas.                                |
| `deepMerge(target, src)` | `<T>(target: T, source: Partial<T>) => T`                 | Merge recursivo de objetos planos; arrays/instâncias substituem.    |
| `isEmpty(value)`         | `(value: unknown) => boolean`                             | `true` pra `null`, `""`, `[]`, `{}`, `Map`/`Set` vazios.            |

```ts
import { pick, omit, deepMerge, isEmpty } from "tempest-react-sdk";

pick({ id: 1, name: "Ana", age: 30 }, ["id", "name"]);
// { id: 1, name: "Ana" }

omit({ id: 1, name: "Ana", age: 30 }, ["age"]);
// { id: 1, name: "Ana" }

deepMerge({ a: 1, nested: { x: 1, y: 2 } }, { nested: { y: 20, z: 30 } });
// { a: 1, nested: { x: 1, y: 20, z: 30 } }

isEmpty(0); // false — números nunca são "vazios"
isEmpty(false); // false
isEmpty(""); // true
```

!!! info "`deepMerge` não funde arrays"
    Arrays e valores não-planos (datas, instâncias de classe, primitivos) **substituem** o valor do `target` inteiro — não há merge elemento a elemento. `deepMerge({ tags: ["a", "b"] }, { tags: ["c"] })` resulta em `{ tags: ["c"] }`.

---

## Type guards

Narrowing seguro de tipos. Combinam bem com `Array.prototype.filter` e `switch` exaustivos.

| Função                         | Assinatura                                             | O que faz                                                |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
| `isDefined(value)`             | `<T>(value: T \| null \| undefined) => value is T`     | `true` quando o valor não é `null` nem `undefined`.      |
| `isString(value)`              | `(value: unknown) => value is string`                  | `true` pra string primitiva.                             |
| `isNumber(value)`              | `(value: unknown) => value is number`                  | `true` pra número, **excluindo** `NaN`.                  |
| `isPlainObject(value)`         | `(value: unknown) => value is Record<string, unknown>` | `true` só pra objeto literal (não array/data/instância). |
| `assertNever(value, message?)` | `(value: never, message?: string) => never`            | Lança sempre — marca caminhos inalcançáveis.             |

```ts
import { isDefined, isNumber, assertNever } from "tempest-react-sdk";

const xs: (number | null)[] = [1, null, 2];
const clean: number[] = xs.filter(isDefined); // [1, 2] — tipo já narrowed

isNumber(NaN); // false
isNumber("42"); // false

type Shape = "circle" | "square";
function area(shape: Shape): number {
  switch (shape) {
    case "circle":
      return 1;
    case "square":
      return 2;
    default:
      return assertNever(shape); // erro de compilação se um caso for esquecido
  }
}
```

!!! tip "`assertNever` é checagem de exaustividade"
    Use no `default` de um `switch`. Se você adicionar um membro novo à union e esquecer de tratá-lo, o TypeScript reclama na hora da compilação — e o runtime falha alto se algo escapar.

---

## Funções

Wrappers de controle de execução. `debounce` e `throttle` expõem `.cancel()`.

| Função               | Assinatura                                                                     | O que faz                                                          |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `debounce(fn, wait)` | `<A>(fn: (...a: A) => void, wait: number) => ((...a: A) => void) & { cancel }` | Adia `fn` até `wait` ms sem novas chamadas (trailing-edge).        |
| `throttle(fn, wait)` | `<A>(fn: (...a: A) => void, wait: number) => ((...a: A) => void) & { cancel }` | Executa no máximo 1x por `wait` ms (leading + trailing edge).      |
| `once(fn)`           | `<A, R>(fn: (...a: A) => R) => (...a: A) => R`                                 | Roda `fn` só na primeira chamada; depois devolve o cache.          |
| `memoizeOne(fn)`     | `<A, R>(fn: (...a: A) => R) => (...a: A) => R`                                 | Memoiza apenas a última chamada (args comparados com `Object.is`). |

```ts
import { debounce, throttle, once, memoizeOne } from "tempest-react-sdk";

const save = debounce((q: string) => search(q), 300);
save("a");
save("ab");
save("abc"); // só "abc" roda após 300ms
save.cancel(); // cancela a chamada pendente

const onScroll = throttle(() => render(), 200);
window.addEventListener("scroll", onScroll);

const init = once(() => expensiveSetup());
init(); // roda
init(); // devolve o mesmo resultado, sem re-rodar

const select = memoizeOne((a: number, b: number) => a + b);
select(1, 2); // calcula 3
select(1, 2); // cache 3
select(2, 2); // recalcula 4
```

!!! note "`memoizeOne` lembra só do último"
    Diferente de um cache LRU — qualquer lista de argumentos diferente recomputa e substitui o cache. Ideal pra selectors derivados de props.

---

## Promises

| Função                           | Assinatura                                                             | O que faz                                                      |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `sleep(ms)`                      | `(ms: number) => Promise<void>`                                        | Resolve depois de `ms` milissegundos.                          |
| `withTimeout(promise, ms, msg?)` | `<T>(promise: Promise<T>, ms: number, message?: string) => Promise<T>` | Corre `promise` contra um timeout; rejeita com `TimeoutError`. |

```ts
import { sleep, withTimeout } from "tempest-react-sdk";

await sleep(500); // pausa meio segundo

try {
  await withTimeout(fetch("/slow"), 3000, "request too slow");
} catch (error) {
  // error.name === "TimeoutError" quando estourou os 3s
}
```

---

## IDs

| Função              | Assinatura                    | O que faz                                                         |
| ------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `randomId(prefix?)` | `(prefix?: string) => string` | Id resistente a colisão (usa `crypto.randomUUID()` com fallback). |

```ts
import { randomId } from "tempest-react-sdk";

randomId(); // "9f1c2b3a-..." (uuid) ou "lq3f8k-4a9z1" (fallback)
randomId("user"); // "user-9f1c2b3a-..."
```

!!! tip "Bom pra keys de UI"
    Use em listas geradas no cliente quando não há id estável vindo do servidor. Para ids persistidos, prefira o id real do backend.

---

## Strings

| Função                            | Assinatura                                                     | O que faz                                                     |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `capitalize(value)`               | `(value: string) => string`                                    | Maiúscula só no primeiro caractere.                           |
| `camelCase(value)`                | `(value: string) => string`                                    | Converte pra `camelCase`.                                     |
| `kebabCase(value)`                | `(value: string) => string`                                    | Converte pra `kebab-case` (quebra também em `camelCase`).     |
| `pluralize(count, singular, pl?)` | `(count: number, singular: string, plural?: string) => string` | Escolhe singular/plural pela contagem (devolve só a palavra). |

```ts
import { capitalize, camelCase, kebabCase, pluralize } from "tempest-react-sdk";

capitalize("hello world"); // "Hello world"

camelCase("foo-bar_baz"); // "fooBarBaz"
camelCase("API response"); // "apiResponse"

kebabCase("helloWorld"); // "hello-world"
kebabCase("APIResponse"); // "api-response"

pluralize(1, "item"); // "item"
pluralize(3, "item"); // "items"
pluralize(2, "person", "people"); // "people"
```

!!! note "Pré-existentes — `slugify` e `truncate`"
    Já presentes no módulo de strings: `slugify(input)` gera um slug URL-safe (`"São Paulo / Centro"` → `"sao-paulo-centro"`), e `truncate(input, max, suffix?)` corta texto em `max` caracteres acrescentando `…` (ou o `suffix` informado).

---

## Números

| Função                             | Assinatura                                     | O que faz                                                  |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `formatBytes(bytes, decimals?)`    | `(bytes: number, decimals?: number) => string` | Tamanho legível em B/KB/MB/GB/TB (base 1024).              |
| `formatCompactNumber(value, loc?)` | `(value: number, locale?: string) => string`   | Notação compacta (`1.2K`, `3.4M`) via `Intl.NumberFormat`. |

```ts
import { formatBytes, formatCompactNumber, clamp } from "tempest-react-sdk";

formatBytes(0); // "0 B"
formatBytes(1536); // "1.5 KB"
formatBytes(1536, 2); // "1.50 KB"

formatCompactNumber(1234); // "1.2K"
formatCompactNumber(5600000); // "5.6M"
formatCompactNumber(1234, "pt-BR"); // "1,2 mil"
```

!!! note "Pré-existente — `clamp`"
    `clamp(value, min, max)` prende um número no intervalo `[min, max]` (e tolera `min > max`, trocando os limites). `clamp(120, 0, 100)` → `100`.

---

## Recap

- Importe qualquer helper direto de `tempest-react-sdk` — todos são exports nomeados, puros e tree-shakable.
- **Arrays/Objetos**: `groupBy`, `uniqueBy`, `chunk`, `range`, `pick`, `omit`, `deepMerge`, `isEmpty` — sempre imutáveis; `deepMerge` substitui arrays em vez de fundir.
- **Guards**: `isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever` — narrowing seguro + exaustividade em `switch`.
- **Funções**: `debounce`/`throttle` (com `.cancel()`), `once`, `memoizeOne` para controlar execução.
- **Promises/IDs/Strings/Números**: `sleep`, `withTimeout`, `randomId`, `capitalize`/`camelCase`/`kebabCase`/`pluralize`, `formatBytes`/`formatCompactNumber`.

## Veja também

- [Hooks utilitários](./hooks.md) — `useDebounce` é a versão React de `debounce`.
- [Utilitários & headless](./components/utility.md) — componentes que embrulham parte desses helpers (`Money`, `RelativeTime`).
