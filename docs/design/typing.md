# Tipagem forte

TypeScript não é "JavaScript com autocomplete". É a única ferramenta que verifica
o desenho do seu app **sem rodar o app**. Quanto mais estreito o tipo, mais bug
ele pega de graça.

O objetivo desta página: fazer o compilador recusar o estado errado, em vez de
você revisar o estado errado.

## Regra zero: zero `any`

```js
"@typescript-eslint/no-explicit-any": "error"
```

`any` desliga o compilador. Pior: ele **vaza** — uma variável `any` contamina
tudo que toca nela, e o erro aparece três arquivos depois, em runtime.

Não existe caso legítimo. Existem dois substitutos:

| Situação                                 | Use                                        |
| ---------------------------------------- | ------------------------------------------ |
| Não sei o que é (resposta de rede, `JSON.parse`) | **`unknown`** + validação            |
| Aceito qualquer objeto                   | `Record<string, unknown>`                  |
| Genérico de verdade                      | `<T>` com constraint                        |

```ts
// ❌ any: o erro vai aparecer em outro arquivo
function handle(payload: any) {
  return payload.user.name.toUpperCase();
}

// ✅ unknown: o compilador exige que você prove a forma antes de usar
function handle(payload: unknown): string {
  const parsed = userSchema.parse(payload);
  return parsed.name.toUpperCase();
}
```

!!! danger "`as` é `any` com outro nome"
    `payload as User` não verifica nada — é você prometendo. `as` só é aceitável
    em três lugares: `as const`, estreitar `unknown` **depois** de um type guard,
    e contornar limitação conhecida de tipagem de lib (com JSDoc explicando).
    Fora disso, `as` é onde os bugs entram.

## Tipo derivado do schema, nunca escrito duas vezes

O erro mais comum em app com zod: escrever a `interface` e o schema
separados.

=== "❌ Errado"

    ```ts
    interface Order {
      id: string;
      status: string;
      totalCents: number;
    }

    const orderSchema = z.object({
      id: z.string(),
      status: z.string(),
      total_cents: z.number(), // ⚠️ divergiu e ninguém percebe
    });
    ```

=== "✅ Certo"

    ```ts
    export const orderSchema = z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
      totalCents: z.number().int().nonnegative(),
    });

    export type Order = z.infer<typeof orderSchema>;
    export type OrderStatus = Order["status"];
    ```

Uma fonte de verdade. Mudar o schema muda o tipo, e o compilador aponta cada lugar
que precisa acompanhar. Veja [Fluxo de dados](data-flow.md).

!!! tip "`z.enum` em vez de `z.string()`"
    `status: z.string()` aceita `"banana"`. `z.enum([...])` faz o `switch` no
    componente ficar exaustivo e o backend inventando valor novo virar erro na
    borda, não tela em branco.

## Union discriminada: o estado impossível deixa de existir

Este é o ganho mais alto de tipagem em app React, e o mais ignorado.

=== "❌ Errado — 8 combinações, 5 inválidas"

    ```ts
    interface OrderState {
      isLoading: boolean;
      data?: Order;
      error?: Error;
    }
    ```

    `{ isLoading: true, data: order, error: err }` compila. O que a tela mostra?

=== "✅ Certo — 3 estados, todos válidos"

    ```ts
    type OrderState =
      | { status: "loading" }
      | { status: "success"; data: Order }
      | { status: "error"; error: Error };
    ```

    ```tsx
    switch (state.status) {
      case "loading":
        return <Spinner />;
      case "success":
        return <OrderCard order={state.data} />; // `data` existe aqui, garantido
      case "error":
        return <ErrorState message={state.error.message} />;
    }
    ```

Dentro de cada `case`, o TypeScript sabe exatamente quais campos existem. Não tem
`state.data!`, não tem `if (!state.data) return null` defensivo.

### Exaustividade que o compilador cobra

```ts
/** Fails to compile when a new OrderState variant is added and not handled. */
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

switch (state.status) {
  case "loading":
    return <Spinner />;
  case "success":
    return <OrderCard order={state.data} />;
  case "error":
    return <ErrorState message={state.error.message} />;
  default:
    return assertNever(state);
}
```

Adicione `{ status: "empty" }` na union e o build **quebra** no `assertNever`,
apontando o lugar exato. É a diferença entre descobrir na compilação e descobrir
em produção.

## Props: modele o que é válido

O mesmo raciocínio nas props de componente:

```tsx
// ❌ permite `variant="link"` sem `href`, e `href` com onClick
interface ButtonProps {
  variant?: string;
  href?: string;
  onClick?: () => void;
}

// ✅ ou é link com href, ou é botão com onClick — nunca os dois
type ButtonProps =
  | { as: "link"; href: string; children: ReactNode }
  | { as?: "button"; onClick: () => void; children: ReactNode };
```

