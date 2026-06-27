# Routing

O módulo `routing` do `tempest-react-sdk` embrulha o **React Router v7 (modo declarativo)** e devolve uma superfície única de import: você declara sua árvore de rotas com `defineRoutes`, monta tudo com um único `<AppRouter>` e importa cada primitivo (`Link`, `Outlet`, `useNavigate`, …) direto do SDK — nunca do `react-router-dom`. Em cima do v7, o SDK adiciona o que todo app Tempest repete na mão: code-splitting com retry automático em chunk velho, guards declarativos de rota e um `<Suspense>` já pronto. Esta página te leva do zero a uma árvore com layout aninhado, lazy loading e rotas protegidas.

## Por que o SDK é dono do roteamento agora

Antes, cada app instalava `react-router-dom`, criava seu próprio `<Suspense>`, escrevia o seu helper de guard e reinventava o retry de chunk. Isso gerava divergência entre os apps Tempest e import paths espalhados.

Com o módulo `routing` você ganha:

- **Uma só superfície de import.** Tudo vem de `"tempest-react-sdk"` — componentes, hooks e os primitivos re-exportados do React Router. Seu app nunca importa de `react-router-dom`.
- **v7 declarativo.** Você descreve _o que_ são as rotas (uma árvore de objetos), não _como_ montá-las imperativamente.
- **Baterias inclusas.** `<AppRouter>` já constrói o router, o `<Suspense>` e as `<Routes>`. `defineRoutes` te dá tipagem. Guards e lazy loading são campos da própria rota.

!!! info "Primitivos re-exportados"
    O SDK re-exporta os primitivos declarativos do React Router para você importar tudo do mesmo lugar: `BrowserRouter`, `HashRouter`, `MemoryRouter`, `Routes`, `Route`, `Outlet`, `Navigate`, `Link`, `NavLink`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `useMatch`, `useRouteError` e `redirect`.

## Construindo a árvore com `defineRoutes`

`defineRoutes` é um helper de **identidade**: ele recebe um array de `TempestRouteObject` e devolve o mesmo array, mas com tipagem completa. Você ganha autocomplete e checagem de tipos na árvore sem precisar anotar nada na mão.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

export const routes = defineRoutes([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "login",
    element: <Login />,
  },
]);
```

Cada `TempestRouteObject` aceita:

| Campo           | Tipo                                        | Descrição                                                                       |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `path`          | `string`                                    | Segmento de URL da rota.                                                        |
| `index`         | `boolean`                                   | Rota índice do pai. Mutuamente exclusivo com `path`.                            |
| `element`       | `ReactNode`                                 | O que renderizar quando a rota casa.                                            |
| `lazy`          | `() => Promise<{ default: ComponentType }>` | Carrega o componente sob demanda (code-split). Retry automático em chunk velho. |
| `children`      | `TempestRouteObject[]`                      | Rotas aninhadas.                                                                |
| `guard`         | `boolean \| (() => boolean)`                | Quando _falsy_, renderiza um redirect no lugar do `element`.                    |
| `redirectTo`    | `string`                                    | Destino do redirect do guard. Padrão `"/"`.                                     |
| `caseSensitive` | `boolean`                                   | Faz o match de `path` diferenciar maiúsculas/minúsculas.                        |

Depois é só passar a árvore para o `<AppRouter>`:

```tsx
// App.tsx
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return <AppRouter routes={routes} />;
}
```

O `<AppRouter>` monta sozinho o router, o `<Suspense>` e as `<Routes>` a partir da árvore. Props disponíveis:

| Prop             | Tipo                              | Padrão      | Descrição                                                |
| ---------------- | --------------------------------- | ----------- | -------------------------------------------------------- |
| `routes`         | `TempestRouteObject[]`            | —           | A árvore de rotas (obrigatória).                         |
| `router`         | `"browser" \| "hash" \| "memory"` | `"browser"` | Qual tipo de router usar.                                |
| `basename`       | `string`                          | —           | Prefixo de path comum a todas as rotas.                  |
| `initialEntries` | `string[]`                        | —           | Histórico inicial — só para o router `"memory"`.         |
| `fallback`       | `ReactNode`                       | —           | Fallback do `<Suspense>` enquanto um chunk lazy carrega. |

## `index` vs `path`

Toda rota com `children` precisa decidir o que mostrar quando a URL casa **exatamente** com o pai. Essa é a rota `index`: ela não tem `path` próprio, apenas marca `index: true`.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { About } from "@/pages/About";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "about", element: <About /> },
    ],
  },
]);
```

