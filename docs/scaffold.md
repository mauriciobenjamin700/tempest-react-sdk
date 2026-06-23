# Scaffold — `create-tempest-app`

`create-tempest-app` é a CLI oficial de scaffolding da Tempest. Com **um comando** você cria um app React 19 + Vite + TypeScript já pré-cabeado com o `tempest-react-sdk`: providers, roteamento, store de autenticação e cliente HTTP saem prontos pra rodar. A CLI **não é um pacote separado** — ela vem **dentro do próprio `tempest-react-sdk`** como o `bin` do pacote (`create-tempest-app`), junto com um `template/` embutido no tarball.

```json
"bin": { "create-tempest-app": "./bin/create-tempest-app.mjs" }
```

Esta página é um tutorial: vamos do comando vazio até o app rodando no navegador, e depois passeamos por cada arquivo gerado pra entender qual recurso do SDK ele demonstra. 🚀

!!! info "Versionada junto com o SDK"
Como a CLI mora dentro do `tempest-react-sdk`, ela é **versionada junto com o SDK**. Fixar uma versão é fixar a versão do SDK: `npx -p tempest-react-sdk@0.5.1 create-tempest-app …`. E o app gerado já nasce com a dependência `tempest-react-sdk` **carimbada na mesma versão** que o produziu — nada de número hardcoded que desatualiza.

## Crie seu primeiro app

Para uma pasta **nova** (ainda sem nada instalado), o `npx` baixa o SDK e roda o `bin` dele:

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev            # http://127.0.0.1:5173
```

O `-p tempest-react-sdk` diz ao `npx` qual pacote buscar; `create-tempest-app my-app` é o `bin` que ele executa, gerando o projeto na pasta `my-app`.

Abra **<http://127.0.0.1:5173>** — o app já está no ar com providers, rotas e store funcionando.

!!! tip "Sem nome de projeto?"
Se você omitir o nome, a CLI vai **perguntar** interativamente. O valor padrão sugerido é `my-tempest-app` — é só apertar Enter pra aceitar.

!!! warning "A pasta de destino precisa estar vazia"
No modo de projeto novo (`create-tempest-app my-app`), o diretório alvo **não pode existir** ou precisa estar **vazio**. Isso evita sobrescrever um projeto seu por acidente. Se a pasta já tem arquivos, a CLI sugere usar `.` para **mesclar** no diretório atual em vez de abortar (veja a próxima seção).

## Scaffold dentro de um projeto existente

Se você já tem um projeto que depende do SDK, dá pra gerar o `src/` + configs **no diretório atual**, sem criar uma pasta nova:

```bash
npm install tempest-react-sdk
npx create-tempest-app .
```

Aqui o `npx create-tempest-app` resolve o `bin` a partir do `tempest-react-sdk` que você acabou de instalar — não precisa do `-p`. Rodar **sem argumento** se comporta igual a `.`.

Nesse modo "diretório atual":

- **Arquivos existentes são preservados** — a CLI pula cada um que já existe e **reporta** o que foi pulado, sem sobrescrever nada seu.
- Um `package.json` existente tem os scripts e deps da Tempest **mesclados**: seu `name`/`version` e os scripts/deps que já estavam lá são mantidos, e o `tempest-react-sdk` é fixado na **própria versão do SDK** que está rodando o scaffold.

!!! info "O `.env`"
O `.env.example` declara `VITE_API_URL`, a base usada pelo cliente HTTP em `src/lib/api.ts`. Copie pra `.env` e ajuste pra apontar pro seu backend.

### Scripts disponíveis

O `package.json` gerado vem com quatro scripts:

| Script              | O que faz                                                 |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | `vite` — dev server em `127.0.0.1:5173`                   |
| `npm run build`     | `tsc --noEmit && vite build` — checa tipos e empacota     |
| `npm run preview`   | `vite preview` — serve o build de produção                |
| `npm run typecheck` | `tsc --noEmit` — só checagem de tipos                     |
| `npm run lint`      | `eslint .` — ESLint 9 flat config (react-hooks + refresh) |
| `npm run lint:fix`  | `eslint . --fix` — autocorrige o que dá                   |

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

- A CLI é o **`bin` do próprio `tempest-react-sdk`** (`create-tempest-app`), com um `template/` embutido no tarball — versionada junto com o SDK, não um pacote separado. ✅
- Pasta nova: `npx -p tempest-react-sdk create-tempest-app my-app` (a pasta de destino **precisa estar vazia** ou não existir; sem nome ela **pergunta**, padrão `my-tempest-app`). Use `@X` no `-p` pra fixar a versão do SDK.
- Projeto existente: `npm install tempest-react-sdk` e `npx create-tempest-app .` (ou sem argumento) gera no diretório atual — **arquivos existentes são preservados** e o `package.json` tem scripts/deps **mesclados** (`tempest-react-sdk` fixado na versão do SDK).
- `cd my-app && npm install && cp .env.example .env && npm run dev` te leva a **<http://127.0.0.1:5173>** com providers, rotas e auth funcionando.
- Cada arquivo gerado **demonstra um recurso**: `createViteConfig`, `AppProviders` + `AppRouter`, `defineRoutes` (lazy + guard), `createAuthStore` + `createSelectors`, `createApiClient` + `createQueryKeys`.
- Pra crescer: adicione páginas em `pages/` + entradas em `routes.tsx`, crie stores com `createStore`, e busque dados com `useQuery` + `queryKeys` + `api`.
