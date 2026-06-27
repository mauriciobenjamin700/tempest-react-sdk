# Tutorial — Roteamento

Nosso app vai ter mais de uma tela: a lista de tarefas, uma página de login e um
painel. Para o usuário trocar de tela **sem recarregar a página**, precisamos de
rotas. Nesta página você vai adicionar uma página nova, ligá-la a uma URL,
navegar com `<Link>` e, por fim, criar uma rota **lazy** e **protegida**.

Tudo vem de `"tempest-react-sdk"` — você nunca importa de `react-router-dom`
diretamente. O SDK embrulha o React Router v7 declarativo e expõe `defineRoutes`,
`<AppRouter>`, `<Link>`, `<Outlet>` e `useNavigate` num só lugar.

## A árvore de rotas que já existe

O app gerado já tem uma árvore em `src/routes.tsx`. Vamos partir de uma versão
enxuta dela: um layout na raiz, com a Home como rota índice e o login como filho.

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
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
    ],
  },
]);
```

Peça por peça:

- `defineRoutes([...])` é um helper de **identidade tipada**: devolve o mesmo
  array, mas com autocomplete e checagem de tipos. Você não anota nada na mão.
- A rota `"/"` renderiza o `<RootLayout>` (o "esqueleto" com a navegação).
- `{ index: true }` é a rota **padrão** do layout — o que aparece quando a URL
  casa exatamente com `/`.
- `{ path: "login" }` casa com `/login`.

!!! warning "`index` e `path` são mutuamente exclusivos"

    Uma rota é índice (`index: true`) **ou** tem `path`, nunca os dois juntos.
    Marcar ambos é um erro de configuração.

## O layout e o `<Outlet>`

A rota pai renderiza o layout; as rotas filhas aparecem dentro dele, no ponto
marcado por `<Outlet>`. A navegação fica fixa, e só o conteúdo abaixo troca.

```tsx
// src/layouts/RootLayout.tsx
import { Link, Outlet } from "tempest-react-sdk";

export function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Tarefas</Link> | <Link to="/sobre">Sobre</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

Use `<Link to="...">` (re-exportado pelo SDK) em vez de `<a href="...">`: o
`<Link>` navega no cliente, sem recarregar a página. O `<Outlet>` é onde o React
Router injeta a rota filha que casou com a URL atual.

## Adicionando uma página nova

Vamos criar uma página "Sobre". Primeiro o componente:

```tsx
// src/pages/Sobre.tsx
export function Sobre() {
  return (
    <section>
      <h1>Sobre</h1>
      <p>Uma lista de tarefas feita com o tempest-react-sdk.</p>
    </section>
  );
}
```

