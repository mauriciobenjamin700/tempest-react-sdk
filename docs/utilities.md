# Utilitários

Coleção de funções puras, sem dependência de React, pra resolver as tarefas chatas do dia a dia — agrupar listas, mesclar objetos, debouncar callbacks, formatar bytes. Tudo é importado direto de `tempest-react-sdk` e funciona em qualquer ambiente JS (browser, Node, worker).

```ts
import { groupBy, pick, debounce, formatBytes } from "tempest-react-sdk";
```

!!! tip "Tree-shaking"
    Cada função é um export nomeado independente. Importe só o que usar — o bundler do seu app remove o resto.

---

<!-- gallery:utils -->
[![Formatters na gallery](assets/gallery/utils.webp)](gallery.md)

*Seção `utils` da [gallery](gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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

interface Settings {
  a: number;
  nested: { x: number; y: number; z?: number };
}

const base: Settings = { a: 1, nested: { x: 1, y: 2 } };

deepMerge(base, { nested: { x: 1, y: 20, z: 30 } });
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
| `percentOf(part, total)`           | `(part: number, total: number) => number`      | Percentual 0–100, com base zero devolvendo `0`.            |

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

!!! danger "`percentOf` existe pelo `NaN%`, não pela divisão"
    `(ativos / total) * 100` com `total === 0` produz `NaN`, e `NaN%` no painel vazio é a forma mais comum de um dashboard anunciar que ainda não tem dado. `percentOf(5, 0)` é `0`; não-finito também vira `0`.
    Ele **não** limita em 100 — 150% de uma meta é dado real que alguém quer ver.
    Cuidado com o par: `formatPercent` recebe **fração** (0–1), então é `formatPercent(percentOf(a, b) / 100)`.

---

## Data para `<input type="date">` — `formatDateForInput`

`formatDate` produz `dd/MM/yyyy`, que um `<input type="date">` rejeita — ele exige `yyyy-MM-dd`. Todo formulário com data reescreve esse recorte, e reescreve errado.

```ts
import { formatDateForInput } from "tempest-react-sdk";

formatDateForInput(new Date(2026, 4, 16)); // "2026-05-16"
formatDateForInput("2026-05-16"); // "2026-05-16"
formatDateForInput("não é data"); // "" — o input lê como "sem valor"
```

!!! danger "`toISOString().slice(0, 10)` erra o dia, e erra só à noite"
    É o reflexo de todo mundo, e `toISOString` converte pra UTC antes: em UTC-3, qualquer horário depois das 21h reporta o **dia seguinte**. O formulário abre na data errada só pra quem mexe à noite, que é o pior tipo de bug pra reproduzir. `formatDateForInput` monta a data pelas partes **locais**.

!!! warning "String `yyyy-MM-dd` volta intacta — e isso é essencial, não atalho"
    `new Date("2026-05-16")` é meia-noite **UTC**, que em UTC-3 é dia 15 às 21h. Sem esse desvio, devolver ao input exatamente o valor que o backend mandou o moveria um dia pra trás.

---

## Data e hora para `<input type="datetime-local">` — `formatDateTimeForInput`

O irmão do anterior, para o campo que guarda **quando**, não só **qual dia**. A armadilha é idêntica — e aqui ela cobra a hora junto com a data.

```ts
import { formatDateTimeForInput } from "tempest-react-sdk";

formatDateTimeForInput(new Date(2026, 4, 16, 14, 30)); // "2026-05-16T14:30"
formatDateTimeForInput("2026-05-16T14:30"); // "2026-05-16T14:30"
formatDateTimeForInput("2026-05-16T14:30:45"); // "2026-05-16T14:30" — segundos caem
formatDateTimeForInput("não é data"); // "" — o input lê como "sem valor"
```

Um agendamento que volta do backend em ISO com fuso preenche o campo sem deslocar:

```tsx
import { formatDateTimeForInput } from "tempest-react-sdk";

interface Appointment {
    id: string;
    /** ISO 8601 com fuso, como o backend serializa. */
    startsAt: string;
}

export function AppointmentForm({ appointment }: { appointment: Appointment }) {
    return (
        <form method="post">
            <label htmlFor="startsAt">Início</label>
            <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={formatDateTimeForInput(appointment.startsAt)}
            />
            <button type="submit">Salvar</button>
        </form>
    );
}
```

!!! danger "`toISOString().slice(0, 16)` erra a data **e** a hora"
    Mesma causa do irmão, dano maior: um horário das 22h em UTC-3 vira `2026-05-17T01:00` — o formulário abre no dia seguinte, de madrugada. `formatDateTimeForInput` monta tudo pelas partes **locais**.

!!! warning "String **com fuso** não volta intacta, e é de propósito"
    `"2026-05-16T14:30"` (ingênua) volta como está. `"2026-05-16T14:30:00Z"` **não** — é um instante diferente do que parece, então é convertido para o calendário local que o campo precisa mostrar. Só o formato exato `yyyy-MM-ddTHH:mm` pega o atalho.

!!! tip "Os segundos caem, e isso mantém o valor honesto"
    Um `datetime-local` anda de minuto em minuto a menos que o app defina `step`. Um `:ss` que o campo não representa seria descartado na primeira edição de qualquer jeito — truncar aqui faz o valor exibido e o valor submetido serem o mesmo.

---

## Planilhas `.xlsx` — `writeXlsx`

Exportar dados como CSV parece simples até um acento virar `Ã©` no Excel. `writeXlsx(headers, rows)` gera um workbook Office Open XML (`.xlsx`) de uma aba direto em memória — UTF-8 de ponta a ponta, então acentos sobrevivem em Excel/LibreOffice/Google Sheets sem a fragilidade de BOM do CSV. A única dependência é o `fflate` (usado para deflate do pacote), já embutido no SDK.

```ts
import { writeXlsx } from "tempest-react-sdk";

const bytes = writeXlsx(
  ["Nome", "Score", "Observação"],
  [
    ["Ada", 99, "aprovada"],
    ["Alan", 87, null], // null vira célula vazia
  ],
);

const blob = new Blob([bytes], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
```

- `headers: string[]` — a primeira linha (cabeçalho).
- `rows: (string | number | null)[][]` — cada valor vira uma célula: `number` usa o tipo nativo `"n"` (o app de planilha reconhece como número), `null` (ou `""`) vira célula vazia, o resto é string inline.
- Retorna os bytes do arquivo como `Uint8Array`.

O XML é enxuto de propósito: strings inline (sem tabela de shared-strings), sem estilos, sem merge. É um escritor **genérico** — mapeie seus registros de domínio para `headers`/`rows` na camada da sua aplicação.

!!! tip "Do byte ao usuário"
    Combine com [`shareOrDownloadBlob`](./share.md#exportar-um-arquivo-shareordownloadblob): `writeXlsx` → `new Blob([...])` → `shareOrDownloadBlob(blob, "dados.xlsx")` abre a sheet nativa no celular e baixa no desktop.

---

## CSV — `toCsv` e `downloadCsv`

O `.xlsx` é o formato certo pra quem vai **abrir** a planilha. CSV é o formato certo pra quem vai **importar** o arquivo em outro sistema — e é o que quase todo painel acaba escrevendo na mão, errando sempre nos mesmos dois pontos: um nome com vírgula parte a linha, e um nome com aspas quebra justamente a proteção que as aspas deveriam dar.

```ts
import { toCsv, downloadCsv, type CsvColumn } from "tempest-react-sdk";

const COLUNAS: CsvColumn<Usuario>[] = [
  { key: "nome", header: "Nome" },
  { key: "email", header: "E-mail" },
  { key: "plano", header: "Plano", csv: (u) => u.plano?.label ?? "" },
];

const texto = toCsv(usuarios, COLUNAS); // string pronta
await downloadCsv(usuarios, COLUNAS, "usuarios.csv"); // entrega ao usuário
```

| Assinatura | O que faz |
| --- | --- |
| `toCsv(rows, columns, options?)` | Devolve o arquivo inteiro como `string`. |
| `downloadCsv(rows, columns, fileName?, options?)` | Monta o blob `text/csv;charset=utf-8` e passa pro `shareOrDownloadBlob`. |
| `CsvColumn<T>` | `{ key, header, csv? }` |
| `CsvOptions` | `{ delimiter?: "," \| ";", bom?: boolean }` — defaults `","` e `true`. |

!!! danger "A coluna do `DataTable` **não** serve direto quando tem `render`"
    `DataTableColumn.render` devolve `ReactNode`. Exportar isso escreve `[object Object]` justamente na coluna que tem badge, link ou data formatada — a mais importante da tabela. Uma coluna **sem** `render` é estruturalmente compatível e pode ser reaproveitada; com `render`, dê o acessor `csv`.

!!! check "Escaping RFC 4180, e o BOM que o Excel pt-BR exige"
    Campo com o delimitador, com aspas ou com quebra de linha vira campo citado, e cada aspas interna é duplicada. O arquivo termina as linhas com `\r\n`. O BOM vem por padrão porque sem ele o Excel em pt-BR lê UTF-8 como Latin-1 e todo acento vira mojibake.

!!! tip "Delimitador `;` é o certo em locale pt-BR"
    Onde o separador decimal é a vírgula, o Excel abre um CSV separado por vírgula **em uma coluna só**. `{ delimiter: ";" }` resolve — e o escaping acompanha, citando o campo que contém `;` em vez do que contém `,`.

!!! info "`0` e `false` são exportados; `null` e `undefined` viram campo vazio"
    Vazio é ausência, não falsidade. Tratar `0` como vazio é como um relatório passa a sub-reportar toda linha que legitimamente vale zero. `Date` sai em ISO, que qualquer sistema reimporta sem adivinhar formato.

!!! note "Lista vazia gera o cabeçalho, não um arquivo vazio"
    Quem abre precisa ver quais colunas pediu. Arquivo de zero byte parece erro de exportação.

---

## Storage comprimido — `compressedStorage`

`localStorage` dá cerca de **5 MB por origem** e cobra **dois bytes por caractere**. Um app offline-first que guarda estado de verdade — um save de jogo, um rascunho longo, um cache de catálogo — bate nesse teto antes do que parece, e o sintoma é um `QuotaExceededError` no meio de uma escrita, não um aviso.

`compressedStorage` é o mesmo wrapper tipado do `storage`, só que gzipando o que escreve:

```ts
import { compressedStorage } from "tempest-react-sdk";

compressedStorage.set("save", { level: 12, inventory: items });

const save = compressedStorage.get("save", null);
```

- `get<T>(key, fallback)` — descomprime e faz parse. Chave ausente, ilegível ou corrompida devolve `fallback`; nunca lança.
- `set<T>(key, value)` — comprime e grava.
- `remove(key)` — apaga a chave.

!!! tip "Mesma implementação dos dois, via `createJsonStorage`"
    `storage` e `compressedStorage` são a **mesma** função por baixo —
    `createJsonStorage(codec)` — então a superfície dos dois não pode divergir. Até
    a v0.44.0 o comprimido era uma cópia escrita à mão das mesmas guardas, e **não
    tinha `remove`**, enquanto a docstring dele prometia que os dois eram
    intercambiáveis no call site. Quem seguiu a promessa quebrou no primeiro
    `remove`.

    Codec próprio é o mesmo caminho:

    ```ts
    import { createJsonStorage } from "tempest-react-sdk";

    // Um store que cifra antes de gravar.
    const secrets = createJsonStorage({
      serialize: (value) => encrypt(JSON.stringify(value)),
      deserialize: (raw) => JSON.parse(decrypt(raw)),
    });
    ```

    Se o codec **lançar**, o valor é gravado como JSON puro em vez de descartado:
    registro maior ainda carrega, registro ausente não. Só um valor que nem JSON
    representa (referência circular) perde a escrita.

### O formato é autodescritivo

Cada valor gravado leva o prefixo `~tgz1:`. Isso resolve o problema chato de ligar compressão numa chave que já existe: uma leitura sem o marcador cai no `JSON.parse` normal, então **os dados que já estavam lá continuam legíveis**. Nada de migração, nada de save órfão.

O mesmo caminho cobre a escrita degradada: se a compressão falhar, o valor é gravado como JSON puro em vez de descartado — um registro maior ainda carrega, um ausente não.

!!! note "Por que base64, e não empacotar em UTF-16"
    Base64 gasta um terço a mais de caracteres que os bytes comprimidos, e o `localStorage` ainda cobra dois bytes por caractere em cima disso. Empacotar os bytes direto em code units UTF-16 seria mais denso, mas surrogates soltos não sobrevivem a toda implementação de storage nem a um round-trip de JSON — e um save que decodifica em lixo é muito pior que um save maior. Mesmo com essa folga, um JSON típico fica bem abaixo de um terço do tamanho original.

### Com `useLocalStorage`

Para estado React, passe o codec em vez de usar a API imperativa — você ganha a sincronia entre abas e o guard de SSR do hook de graça:

```ts
import { compressedStorageCodec, useLocalStorage } from "tempest-react-sdk";

const [save, setSave] = useLocalStorage("save", EMPTY_SAVE, compressedStorageCodec);
```

`compressToString` / `decompressFromString` também são exportados soltos, para quando o destino não é `localStorage` (um `POST` de backup, um `IndexedDB`).

!!! warning "Não é para tudo"
    Comprimir custa CPU nas duas pontas. Para uma preferência de tema ou um flag booleano, use o `storage` normal — o ganho é zero e o custo não. `compressedStorage` vale a partir de payloads na casa das dezenas de KB.

---

## Recap

- Importe qualquer helper direto de `tempest-react-sdk` — todos são exports nomeados, puros e tree-shakable.
- **Planilhas**: `writeXlsx(headers, rows)` gera um `.xlsx` UTF-8 de uma aba como `Uint8Array` (sem drama de BOM do CSV).
- **CSV**: `toCsv(rows, columns)` escreve o arquivo com escaping RFC 4180 e BOM; `downloadCsv(...)` entrega direto ao usuário.
- **Datas e percentuais**: `formatDateForInput` dá o `yyyy-MM-dd` que o `<input type="date">` exige e `formatDateTimeForInput` dá o `yyyy-MM-ddTHH:mm` do `<input type="datetime-local">` (os dois pelas partes locais, sem o desvio de UTC); `percentOf` devolve `0` em vez de `NaN` quando a base é zero.
- **Storage comprimido**: `compressedStorage.get/set` gzipa o que grava; formato autodescritivo (`~tgz1:`) lê valores antigos sem migração. Com React, `useLocalStorage(key, def, compressedStorageCodec)`.
- **Arrays/Objetos**: `groupBy`, `uniqueBy`, `chunk`, `range`, `pick`, `omit`, `deepMerge`, `isEmpty` — sempre imutáveis; `deepMerge` substitui arrays em vez de fundir.
- **Guards**: `isDefined`, `isString`, `isNumber`, `isPlainObject`, `assertNever` — narrowing seguro + exaustividade em `switch`.
- **Funções**: `debounce`/`throttle` (com `.cancel()`), `once`, `memoizeOne` para controlar execução.
- **Promises/IDs/Strings/Números**: `sleep`, `withTimeout`, `randomId`, `capitalize`/`camelCase`/`kebabCase`/`pluralize`, `formatBytes`/`formatCompactNumber`.

## Veja também

- [Hooks utilitários](./hooks.md) — `useDebounce` é a versão React de `debounce`.
- [Utilitários & headless](./components/utility.md) — componentes que embrulham parte desses helpers (`Money`, `RelativeTime`).