E para variantes, `union` de string em vez de booleanas — o padrão de todo
componente do SDK:

```ts
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
```

O autocomplete mostra as opções, o typo não compila, e não existe
`primary danger`.

## Os utilitários que valem decorar

```ts
type Order = { id: string; code: string; status: OrderStatus; totalCents: number };

type OrderPreview = Pick<Order, "id" | "code">;          // só esses campos
type OrderDraft = Omit<Order, "id">;                      // tudo menos id
type OrderPatch = Partial<Order>;                         // tudo opcional
type FullOrder = Required<OrderDraft>;                    // tudo obrigatório
type OrderReadonly = Readonly<Order>;                     // sem mutação
type OrdersById = Record<string, Order>;                  // mapa
type OrderStatus2 = Order["status"];                      // acesso indexado
type ListResult = Awaited<ReturnType<typeof listOrders>>; // tipo do retorno async
```

O padrão: **derive**, não redigite. Um `OrderDraft` escrito à mão sai de sincronia
com `Order` na primeira mudança; `Omit<Order, "id">` não sai nunca.

## `satisfies`: valida sem alargar {#satisfies}

```ts
// ❌ o tipo da const vira Record<string, string> — perde as chaves exatas
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

// ✅ valida que cobre todo OrderStatus E mantém as chaves literais
const STATUS_LABEL = {
  pending: "Pendente",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
} satisfies Record<OrderStatus, string>;
```

Com `satisfies` você ganha as duas coisas: se faltar um status, erro de
compilação; e `typeof STATUS_LABEL` continua sabendo as chaves exatas para
autocomplete e para derivar tipos.

!!! tip "Tabela de lookup mata `switch` gigante"
    `STATUS_LABEL[status]` substitui cinco `case`. E com `satisfies`, adicionar um
    status novo à union **obriga** a preencher a tabela. Esse par
    (`union` + `satisfies Record<>`) é o jeito mais barato de fazer o compilador
    cobrar completude.

## Genérico com constraint, não genérico solto

```ts
// ❌ T não garante nada — `item.id` pode não existir
function indexById<T>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.id, i])); // erro ou any
}

// ✅ a constraint documenta o requisito e o compilador cobra
function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
```

Constraint é documentação executável: quem chamar com `{ uuid: string }[]` recebe
erro na chamada, com a mensagem certa.

## Nulo explícito

`undefined` implícito é o `NullPointerException` do TypeScript. Deixe `strict`
ligado (o template já deixa) e trate na borda:

```ts
// ✅ o tipo diz que pode não achar; quem chama é obrigado a tratar
export async function findOrder(id: string): Promise<Order | null> {
  const raw = await api.get<unknown>(`/orders/${id}`).catch(() => null);
  return raw === null ? null : parseResponse(orderSchema, raw, "findOrder");
}
```

E do lado que usa, prefira early return a `?.` em cascata:

```tsx
if (!order) return <EmptyState title="Pedido não encontrado" />;
// daqui pra baixo `order` é Order, sem `?.` em nenhuma linha
```

!!! warning "`!` (non-null assertion) é promessa, não verificação"
    `order!.code` é você garantindo ao compilador algo que ele não conseguiu
    provar. Quando você estiver certo, funciona; quando estiver errado, é
    `undefined` em produção. Use early return.

## Coleção vazia é `[]`, não `null`

```ts
// ✅
function listOrders(): Promise<Order[]>;          // sem resultado → []
interface OrderResponse { items: Order[] }         // default: []

// ❌
function listOrders(): Promise<Order[] | null>;    // agora todo caller checa null
```

"Nenhum resultado" é um resultado bem-sucedido. Devolver `[]` faz o `.map()` do
componente funcionar sem `if`, e é a convenção que o backend Tempest também segue.

## Onde checar

```bash
npx tsc -b --noEmit     # inclui os testes — bug de tipo em teste também é bug
npx tempest lint
npx tempest doctor      # checa tsconfig strict, alias, env, CSS
```

O `typecheck` é o gate mais barato do CI: roda em segundos e pega o que nenhum
teste pegaria sem escrever o caso.

## Recap

- **Zero `any`.** `unknown` na borda + validação; `as` só em três casos raros.
- Tipo **derivado** do schema zod (`z.infer`), nunca escrito duas vezes.
- **Union discriminada** apaga o estado impossível; `assertNever` cobra
  exaustividade no build.
- Props modelam o que é válido: `union` de string, não booleana; variantes
  mutuamente exclusivas em union de objetos.
- Derive com `Pick`/`Omit`/`Partial`/`ReturnType`; valide com `satisfies`.
- Genérico com **constraint**; nulo explícito com early return; coleção vazia é
  `[]`.

Próxima: [Estratégia de testes](testing.md).