Agora registre a rota como filha do layout, ao lado da Home e do login:

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { Sobre } from "@/pages/Sobre";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "sobre", element: <Sobre /> },
    ],
  },
]);
```

Pronto: o link **Sobre** do `RootLayout` agora abre `/sobre` e o `<Outlet>`
mostra a página. Não precisou mexer em mais nada. 🚀

## Como tudo é montado: `<AppRouter>`

Você nunca instancia o router na mão. O `<AppRouter>` recebe a árvore e monta o
router, o `<Suspense>` e as `<Routes>` sozinho. No app gerado ele vive dentro do
`App.tsx`:

```tsx
// src/App.tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado.</p> }}>
      <AppRouter routes={routes} fallback={<p>Carregando…</p>} />
    </AppProviders>
  );
}
```

O `fallback` é o que aparece enquanto uma rota **lazy** (próxima seção) baixa seu
código. Você vai entender o `<AppProviders>` em detalhe na página de
[busca de dados](data-fetching.md) — por ora, saiba só que ele fica **por fora**
do roteamento.

## Rota lazy: carregando código sob demanda

Páginas pesadas não precisam entrar no bundle inicial. O campo `lazy` carrega o
componente só quando o usuário visita a rota. Diferente das outras páginas, um
componente lazy precisa de um **`export default`**:

```tsx
// src/pages/Dashboard.tsx
export default function Dashboard() {
  return (
    <section>
      <h1>Dashboard</h1>
      <p>Suas tarefas concluídas e estatísticas.</p>
    </section>
  );
}
```

E na árvore, troque `element` por `lazy`:

```tsx
// src/routes.tsx (trecho)
{
  path: "dashboard",
  lazy: () => import("@/pages/Dashboard"),
},
```

Enquanto o chunk baixa, o `<AppRouter>` mostra o `fallback` que você passou no
`App.tsx`.

!!! note "Retry automático em chunk velho"

    Depois de um deploy, os nomes dos chunks mudam. Um usuário com a aba aberta há
    horas pode pedir um chunk que não existe mais e tomar erro de import. O `lazy`
    do SDK detecta esse caso e tenta recarregar **automaticamente** — você não
    escreve esse retry na mão.

## Protegendo uma rota com `guard`

O dashboard só deve ser visível para quem está logado. O campo `guard` resolve
isso direto na árvore: quando o valor é _falsy_, o `<AppRouter>` renderiza um
redirect no lugar do `element`.

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { Sobre } from "@/pages/Sobre";

export const routes = defineRoutes([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "sobre", element: <Sobre /> },
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

Quem não está autenticado e tenta abrir `/dashboard` cai em `/login`. A store
`useAuth` ainda não existe — você vai criá-la na próxima página. Por enquanto,
foque em **como** o guard lê o estado.

!!! warning "O guard roda na renderização — leia a store via `getState()`"

    A função do `guard` é avaliada **durante a renderização** da rota, fora do
    ciclo de hooks. Por isso ela lê o valor _naquele instante_ com
    `useAuth.getState().isAuthenticated`. **Não** capture o valor fora da função
    (`const ok = useAuth.getState().isAuthenticated` no topo do arquivo) — você
    congelaria o estado de auth no carregamento inicial.

## Navegação programática

Às vezes você navega a partir de código — por exemplo, depois de um login
bem-sucedido. Use `useNavigate`:

```tsx
// src/pages/Login.tsx (esqueleto — completaremos depois)
import { useNavigate } from "tempest-react-sdk";

export function Login() {
  const navigate = useNavigate();

  function handleLogin() {
    // ...autenticar...
    navigate("/dashboard");
  }

  return <button onClick={handleLogin}>Entrar</button>;
}
```

## Múltiplos layouts (mobile/desktop · público/autenticado)

Apps reais raramente têm um layout só. Os dois eixos mais comuns:

- **Público vs autenticado** — a tela de login/cadastro usa um shell minimalista (um card centralizado), enquanto a área logada usa o shell do app (nav + conteúdo). São **layouts diferentes**, não a mesma casca com um `if`.
- **Mobile vs desktop** — no desktop um menu lateral fixo; no mobile uma barra inferior. O mesmo conteúdo, cascas diferentes.

O router declarativo resolve o primeiro eixo com **rotas de layout aninhadas**, e o segundo com o hook `useBreakpoint` **dentro** do layout.

### Um layout por seção (rotas de layout)

Uma rota **sem `path`**, só com `element` + `children`, é uma _layout route_: ela
envolve os filhos no seu `<Outlet>` sem adicionar segmento à URL. Agrupe as rotas
públicas sob um layout e as protegidas sob outro:

```tsx
// routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AppLayout } from "@/layouts/AppLayout";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { TaskList } from "@/pages/TaskList";

export const routes = defineRoutes([
  {
    // Grupo PÚBLICO — shell de autenticação, sem guard.
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
    ],
  },
  {
    // Grupo PROTEGIDO — shell do app; o próprio layout faz o guard.
    element: <AppLayout />,
    children: [
      { index: true, element: <TaskList /> },
      { path: "settings", lazy: () => import("@/pages/Settings") },
    ],
  },
]);
```

O layout público é simples — só centraliza o `<Outlet>`:

```tsx
// layouts/AuthLayout.tsx
import { Outlet } from "tempest-react-sdk";

