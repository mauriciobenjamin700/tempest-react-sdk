# Fluxo de autenticação completo

A Loja Aurora vende pela internet e tem um **painel interno** para a equipe: a
gerente vê os pedidos do dia, a atendente responde trocas. Ninguém de fora pode abrir
`/pedidos`. Quem tenta cai no login e, depois de entrar, **volta para a tela que tinha
pedido**. Quando o token vence, o painel tira a pessoa da sessão sozinho, sem deixar a
tela pendurada em erro 401. 🔐

Esta receita monta esse fluxo com quatro peças do SDK:
[`createAuthStore`](../auth.md#store-createauthstoretuser),
[`createApiClient`](../http.md#createapiclient), a rota com `guard` de
[`defineRoutes`](../routing.md#guards-protegendo-rotas) e
[`useReturnTo`](../routing.md#voltar-para-onde-estava-depois-do-login).

!!! info "Antes de começar"
    Você já instalou o SDK e importou `tempest-react-sdk/styles.css` uma vez no
    `src/main.tsx`. Se ainda não, siga a [instalação manual](../index.md#instalacao-manual).

## O que vamos construir

- 🧑‍💼 Uma **tela de login** com e-mail e senha, botão com estado de carregamento e a
  mensagem de erro que o backend mandou ("E-mail ou senha incorretos").
- 🗂️ Um **layout privado** com o nome da pessoa logada e o botão **Sair**.
- 🚧 **Rotas protegidas**: quem não está logado vai para `/login` e volta depois.
- ⏱️ **Sessão que expira sozinha**: qualquer 401 do backend desloga e o guard manda
  para o login.
- 📱 Tudo funciona igual no celular: os componentes do SDK já são responsivos.

## O contrato com o backend

O backend é um serviço FastAPI feito com o `tempest-fastapi-sdk`, montado sob `/api`
(veja [Integração FastAPI](../integration-fastapi.md#o-contrato-que-os-dois-lados-compartilham)).
São duas rotas:

```text
POST /api/auth/login   { "email": "marina@lojaaurora.com.br", "password": "••••••" }
200 → { "access_token": "eyJhbGciOi...", "token_type": "bearer" }
401 → { "detail": "E-mail ou senha incorretos", "code": "INVALID_CREDENTIALS" }

GET /api/auth/me       Authorization: Bearer eyJhbGciOi...
200 → { "id": "u_7f3c", "name": "Marina Souza", "email": "marina@lojaaurora.com.br", "role": "gerente" }
```

## O código, arquivo por arquivo

### 1. O store da sessão

```ts
// src/stores/auth.ts
import { createAuthStore, createSelectors } from "tempest-react-sdk";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "gerente" | "atendente";
}

export const useAuth = createSelectors(
  createAuthStore<User>({ name: "aurora-auth", storage: "local" }),
);
```

### 2. O cliente HTTP

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});
```

### 3. O login como função

```ts
// src/services/session.ts
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

interface LoginResponse {
  access_token: string;
  token_type: "bearer";
}

export async function signIn(email: string, password: string): Promise<User> {
  const { access_token } = await api.post<LoginResponse>("/auth/login", {
    body: { email, password },
    skipAuth: true,
  });
  const user = await api.get<User>("/auth/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  useAuth.getState().setSession({ user, token: access_token });
  return user;
}
```

### 4. A tela de login

```tsx
// src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  FormActions,
  Input,
  PasswordInput,
  describeApiError,
  useNavigate,
  useReturnTo,
} from "tempest-react-sdk";
import { signIn } from "@/services/session";

export function Login() {
  const navigate = useNavigate();
  const returnTo = useReturnTo("/pedidos");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(
        describeApiError(err, "Não foi possível entrar agora. Tente de novo.", {
          codes: { INVALID_CREDENTIALS: "E-mail ou senha incorretos." },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "10vh auto", padding: 16 }}>
      <Card title="Entrar no painel da Loja Aurora">
        <Form layout="stack" gap={4} onSubmit={onSubmit}>
          {error ? <Alert variant="danger" description={error} /> : null}
          <Input
            label="E-mail"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <PasswordInput
            label="Senha"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormActions align="end">
            <Button type="submit" loading={submitting} fullWidth>
              Entrar
            </Button>
          </FormActions>
        </Form>
      </Card>
    </main>
  );
}
```

### 5. O layout privado

```tsx
// src/layouts/PrivateLayout.tsx
import { Button, Outlet, useNavigate } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function PrivateLayout() {
  const user = useAuth.use.user();
  const logout = useAuth.use.logout();
  const navigate = useNavigate();

  function onLogout(): void {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--tempest-border)",
        }}
      >
        <strong>Loja Aurora</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>Olá, {user?.name ?? "equipe"}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </header>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

### 6. As rotas

```tsx
// src/routes.tsx
import { defineRoutes } from "tempest-react-sdk";
import { PrivateLayout } from "@/layouts/PrivateLayout";
import { Login } from "@/pages/Login";
import { Orders } from "@/pages/Orders";
import { useAuth } from "@/stores/auth";

export const routes = defineRoutes([
  { path: "login", element: <Login /> },
  {
    element: <PrivateLayout />,
    guard: () => useAuth.use.isAuthenticated(),
    redirectTo: "/login",
    preserveFrom: true,
    children: [
      { index: true, element: <Orders /> },
      { path: "pedidos", element: <Orders /> },
    ],
  },
]);
```

### 7. O app

```tsx
// src/App.tsx
import { AppProviders, AppRouter, Spinner } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado. Recarregue a página.</p> }}>
      <AppRouter routes={routes} fallback={<Spinner />} />
    </AppProviders>
  );
}
```

## Pedaço por pedaço

### A sessão mora num store persistido

`createAuthStore<User>` devolve um store Zustand que já traz `user`, `token`,
`isAuthenticated`, `setSession`, `setUser`, `setToken` e `logout`. Ele persiste `user`
e `token` no `localStorage` com a chave `aurora-auth`, então um F5 não desloga ninguém.

`createSelectors` acrescenta um hook por campo (`useAuth.use.user()`), e cada
componente só re-renderiza quando o campo que ele lê muda. Fora do React, como no
cliente HTTP, você lê o valor atual com `useAuth.getState()`.

### O cliente HTTP fala com a sessão, não o contrário

`getToken` é chamado **a cada requisição**. Quando ele devolve uma string, o cliente
injeta `Authorization: Bearer <token>`. Quando o backend responde 401, o cliente chama
`onUnauthorized`, que aqui é `logout()`. O `prefix: "/api"` deixa você escrever
`"/auth/login"` em vez de repetir o `/api` em cada chamada.

!!! note "Por que `skipAuth: true` no login"
    O login é a requisição que **busca** o token, então não faz sentido mandar o
    token antigo junto. O `skipAuth` também tira essa chamada do ciclo de
    "401 → renovar → repetir": senha errada é erro da tela, não sessão vencida.

### O login busca o usuário antes de gravar a sessão

O backend do `tempest-fastapi-sdk` devolve só `{ access_token }` no login. Quem é a
pessoa vem de `GET /auth/me`. A função `signIn` manda o token novo **no header dessa
chamada** e só grava a sessão quando tem as duas coisas. Assim o store nunca fica com
`isAuthenticated: true` e `user: null` ao mesmo tempo.

### A tela cobre os quatro estados

- **Ocioso**: o formulário vazio, com `autoComplete` certo para o gerenciador de senhas.
- **Carregando**: `loading={submitting}` mostra o spinner no botão e bloqueia o
  segundo clique.
- **Erro**: `describeApiError` transforma qualquer falha numa frase para humanos. O
  mapa `codes` troca o `INVALID_CREDENTIALS` do backend pela frase que você quer.
  Falha de rede, 500 e timeout caem no texto padrão.
- **Sucesso**: `navigate(returnTo, { replace: true })` leva de volta para a tela que a
  pessoa tinha pedido, e o `replace` tira o `/login` do histórico.

!!! tip "Branch por `code`, nunca por `detail`"
    O `detail` é texto e pode mudar de redação ou idioma. O `code` é estável. Veja
    [Erros tipados](../integration-fastapi.md#1-erros-tipados-tempestapierror).

### O guard é reativo

`guard: () => useAuth.use.isAuthenticated()` roda **dentro do render** da rota, então
pode chamar hook. Isso faz o guard reagir: quando um 401 chama `logout()`, o
`isAuthenticated` vira `false`, a rota re-renderiza e o redirect para `/login`
acontece sozinho, de qualquer tela privada.

O guard está na rota **sem `path`** que envolve o layout. Ele protege todas as filhas
de uma vez: `/`, `/pedidos` e qualquer tela que você acrescentar ali.

`preserveFrom: true` faz o redirect levar `state: { from: "/pedidos?status=pago" }`.
Do outro lado, `useReturnTo("/pedidos")` lê esse valor e **só aceita caminho da mesma
origem**. Sem ele, um `from` forjado viraria um open redirect.

!!! warning "Leia o store por hook no guard, não por `getState()`"
    `guard: () => useAuth.getState().isAuthenticated` também compila, mas lê o valor
    uma vez por render e não assina mudanças. Depois de um `logout()` disparado pelo
    cliente HTTP, a tela continuaria aberta até a próxima navegação.

### E no celular? 📱

Nada muda no código. O `Card` ocupa a largura toda até 420 px, o `Button` com
`fullWidth` fica fácil de tocar, e o `PasswordInput` traz o botão de mostrar a senha,
que é o que mais ajuda em teclado de celular.

## Quando trocar pelo preset

??? tip "Precisa renovar o token em vez de deslogar? Use `createTempestAuth`"
    Se o backend emite `refresh_token`, deslogar a cada 401 é ruim: a pessoa perde o
    que estava digitando. O preset
    [`createTempestAuth`](../integration-fastapi.md#5-autenticacao-turn-key-createtempestauth)
    monta o mesmo store, o cliente e uma fila de refresh deduplicada, falando o
    contrato do `tempest-fastapi-sdk`. As rotas e o guard desta receita continuam
    iguais: você troca `useAuth` por `auth.useAuthStore` e `api` por `auth.api`.
    Para a fila de refresh avulsa, veja [`createRefreshQueue`](../auth.md#refresh-queue-createrefreshqueue).

!!! danger "Onde o token fica"
    Esta receita guarda o token no `localStorage`, que qualquer script da página
    consegue ler. Para app sensível, use refresh token em cookie httpOnly com
    `withCredentials: true` e `csrf: true`. Detalhes em
    [CSRF](../http.md#csrf-o-cookie-de-sessao-precisa-de-um-par).

## Recap

- ✅ `createAuthStore` + `createSelectors` guardam a sessão e sobrevivem ao F5.
- ✅ `createApiClient` injeta o Bearer com `getToken` e desloga com `onUnauthorized`.
- ✅ O login usa `skipAuth`, busca `/auth/me` e só então chama `setSession`.
- ✅ `describeApiError` com `codes` vira a frase de erro da tela.
- ✅ `guard` lendo o store **por hook** + `preserveFrom` + `useReturnTo` protegem as
  rotas e devolvem a pessoa para onde ela estava.
