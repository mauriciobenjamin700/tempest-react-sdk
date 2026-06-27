# Tutorial — Fluxo de autenticação

Você já tem todas as peças soltas: a store de auth ([Estado](state.md)), o guard
de rota ([Roteamento](routing.md)), o cliente HTTP ([Buscando dados](data-fetching.md))
e os formulários validados ([Formulários](forms.md)). Nesta página final a gente
**costura tudo** num fluxo completo: login → área protegida → logout, mais o
logout automático quando o backend responde **401**.

## O ciclo completo, em uma imagem

```text
1. Usuário abre /dashboard sem sessão
        → guard lê useAuth.getState().isAuthenticated (false)
        → redirect pra /login
2. Usuário envia o login
        → api.post("/auth/login")  → { user, token }
        → useAuth.use.setSession({ user, token })
        → navigate("/dashboard")
3. guard agora lê isAuthenticated === true → mostra o Dashboard
4. Qualquer chamada que volte 401
        → onUnauthorized → useAuth.getState().logout()
        → guard volta a redirecionar pra /login
5. Usuário clica em "Sair"
        → useAuth.use.logout() → volta pro passo 1
```

Cada passo usa exatamente uma peça que você já construiu. Vamos montá-las.

## Passo 1 — A store e o cliente (recapitulando)

Estes dois arquivos já existem das páginas anteriores. Eles são a fundação do
fluxo — repare como o cliente lê e limpa a **mesma** store:

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

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});
```

O `getToken` injeta o token em cada requisição; o `onUnauthorized` desloga quando
o backend recusa o token. Ambos leem a store fora do React com `getState()`.

## Passo 2 — A tela de login

O login chama o backend, recebe `{ user, token }`, grava a sessão com
`setSession` e navega pro dashboard. Reusamos `useZodForm` + `FormField` do
capítulo de formulários:

```tsx
// src/pages/Login.tsx
import { useState } from "react";
import {
  useZodForm,
  FormProvider,
  Form,
  FormField,
  FormActions,
  Input,
  Button,
  useNavigate,
} from "tempest-react-sdk";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuth.use.setSession();
  const [failed, setFailed] = useState(false);

  const form = useZodForm(loginSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFailed(false);
    try {
      const session = await api.post<{ user: User; token: string }>("/auth/login", {
        body: values,
      });
      setSession(session);
      navigate("/dashboard");
    } catch {
      setFailed(true);
    }
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="email" label="E-mail" required>
          <Input type="email" />
        </FormField>
        <FormField name="password" label="Senha" required>
          <Input type="password" />
        </FormField>
        {failed && <p role="alert">E-mail ou senha inválidos.</p>}
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Entrar
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

Peça por peça:

- `setSession({ user, token })` é a **única** ação que liga a sessão: ela grava o
  usuário e o token e re-deriva `isAuthenticated` pra `true`.
- `navigate("/dashboard")` leva pro destino protegido — que agora abre, porque o
  guard vê `isAuthenticated === true`.
- O `try/catch` separa o erro de **rede/credenciais** (mostra a mensagem) da
  validação do zod (que nem deixa o `onSubmit` rodar com campos vazios).

## Passo 3 — A área protegida (o guard)

A rota do dashboard já tem o guard que você escreveu no capítulo de roteamento.
Ele é o portão que lê a store **no momento da renderização**:

```tsx
// src/routes.tsx (a rota protegida)
{
  path: "dashboard",
  lazy: () => import("@/pages/Dashboard"),
  guard: () => useAuth.getState().isAuthenticated,
  redirectTo: "/login",
},
```

Antes do login, `isAuthenticated` é `false` → o `<AppRouter>` redireciona pra
`/login`. Depois do `setSession`, a próxima tentativa de abrir `/dashboard`
encontra `true` → o Dashboard renderiza.

!!! warning "Por que o guard usa `getState()` e não o hook"

    O `guard` roda **fora** do ciclo de hooks (durante a montagem da rota), então
    não pode chamar `useAuth.use.isAuthenticated()`. Ele lê o snapshot atual com
    `getState()`. Dentro de **componentes** — como o `RootLayout` — você usa o
    hook `.use` pra re-renderizar quando o auth muda. Mesma store, duas formas de
    ler conforme o contexto. 💡

## Passo 4 — Logout manual

O `RootLayout` (do capítulo de estado) já mostra um botão "Sair" quando há sessão.
Ele chama a ação `logout`:

```tsx
// trecho do src/layouts/RootLayout.tsx
import { useAuth } from "@/stores/auth";

const logout = useAuth.use.logout();
// ...
<button onClick={logout}>Sair</button>;
```

`logout()` limpa `user`, `token` e `isAuthenticated`. Como o `RootLayout` lê
`isAuthenticated` pelo hook `.use`, a `<nav>` re-renderiza na hora: o botão "Sair"
some e o link "Entrar" volta. Se o usuário estiver numa rota protegida, o guard o
manda de volta pro login.

## Passo 5 — Logout automático no 401

Aqui o fluxo se fecha. Quando um token expira, o backend responde **401** na
próxima chamada. O `onUnauthorized` do cliente — que você configurou no Passo 1 —
dispara o `logout()`:

```ts
// já no src/lib/api.ts
onUnauthorized: () => useAuth.getState().logout(),
```

Você **não** precisa checar 401 manualmente em cada `useQuery`/`useMutation`:
qualquer chamada via `api` que volte 401 desloga o usuário centralmente, e o guard
faz o resto. Um único ponto de verdade pra "a sessão acabou".

!!! tip "Renovando o token em vez de deslogar"

    Se o seu backend tem refresh token, dá pra **renovar** a sessão antes de
    desistir: passe um `refresh` ao `createApiClient` e ele tenta `refresh()` e
    repete a requisição uma vez no 401, deslogando só se o refresh também falhar.
    Veja a página de [Auth](../auth.md) (`createRefreshQueue`) pra esse padrão
    avançado.

## Parabéns! 🎉

Você construiu um app completo com o `tempest-react-sdk`, ponta a ponta:

- **Roteamento** com layout, páginas, rota lazy e guard.
- **Estado** com `createStore`, `createSelectors` e a store de auth persistida.
- **Dados** com `createApiClient`, `createQueryKeys`, `useQuery` e `useMutation`.
- **Formulários** validados com `useZodForm` + `FormField` + campos BR mascarados.
- **Autenticação** ligando store + guard + cliente HTTP num fluxo coeso.

## Recap

- O fluxo de auth é **uma store + um guard + um cliente**, todos lendo a **mesma**
  `useAuth`. ✅
- **Login**: `api.post("/auth/login")` → `setSession({ user, token })` →
  `navigate("/dashboard")`.
- **Área protegida**: o `guard` lê `useAuth.getState().isAuthenticated` na
  renderização e redireciona com `redirectTo` quando falso.
- **Logout manual**: `useAuth.use.logout()` num botão; o `RootLayout` re-renderiza
  porque lê pelo hook `.use`.
- **Logout automático**: `onUnauthorized: () => useAuth.getState().logout()` no
  cliente desloga em qualquer 401 — um único ponto de verdade.
- Dentro de componentes, leia com `.use`; fora do React (guard, cliente), leia com
  `getState()`.