export function AuthLayout() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <main style={{ width: "min(360px, 90vw)" }}>
        <Outlet />
      </main>
    </div>
  );
}
```

### Shell responsivo + guard no layout protegido

O `AppLayout` faz duas coisas: **protege** a seção inteira (redireciona se não
autenticado) e **troca a casca** conforme o breakpoint via `useBreakpoint`:

```tsx
// layouts/AppLayout.tsx
import { Link, Navigate, Outlet, useBreakpoint } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function AppLayout() {
  const isAuthenticated = useAuth.use.isAuthenticated();
  const { isDesktop } = useBreakpoint();

  // Guarda a seção protegida inteira de uma vez.
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const nav = (
    <nav style={{ display: "flex", gap: 12 }}>
      <Link to="/">Tarefas</Link>
      <Link to="/settings">Ajustes</Link>
    </nav>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Desktop: menu lateral fixo */}
      {isDesktop && <aside style={{ width: 220, padding: 16 }}>{nav}</aside>}

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <main style={{ flex: 1, padding: 16 }}>
          <Outlet />
        </main>

        {/* Mobile: barra de navegação inferior */}
        {!isDesktop && (
          <footer style={{ borderTop: "1px solid var(--tempest-border)", padding: 8 }}>
            {nav}
          </footer>
        )}
      </div>
    </div>
  );
}
```

!!! tip "Guard no layout vs. guard por rota"
    Proteger **uma seção inteira** fica mais limpo com o redirect dentro do
    layout (um lugar só). Para proteger **uma rota isolada**, use o campo
    `guard` / o `<RouteGuard>` que vimos antes. Os dois convivem.

!!! note "`useBreakpoint` é SSR-safe"
    No servidor ele devolve `xs` / `width: 0` e atualiza depois do mount — então
    o shell mobile é o padrão até o JS hidratar. Para evitar “pulo” de layout,
    prefira CSS (`Show`/`Hide` ou media queries) quando o conteúdo for o mesmo;
    use `useBreakpoint` quando a **estrutura** muda (sidebar vs bottom-nav).

!!! warning "Layout route não adiciona segmento"
    A rota de layout **não tem `path`** — ela só envolve os filhos. Quem define a
    URL são os filhos (`/login`, `/settings`, índice em `/`). Não coloque `path`
    na rota de layout a menos que queira um prefixo (ex.: `path: "/app"`).

Resultado: `/login` e `/signup` renderizam dentro do `AuthLayout`; `/` e
`/settings` dentro do `AppLayout` (já protegido e responsivo). Cada seção tem o
seu shell, sem `if` espalhado pelas páginas.

## Recap

- Tudo de roteamento vem de `"tempest-react-sdk"` — você nunca importa de
  `react-router-dom`. ✅
- `defineRoutes([...])` tipa a árvore; `<AppRouter routes={routes} />` monta
  router + `<Suspense>` + `<Routes>` sozinho.
- Use `index: true` para a rota padrão de um layout e `path` para as demais —
  nunca os dois juntos.
- Layouts renderizam filhos no `<Outlet>`; navegue com `<Link to="...">` (no JSX)
  ou `useNavigate()` (no código).
- `lazy: () => import("...")` carrega o código sob demanda (com retry automático
  em chunk velho) — o componente precisa de `export default`.
- Proteja rotas com `guard` (booleano ou função) + `redirectTo`; o guard roda na
  renderização, então leia a store com `getState()`.
- **Múltiplos layouts**: rotas de layout aninhadas (sem `path`) separam shells
  público/autenticado; `useBreakpoint` dentro do layout troca mobile/desktop.

➡️ **Próxima página:** [Estado — a store de autenticação](state.md)
