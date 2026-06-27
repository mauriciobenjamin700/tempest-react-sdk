# Tutorial — Estado

Na página anterior, o guard do dashboard leu `useAuth.getState().isAuthenticated`
— mas a store `useAuth` ainda não existe. Vamos criá-la agora. De passagem, você
aprende as duas peças de estado do SDK: `createStore` (uma store genérica) e
`createAuthStore` (a store de autenticação pronta), ambas em cima do
[Zustand](https://github.com/pmndrs/zustand), com `createSelectors` por cima.

Estado é tudo que vive **fora** de um único componente e precisa ser lido em
vários lugares: a sessão do usuário, um filtro de tarefas, um contador. É disso
que esta página trata.

## `createStore` — uma store genérica

Comece pelo mais simples. `createStore` recebe um _initializer_ no estilo Zustand
`(set) => estado` e devolve um hook ligado. Vamos guardar o filtro da lista de
tarefas:

```ts
// src/stores/filter.ts
import { createStore } from "tempest-react-sdk";

type Filter = "all" | "active" | "done";

interface FilterState {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}

export const useFilter = createStore<FilterState>((set) => ({
  filter: "all",
  setFilter: (filter) => set({ filter }),
}));
```

Dentro de um componente, você usa como qualquer hook Zustand — passando um
**seletor** pra ler só o pedaço que importa:

```tsx
// src/components/FilterTabs.tsx
import { useFilter } from "@/stores/filter";

export function FilterTabs() {
  const filter = useFilter((s) => s.filter);
  const setFilter = useFilter((s) => s.setFilter);

  return (
    <div>
      <button onClick={() => setFilter("all")} disabled={filter === "all"}>
        Todas
      </button>
      <button onClick={() => setFilter("active")} disabled={filter === "active"}>
        Ativas
      </button>
      <button onClick={() => setFilter("done")} disabled={filter === "done"}>
        Concluídas
      </button>
    </div>
  );
}
```

`useFilter((s) => s.filter)` assina **só** `filter` — se outra fatia do estado
mudar, este componente não re-renderiza.

## `createSelectors` — um hook por campo

Escrever `(s) => s.filter` inline em todo lugar é repetitivo, e é fácil escorregar
e escrever `const state = useFilter()` — o que assina a store **inteira** e
re-renderiza sempre que **qualquer** campo muda. `createSelectors` resolve isso:
você envolve a store e ganha um namespace `.use` com um hook por campo.

```ts
// src/stores/filter.ts
import { createStore, createSelectors } from "tempest-react-sdk";

type Filter = "all" | "active" | "done";

interface FilterState {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}

export const useFilter = createSelectors(
  createStore<FilterState>((set) => ({
    filter: "all",
    setFilter: (filter) => set({ filter }),
  })),
);
```

Agora cada campo é um hook próprio sob `.use`:

```tsx
// src/components/FilterTabs.tsx
import { useFilter } from "@/stores/filter";

export function FilterTabs() {
  const filter = useFilter.use.filter(); // assina só `filter`
  const setFilter = useFilter.use.setFilter();
  // ...mesmos botões de antes...
}
```

!!! tip "Por que isso importa pra performance"

    `useFilter.use.filter()` assina **só** `filter`. Num app com muitas fatias de
    estado, um componente que só mostra o filtro não re-renderiza quando a lista
    de tarefas muda. Você ganha a granularidade de seletor sem digitar funções de
    seletor à mão. ✅

## `createAuthStore` — a store de autenticação pronta

A sessão do usuário tem sempre a mesma forma: `user`, `token`, `isAuthenticated`,
e ações `setSession` / `logout`. O SDK já entrega isso pronto e **persistido** com
`createAuthStore`. Você só informa o **formato do seu usuário** (`TUser`) — o SDK
não é dono do seu modelo de usuário.

```ts
// src/stores/auth.ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(
  createAuthStore<User>({ name: "app-auth", storage: "local" }),
);
```

- `createAuthStore<User>` cria a store Zustand de auth já com `persist`.
- `name: "app-auth"` é a chave usada no storage.
- `storage: "local"` usa `localStorage` (sobrevive entre sessões); `"session"`
  usaria `sessionStorage`.
- `createSelectors(...)` dá os hooks por campo via `useAuth.use.<campo>()`.

O estado e as ações disponíveis:

| Campo / ação      | Tipo                                         | O que faz                                          |
| ----------------- | -------------------------------------------- | -------------------------------------------------- |
| `user`            | `User \| null`                               | O usuário logado, ou `null`.                       |
| `token`           | `string \| null`                             | O token de acesso atual.                           |
| `isAuthenticated` | `boolean`                                    | Derivado de `!!token`.                             |
| `setSession`      | `(s: { user: User; token: string }) => void` | Loga: grava usuário + token de uma vez.            |
| `setUser`         | `(user: User \| null) => void`               | Atualiza só o usuário.                             |
| `setToken`        | `(token: string \| null) => void`            | Atualiza só o token (re-deriva `isAuthenticated`). |
| `logout`          | `() => void`                                 | Desloga: limpa usuário, token e flag.              |

!!! note "Reidratação automática"

    Como a store é persistida, ao recarregar a página o SDK lê o payload salvo no
    `localStorage` e restaura `user` + `token`, re-derivando `isAuthenticated` de
    `!!token`. O usuário continua logado entre reloads — sem código extra.

## Lendo a store num componente

Dentro de um componente React, use os hooks `.use` pra que a UI re-renderize
quando o auth mudar:

```tsx
// src/layouts/RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function RootLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  const user = useAuth.use.user();
  const logout = useAuth.use.logout();

  return (
    <div>
      <nav>
        <Link to="/">Tarefas</Link>
        {isAuthenticated ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <span>Olá, {user?.name}</span>
            <button onClick={logout}>Sair</button>
          </>
        ) : (
          <Link to="/login">Entrar</Link>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

## Lendo a store fora do React — `getState()`

Nem todo código que precisa do estado é um componente. O guard de rota da página
anterior roda **fora** da árvore React e não pode chamar hooks. Para esses casos,
use `getState()` no hook ligado — um snapshot pontual, sem assinatura:

```ts
// trecho do guard, da página de roteamento
guard: () => useAuth.getState().isAuthenticated,
```

!!! warning "`getState()` não assina — use só fora do React"

    `getState()` lê uma vez e **não** re-renderiza nada quando o estado muda
    depois. Dentro de componentes, prefira sempre o hook (`useAuth.use.campo()`)
    para a UI ficar em sincronia. Reserve `getState()` para guards de rota,
    interceptors de HTTP e outros códigos fora da árvore React.

## Recap

- **`createStore<T>(initializer, options?)`** cria uma store Zustand genérica;
  leia com um seletor (`useStore((s) => s.campo)`) pra assinar só o que importa.
- **`createSelectors(store)`** adiciona o namespace `.use`, com um hook por campo
  (`useStore.use.campo()`) → menos re-renders, sem digitar seletores. ✅
- **`createAuthStore<TUser>({ name, storage })`** é a store de auth pronta e
  **persistida**, com `user` / `token` / `isAuthenticated` / `setSession` /
  `setToken` / `setUser` / `logout`. Você só define o `TUser`.
- Dentro de componentes, leia com `.use.campo()`; fora do React (guards,
  interceptors), leia com `getState()` — snapshot sem assinatura.
- Ambas são Zustand por baixo, então `createSelectors` e `getState()` funcionam
  igual nas duas.

➡️ **Próxima página:** [Buscando dados — providers, cliente HTTP e React Query](data-fetching.md)
