# State (Zustand)

Toda aplicação precisa guardar estado que vive **fora** de um único componente: o carrinho de compras, as preferências do usuário, o passo atual de um wizard, a sessão de autenticação. O módulo `state` do `tempest-react-sdk` te dá duas peças pequenas em cima do [Zustand](https://github.com/pmndrs/zustand) para isso: `createStore` (uma fábrica genérica de store, com persistência opcional) e `createSelectors` (gera seletores por campo automaticamente, para menos re-renders).

A ideia é que você nunca mais escreva à mão o boilerplate de `persist` + `createJSONStorage` nem digite seletores um a um. Você descreve o estado, e o SDK cuida do resto. 🚀

!!! info "Já conhece o `createAuthStore`?"
    Se você leu a página de [Auth](auth.md), já viu o `createAuthStore<TUser>` — um store de autenticação **pronto e persistido**. O `createStore` é o **primo genérico** dele: serve para qualquer fatia de domínio (carrinho, preferências, wizard). Ambos são Zustand por baixo dos panos, então tudo que você aprender aqui vale para os dois.

## O que o Zustand te dá (e por que o SDK envolve)

Zustand é uma store mínima baseada em hooks: você cria um store com um _initializer_ `(set, get) => estado` e recebe de volta um hook (`useStore`) que componentes assinam. Quando o estado muda, só os componentes que leem aquele pedaço re-renderizam.

É excelente, mas no dia a dia você acaba reescrevendo dois pedaços de cerimônia repetidamente:

- **Persistência** — embrulhar o store no middleware `persist`, montar o `createJSONStorage`, escolher entre `localStorage` e `sessionStorage`, lembrar do `partialize`...
- **Seletores por campo** — para evitar re-renders, você quer ler um campo só (`useStore((s) => s.count)`). Fazer isso à mão, campo por campo, é verboso e fácil de errar.

O SDK colapsa esses dois pontos em opções declarativas. Você foca no formato do estado. 💡

## `createStore` — o store em memória

Vamos do mais simples. Sem opções, `createStore` é um store Zustand puro, **em memória** (some no reload). Você passa um initializer padrão do Zustand e recebe um hook ligado de volta.

```ts
import { createStore } from "tempest-react-sdk";

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useCounter = createStore<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}));
```

Dentro de um componente você usa como qualquer hook Zustand:

```tsx
function Counter() {
  const count = useCounter((s) => s.count);
  const increment = useCounter((s) => s.increment);
  return <button onClick={increment}>Cliquei {count} vezes</button>;
}
```

O hook devolvido também carrega os métodos estáticos do Zustand: `useCounter.getState()`, `useCounter.setState()` e `useCounter.subscribe()` (mais sobre `getState` no fim).

## `createStore` com persistência

Agora o pulo do gato. Passe `options.persist` e o SDK embrulha o store no middleware `persist` para você — escolhendo o storage, serializando em JSON e reidratando no carregamento da página.

Aqui está um carrinho que sobrevive a reloads:

```ts
import { createStore } from "tempest-react-sdk";

interface CartState {
  items: string[];
  add: (id: string) => void;
  clear: () => void;
}

export const useCart = createStore<CartState>(
  (set) => ({
    items: [],
    add: (id) => set((s) => ({ items: [...s.items, id] })),
    clear: () => set({ items: [] }),
  }),
  { persist: { name: "cart", partialize: (s) => ({ items: s.items }) } },
);
```

Recapitulando peça por peça:

- O **primeiro argumento** é o initializer Zustand de sempre — nada muda.
- O **segundo argumento** é `options`. Com `persist`, o store passa a salvar em storage.
- `name: "cart"` é a chave usada no storage. É obrigatória quando você persiste.
- `partialize: (s) => ({ items: s.items })` diz **o que** salvar — só `items`, não as funções.

### As opções de `persist`

| Opção        | Tipo                        | Default    | O que faz                                                    |
| ------------ | --------------------------- | ---------- | ------------------------------------------------------------ |
| `name`       | `string`                    | —          | Chave no storage (obrigatória).                              |
| `storage`    | `"local"` \| `"session"`    | `"local"`  | `localStorage` (persiste entre sessões) ou `sessionStorage`. |
| `partialize` | `(state) => Partial<T>`     | salva tudo | Seleciona quais campos serializar.                           |
| `version`    | `number`                    | —          | Versão do schema persistido — combine com `migrate`.         |
| `migrate`    | `(persisted, version) => T` | —          | Transforma um payload antigo no formato atual ao reidratar.  |

!!! tip "Sempre use `partialize` para campos transitórios"
    Estado derivado ou efêmero — um spinner `isLoading`, um `searchQuery` digitado agora, handlers — **não** deveria viver no storage. Se você persistir tudo, um `isLoading: true` salvo no meio de uma requisição pode reidratar travado em `true` no próximo reload. Liste em `partialize` só o que é fonte de verdade durável (aqui, `items`). ✅

### Reidratação entre reloads

Quando a página carrega, o middleware `persist` lê o payload salvo no storage e **funde** de volta no estado inicial. Concretamente, no exemplo do carrinho:

1. O usuário adiciona `"sku-1"` e `"sku-2"` → `items` vira `["sku-1", "sku-2"]` e é salvo em `localStorage["cart"]`.
2. O usuário recarrega a aba. O componente monta com o initializer (`items: []`).
3. O `persist` lê `localStorage["cart"]` e reidrata `items` para `["sku-1", "sku-2"]`.
4. Os componentes que assinam `items` re-renderizam com o carrinho restaurado.

Isso acontece de forma síncrona com storage web, então na primeira pintura o estado já está restaurado — sem flash de carrinho vazio.

!!! note "Versionando o schema persistido"
    Mudou o formato do estado salvo (renomeou um campo, trocou `string[]` por objetos)? Suba `version` e escreva um `migrate` que recebe o payload antigo e devolve o novo formato. Sem isso, um payload antigo no navegador de um usuário pode reidratar com um shape que seu código não espera mais.

## `createSelectors` — uma assinatura por campo

Por padrão, ler estado com `useStore((s) => s.count)` já assina só `count`. Mas escrever esse seletor inline em todo lugar é repetitivo, e é fácil escorregar e escrever `const state = useStore()` — o que assina o store **inteiro** e re-renderiza o componente sempre que **qualquer** fatia muda.

`createSelectors` resolve isso. Você passa um store ligado e recebe **o mesmo hook**, agora com um namespace `.use` contendo um hook de seletor memoizado por chave de topo do estado.

```ts
import { createStore, createSelectors } from "tempest-react-sdk";

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useCounter = createSelectors(
  createStore<CounterState>((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
    reset: () => set({ count: 0 }),
  })),
);
```

Agora cada campo vira um hook próprio sob `.use`:

```tsx
function Counter() {
  const count = useCounter.use.count(); // com createSelectors
  // equivale a: const count = useCounter((s) => s.count);  // Zustand puro
  return <span>{count}</span>;
}
```

`useCounter.use.count()` assina **só** `count`. Se outra fatia do estado mudar, este componente não re-renderiza. Você ganha a granularidade de seletor sem digitar funções de seletor.

!!! tip "Por que isso importa para performance"
    Em um store com muitos campos, um componente que só mostra `count` não deveria re-renderizar quando `items` muda. Os seletores por campo do `.use` dão exatamente esse isolamento — cada componente assina o mínimo que precisa, e re-renders viram localizados em vez de globais.

### Combinando com `createAuthStore`

Como `createAuthStore` também devolve um store Zustand ligado, você pode envolvê-lo com `createSelectors` da mesma forma:

```ts
// auto-seletores sobre um store de auth
import { createAuthStore, createSelectors } from "tempest-react-sdk";

interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(createAuthStore<User>({ name: "app-auth" }));

// em um componente:
//   const isAuthenticated = useAuth.use.isAuthenticated();
//   const logout = useAuth.use.logout();
```

Cada campo do estado de auth (`user`, `token`, `isAuthenticated`, `logout`, ...) vira um hook isolado sob `useAuth.use`.

## Lendo estado fora do React — `getState()`

Nem todo código que precisa de estado é um componente. Um interceptor de HTTP, um guard de rota, um utilitário — esses rodam fora da árvore React e não podem chamar hooks. Para eles, use `getState()` no hook ligado:

```ts
import { useAuth } from "./auth-store";

function requireAuth(): boolean {
  // Sem hook — leitura síncrona e pontual, fora do React.
  return useAuth.getState().isAuthenticated;
}
```

É exatamente assim que um guard de rota lê a sessão de auth: ele precisa do valor _agora_, uma vez, sem assinar para re-renders. `getState()` te dá um snapshot. (Para _reagir_ a mudanças fora do React, use `useStore.subscribe()`.)

!!! warning "`getState()` não assina"
    `getState()` lê uma vez e não re-renderiza nada quando o estado muda depois. Dentro de componentes, prefira sempre o hook (`useStore(...)` ou `useStore.use.campo()`) para que a UI se mantenha em sincronia. Reserve `getState()` para o código fora do React.

## Recap

- **`createStore<T>(initializer, options?)`** envolve o `create` do Zustand. Sem `options`, é um store puro em memória; com `options.persist`, ganha persistência sem boilerplate.
- **Opções de `persist`**: `name` (chave do storage, obrigatória), `storage` (`"local"` padrão ou `"session"`), `partialize` (escolha o que salvar — **sempre** exclua campos transitórios), `version` + `migrate` (evolução de schema).
- **Reidratação** é automática no carregamento: o payload salvo é fundido de volta no estado inicial.
- **`createSelectors(store)`** adiciona um namespace `.use` com um hook por campo; `useStore.use.campo()` assina só aquele campo → menos re-renders.
- **`getState()`** lê o estado fora do React (guards de rota, interceptors) — snapshot pontual, sem assinatura.
- **`createStore` é o genérico; `createAuthStore` é o de auth pronto.** Ambos são Zustand, então `createSelectors` e `getState()` funcionam igual nos dois.