Aqui, abrir `/` renderiza o `<RootLayout>` com o `<Home>` dentro; abrir `/about` renderiza o `<RootLayout>` com o `<About>` dentro.

!!! warning "`index` e `path` são mutuamente exclusivos"
    Uma rota é índice (`index: true`) **ou** tem `path`, nunca os dois. Marcar os dois é um erro de configuração.

## Layouts aninhados com `Outlet`

A rota pai renderiza o **layout**; os filhos renderizam dentro dele através do `<Outlet>`. O `<Outlet>` é o ponto onde o React Router injeta a rota filha que casou.

```tsx
// RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";

export function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

A `<nav>` fica visível em todas as rotas filhas; o `<Outlet>` troca de conteúdo conforme a URL. Use `<Link>` (também re-exportado pelo SDK) para navegar sem recarregar a página.

!!! tip "Navegação programática"
    Para navegar a partir de código (depois de um submit, por exemplo), use `useNavigate`: `const navigate = useNavigate(); navigate("/dashboard");`.

## Lazy loading + o fallback do Suspense

Páginas pesadas não precisam entrar no bundle inicial. Use o campo `lazy` para carregar o componente sob demanda. Ele recebe uma função que faz `import()` dinâmico e devolve o módulo com `default`.

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: "dashboard",
        lazy: () => import("@/pages/Dashboard"),
      },
    ],
  },
]);
```

Como o chunk demora um instante para baixar, o `<AppRouter>` envolve tudo num `<Suspense>`. Passe um `fallback` para mostrar algo enquanto carrega:

```tsx
// App.tsx
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return <AppRouter routes={routes} fallback={<p>Loading…</p>} />;
}
```

!!! note "Retry automático em chunk velho"
    Quando você faz um novo deploy, os nomes dos chunks mudam. Um usuário com a aba aberta há horas pode pedir um chunk que não existe mais e tomar um erro de import. O `lazy` do SDK detecta esse caso e tenta recarregar automaticamente — você não precisa escrever esse retry na mão.

## Guards: protegendo rotas

Quase todo app tem rotas que só usuários autenticados podem ver. O campo `guard` resolve isso direto na árvore: quando o valor é _falsy_, o `<AppRouter>` renderiza um redirect no lugar do `element`.

### Forma booleana

Se a condição já está disponível como valor, passe um booleano:

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { Dashboard } from "@/pages/Dashboard";

const isAuthenticated = false;

export const routes = defineRoutes([
  {
    path: "dashboard",
    element: <Dashboard />,
    guard: isAuthenticated,
    redirectTo: "/login",
  },
]);
```

### Forma de função (auth store)

Na prática, o estado de auth vive numa store. Passe uma **função** que lê a store na hora da renderização — assim o guard sempre vê o valor atual:

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth"; // store baseada em createAuthStore
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      {
        path: "dashboard",
        lazy: () => import("@/pages/Dashboard"),
        guard: () => useAuth.getState().isAuthenticated,
        redirectTo: "/login",
      },
    ],
  },
]);
```

!!! warning "O guard roda na renderização — leia a store via `getState()` ou um hook"
    A função do `guard` é avaliada **durante a renderização** da rota. Por isso ela precisa ler o estado _naquele momento_: use `useAuth.getState().isAuthenticated` (leitura imperativa, fora do React) ou um hook de seleção dentro de um componente. Não capture o valor uma vez fora da função — você congelaria o estado de auth no carregamento inicial.

