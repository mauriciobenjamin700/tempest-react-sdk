# Scaffold — `create-tempest-app`

`create-tempest-app` é a CLI oficial de scaffolding da Tempest. Com **um comando** você cria um app React 19 + Vite + TypeScript já pré-cabeado com o `tempest-react-sdk`: providers, roteamento, store de autenticação e cliente HTTP saem prontos pra rodar. É uma CLI Node **zero-dependency** publicada no npm — nada pra instalar globalmente, você sempre roda a versão mais recente.

Esta página é um tutorial: vamos do comando vazio até o app rodando no navegador, e depois passeamos por cada arquivo gerado pra entender qual recurso do SDK ele demonstra. 🚀

## Crie seu primeiro app

Escolha o gerenciador de pacotes que você já usa — todos chamam a mesma CLI:

```bash
npm create tempest-app my-app
```

```bash
npx create-tempest-app my-app
```

```bash
pnpm create tempest-app my-app
```

Os três fazem a mesma coisa: baixam a última versão da CLI e geram o projeto na pasta `my-app`.

!!! tip "Sem nome de projeto?"
Se você omitir o nome (`npm create tempest-app`), a CLI vai **perguntar** interativamente. O valor padrão sugerido é `my-tempest-app` — é só apertar Enter pra aceitar.

!!! warning "A pasta de destino precisa estar vazia"
O diretório alvo **não pode existir** ou precisa estar **vazio**. Isso evita sobrescrever um projeto seu por acidente. Se a pasta já tem arquivos, a CLI aborta sem tocar em nada — apague-a ou escolha outro nome.

## Rode o app

Assim que o scaffold termina, são quatro passos até ver a tela inicial:

```bash
cd my-app
npm install
cp .env.example .env
npm run dev
```

Abra **<http://127.0.0.1:5173>** — o app já está no ar com providers, rotas e store funcionando.

!!! info "O `.env`"
O `.env.example` declara `VITE_API_URL`, a base usada pelo cliente HTTP em `src/lib/api.ts`. Copie pra `.env` e ajuste pra apontar pro seu backend.

### Scripts disponíveis

O `package.json` gerado vem com quatro scripts:

| Script              | O que faz                                             |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | `vite` — dev server em `127.0.0.1:5173`               |
| `npm run build`     | `tsc --noEmit && vite build` — checa tipos e empacota |
| `npm run preview`   | `vite preview` — serve o build de produção            |
| `npm run typecheck` | `tsc --noEmit` — só checagem de tipos                 |

## Tour pelo que foi gerado

O projeto gerado é enxuto de propósito: cada arquivo existe pra **demonstrar um recurso do SDK** que você vai reaproveitar. Esta é a estrutura completa:

```text
my-app/
├── index.html
├── package.json          # deps: react, react-dom, tempest-react-sdk; devDeps: vite, @vitejs/plugin-react, typescript, @types/*
├── tsconfig.json         # alias @ -> ./src em "paths"
├── vite.config.ts        # export default createViteConfig()
├── .env.example          # VITE_API_URL
├── .gitignore
└── src/
    ├── main.tsx          # createRoot + "tempest-react-sdk/styles.css" + <App/>
    ├── App.tsx           # <AppProviders> envolvendo <AppRouter routes fallback/>
    ├── routes.tsx        # defineRoutes([...]) com index, login e dashboard lazy + protegido
    ├── layouts/RootLayout.tsx   # nav (Link) + <Outlet/>, lê useAuth.use.isAuthenticated()
    ├── pages/Home.tsx
    ├── pages/Login.tsx          # fakeia uma sessão via useAuth.use.setSession() e navigate("/dashboard")
    ├── pages/Dashboard.tsx      # export default (lazy), rota protegida
    ├── stores/auth.ts           # createSelectors(createAuthStore<User>({ name: "app-auth" }))
    └── lib/api.ts               # createApiClient({ baseURL, getToken, onUnauthorized }) + createQueryKeys
```

### Cada arquivo → o recurso do SDK que ele mostra

