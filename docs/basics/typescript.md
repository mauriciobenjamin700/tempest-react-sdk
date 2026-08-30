# TypeScript: o mínimo que o SDK usa

!!! tip "Pule esta página se você já sabe…"

    - ler uma assinatura com genérico (`<T>`) sem travar;
    - a diferença entre `interface` e `type`, e entre união e interseção;
    - o que `Omit`, `Pick` e `Partial` fazem;
    - por que `as` não é conversão e `unknown` é melhor que `any`.

## O problema

Você vê isto na documentação de um componente e para de ler:

```ts
export interface DatePickerProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "size"> {
    value: string;
    onChange: (value: string) => void;
}
```

Parece hostil. Mas a assinatura está dizendo uma coisa simples e útil: *"aceito
todos os atributos de um `<input>` do HTML, menos quatro, que eu redefino do meu
jeito."* Sem isso, você teria que descobrir na tentativa e erro quais props passam.

Esta página cobre exatamente o que aparece nas assinaturas públicas do SDK — nada
mais.

## Anotação de tipo

```ts
const nome: string = "Ana";
const idade: number = 34;
const ativo: boolean = true;
const tags: string[] = ["a", "b"];
const par: [string, number] = ["idade", 34];

function saudar(nome: string, formal: boolean = false): string {
    return formal ? `Prezado ${nome}` : `Oi ${nome}`;
}
```

Na maior parte dos casos você **não** escreve a anotação: o TypeScript infere.
Escreva onde importa — parâmetro, retorno de export público, e onde a inferência
erra.

## `interface` e `type`

```ts
interface Usuario {
    id: string;
    nome: string;
    email?: string; // opcional
    readonly criadoEm: Date; // não pode ser reatribuído
}

type Status = "ativo" | "inativo" | "bloqueado"; // união
type UsuarioComStatus = Usuario & { status: Status }; // interseção
```

- **União** (`|`) — "um **ou** o outro". `Status` só aceita aquelas três strings, e
  o editor as autocompleta.
- **Interseção** (`&`) — "tudo dos dois ao mesmo tempo".

`interface` pode ser estendida e reaberta; `type` faz união, interseção e tipos
computados. Na prática: `interface` para o formato de um objeto, `type` para o
resto.

## Genéricos

Um genérico é um **parâmetro de tipo** — o tipo que entra decide o que sai:

```ts
function primeiro<T>(itens: T[]): T | undefined {
    return itens[0];
}

const n = primeiro([1, 2, 3]); // number | undefined
const s = primeiro(["a", "b"]); // string | undefined
```

Sem genérico você teria `any[] → any`, e perderia a informação exatamente onde ela
era útil. É por isso que o cliente HTTP do SDK é `api.get<Usuario[]>("/users")`:
você diz o que espera, e o retorno vem tipado até o fim.

## Tipos utilitários

Os quatro que aparecem no SDK:

```ts
interface Usuario {
    id: string;
    nome: string;
    email: string;
    senha: string;
}

type UsuarioPublico = Omit<Usuario, "senha">; // tudo menos `senha`
type Credenciais = Pick<Usuario, "email" | "senha">; // só esses dois
type UsuarioParcial = Partial<Usuario>; // tudo opcional
type UsuarioFixo = Required<UsuarioParcial>; // tudo obrigatório de novo
```

Agora a assinatura da abertura se lê sozinha: `Omit<InputHTMLAttributes<...>,
"type" | "value" | "onChange" | "size">` é "os atributos de um input HTML, sem
esses quatro".

!!! info "O `size` daquele `Omit` conserta um bug real"

    `HTMLInputElement.size` é um `number` (a largura do campo em caracteres). O
    `<Input>` do SDK define `size` como uma união de tamanhos —
    `"sm" | "md" | "lg"`. Um componente que repassasse
    `...InputHTMLAttributes` para o `<Input>` colidiria nos dois: o `number` do DOM
    contra a união do SDK. Por isso o `DatePicker` remove `size` antes de estender.
    Um `Omit` numa assinatura pública quase sempre está registrando uma colisão
    dessas.

## `unknown`, `any` e `as`

```ts
const dado: unknown = JSON.parse(texto);

// ❌ any desliga a checagem — e o erro reaparece em runtime
const u1 = dado as any;
u1.qualquer.coisa.aqui; // compila, quebra no browser

// ✅ unknown obriga a estreitar antes de usar
if (typeof dado === "object" && dado !== null && "nome" in dado) {
    console.log(dado.nome);
}
```

!!! danger "`as` não converte nada"

    `valor as Usuario` não checa, não valida e não transforma: é você **afirmando**
    ao compilador que sabe mais do que ele. Se a afirmação for falsa, o erro aparece
    em runtime, longe do `as`. Use quando você tem uma garantia externa real; para
    dado que vem da rede, valide com zod — é exatamente o que o schema de
    [Forms (zod)](../forms.md) faz.

## `import type`

```ts
import type { Usuario } from "./tipos"; // some no build
import { criarUsuario } from "./api"; // fica no bundle
```

Tipo não existe em runtime. Marcar o import com `type` deixa isso explícito e
garante que o bundler não mantenha o módulo vivo só por causa dele.

## Onde isso aparece no SDK

Toda superfície pública do `tempest-react-sdk` é tipada, e o barrel reexporta valor
e tipo lado a lado:

```ts
import { createApiClient, isApiError } from "tempest-react-sdk";
import type { ApiClientConfig, ApiError } from "tempest-react-sdk";

const config: ApiClientConfig = {
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => localStorage.getItem("token") ?? undefined,
};

const api = createApiClient(config);
const usuarios = await api.get<Usuario[]>("/users"); // Usuario[], não any
```

!!! tip "Uma flag que o SDK mediu e decidiu **não** ligar"

    `noUncheckedIndexedAccess` faz `array[0]` ter tipo `T | undefined`. Soa
    correto, e no SDK produziu 221 erros — quase todos em acesso dentro de laço
    limitado pelo próprio `length` ou protegido por invariante já defendida. Adotar
    trocaria 221 guardas reais por 221 `!`, que é justamente o operador que a flag
    existe para evitar. A varredura valeu como **auditoria** (achou um defeito real
    e ele virou `throw`); ligar a flag, não. O critério de tipagem que o SDK de
    fato aplica está em [Tipagem forte](../design/typing.md).

## Recap

- Você anota onde importa: parâmetro, retorno público, e onde a inferência erra. ✅
- União (`|`) é "um ou outro"; interseção (`&`) é "os dois".
- Genérico é parâmetro de tipo — `api.get<Usuario[]>` é o que faz o retorno chegar
  tipado.
- `Omit`/`Pick`/`Partial` recortam tipos existentes; um `Omit` público costuma
  registrar uma colisão real.
- `as` não converte, apenas afirma; prefira `unknown` + estreitamento, ou zod para
  dado de rede.
- `import type` some do bundle.

📚 **Referência canônica:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

➡️ **Próxima página:** [React: componente, estado, efeito](react.md)