Quando `guard` é _falsy_, o usuário é redirecionado para `redirectTo` (padrão `"/"`). No exemplo acima, quem não está autenticado e tenta abrir `/dashboard` cai em `/login`.

## `RouteGuard` standalone

Às vezes você quer proteger uma parte da UI sem que ela seja uma rota — ou prefere o guard explícito no JSX. Para isso existe o `<RouteGuard>`: ele renderiza os `children` quando `when` é verdadeiro, senão emite um `<Navigate>`.

```tsx
// ProtectedDashboard.tsx
import { RouteGuard } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";
import { Dashboard } from "@/pages/Dashboard";

export function ProtectedDashboard() {
  const isAuthenticated = useAuth((state) => state.isAuthenticated);

  return (
    <RouteGuard when={isAuthenticated} redirectTo="/login" replace>
      <Dashboard />
    </RouteGuard>
  );
}
```

Props do `<RouteGuard>`:

| Prop         | Tipo        | Padrão | Descrição                                            |
| ------------ | ----------- | ------ | ---------------------------------------------------- |
| `when`       | `boolean`   | —      | Renderiza os `children` quando verdadeiro.           |
| `redirectTo` | `string`    | `"/"`  | Destino quando `when` é falso.                       |
| `replace`    | `boolean`   | `true` | Substitui a entrada no histórico em vez de empilhar. |
| `children`   | `ReactNode` | —      | O que proteger.                                      |

!!! tip "Mesma regra de leitura de estado"
    Aqui você está num componente React, então leia a store com o hook (`useAuth((state) => state.isAuthenticated)`) para re-renderizar quando o auth mudar — diferente do `guard` da árvore, que usa `getState()` por rodar fora do ciclo de hooks.

## Escolhendo o tipo de router

O `<AppRouter>` aceita três tipos via a prop `router`:

- **`"browser"`** (padrão) — usa a History API; URLs limpas (`/dashboard`). É o que você quer em produção.
- **`"hash"`** — URLs com `#` (`/#/dashboard`). Útil quando o servidor não consegue fazer fallback de todas as rotas para o `index.html`.
- **`"memory"`** — histórico em memória, sem tocar a URL do navegador. Ideal para **testes** e ambientes não-DOM.

Em testes, combine `"memory"` com `initialEntries` para começar numa rota específica:

```tsx
// App.test.tsx
import { render, screen } from "@testing-library/react";
import { AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

test("renders the dashboard route", () => {
  render(
    <AppRouter
      routes={routes}
      router="memory"
      initialEntries={["/dashboard"]}
      fallback={<p>Loading…</p>}
    />,
  );

  expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
});
```

!!! note "`initialEntries` é só do router `memory`"
    `initialEntries` define o histórico inicial e só faz sentido com `router="memory"`. Nos routers `browser`/`hash` a rota inicial vem da própria URL do navegador.

## Recap

- O módulo `routing` embrulha o **React Router v7 declarativo** e te dá uma **superfície única de import** — tudo vem de `"tempest-react-sdk"`.
- `defineRoutes` tipa sua árvore; `<AppRouter routes={...} />` monta router + `<Suspense>` + `<Routes>` sozinho.
- Use `index: true` para a rota padrão de um layout e `path` para as demais — nunca os dois juntos.
- Layouts aninhados renderizam filhos no `<Outlet>`; navegue com `<Link>`.
- `lazy` faz code-split com retry automático em chunk velho; mostre o `fallback` do Suspense enquanto carrega.
- Proteja rotas com `guard` (booleano ou função) + `redirectTo`, ou com `<RouteGuard when={...}>` no JSX. O guard roda na renderização — leia a store via `getState()` (na árvore) ou via hook (no componente).
- Escolha o router com a prop `router`: `"browser"` em produção, `"memory"` + `initialEntries` em testes.