| Arquivo              | Recurso do SDK demonstrado                                   |
| -------------------- | ------------------------------------------------------------ |
| `vite.config.ts`     | `createViteConfig` — config Vite pronta pro SDK              |
| `src/App.tsx`        | `AppProviders` + `AppRouter` — providers e roteamento        |
| `src/routes.tsx`     | `defineRoutes` com rota `lazy` + guard de autenticação       |
| `src/stores/auth.ts` | `createAuthStore` + `createSelectors` — store de auth tipada |
| `src/lib/api.ts`     | `createApiClient` + `createQueryKeys` — cliente HTTP + cache |

Vamos olhar os três mais importantes.

#### `vite.config.ts` → `createViteConfig`

```ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

Uma linha. O `createViteConfig` já liga o plugin de React, o alias `@ -> ./src` e os defaults que o SDK espera. Veja a página [Vite Config](./vite-config.md) pra customizar.

#### `src/App.tsx` → `AppProviders` + `AppRouter`

```tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

`AppProviders` monta numa tacada só o React Query, o error boundary, o tema e o roteador. `AppRouter` consome o array de rotas e renderiza o `fallback` enquanto rotas `lazy` carregam. Detalhes em [App Providers](./app-providers.md).

#### `src/stores/auth.ts` → `createAuthStore` + `createSelectors`

```ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = createSelectors(createAuthStore<User>({ name: "app-auth" }));
```

`createAuthStore<User>` cria uma store Zustand de autenticação persistida (`name: "app-auth"` é a chave de storage). `createSelectors` te dá acesso atômico via `useAuth.use.<campo>()` — é assim que `RootLayout.tsx` lê `useAuth.use.isAuthenticated()` e `Login.tsx` chama `useAuth.use.setSession()`. Mais padrões em [State](./state.md).

!!! note "O resto se explica sozinho"
`routes.tsx` usa `defineRoutes([...])` com uma rota index, uma de login e um `dashboard` que é ao mesmo tempo **lazy** e **protegido** por guard. `lib/api.ts` instancia `createApiClient` com `baseURL`/`getToken`/`onUnauthorized` e exporta `createQueryKeys` pra você organizar as chaves de cache.

## Próximos passos

Com o app rodando, aqui está como crescer a partir dele:

### 1. Adicione uma página

Crie `src/pages/Sobre.tsx` e registre a rota em `src/routes.tsx`:

```tsx
import { defineRoutes } from "tempest-react-sdk";

export const routes = defineRoutes([
  // ...rotas existentes
  { path: "/sobre", element: <Sobre /> },
]);
```

### 2. Adicione uma store

Pra estado que não é de autenticação, use `createStore` do SDK:

```ts
import { createStore } from "tempest-react-sdk";

export const useCounter = createStore<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}));
```

### 3. Busque dados com React Query + queryKeys + api

Combine o cliente HTTP, as query keys e o `useQuery` (já disponível pelo `AppProviders`):

```tsx
import { useQuery } from "tempest-react-sdk";
import { api, queryKeys } from "@/lib/api";

export function UserList() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => api.get("/users"),
  });

  if (isLoading) return <p>Carregando…</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

Aprofunde em [Query](./query.md) e [HTTP](./http.md).

## Recap

- `npm create tempest-app my-app` (ou `npx` / `pnpm create`) gera um app **React 19 + Vite + TypeScript** já cabeado com o `tempest-react-sdk` — CLI zero-dependency, sempre na última versão. ✅
- Sem nome, ela **pergunta** (padrão `my-tempest-app`); a pasta de destino **precisa estar vazia**.
- `cd my-app && npm install && cp .env.example .env && npm run dev` te leva a **<http://127.0.0.1:5173>** com providers, rotas e auth funcionando.
- Cada arquivo gerado **demonstra um recurso**: `createViteConfig`, `AppProviders` + `AppRouter`, `defineRoutes` (lazy + guard), `createAuthStore` + `createSelectors`, `createApiClient` + `createQueryKeys`.
- Pra crescer: adicione páginas em `pages/` + entradas em `routes.tsx`, crie stores com `createStore`, e busque dados com `useQuery` + `queryKeys` + `api`.
