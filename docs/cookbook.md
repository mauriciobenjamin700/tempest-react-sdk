# Cookbook — Receitas

Esta página é um **livro de receitas**: cada seção responde a um "eu quero fazer X"
com **um exemplo completo e copiável** (imports inclusos, sem `...`), seguido de
algumas explicações. As receitas combinam vários módulos do `tempest-react-sdk` em
fluxos que apps Tempest repetem o tempo todo. 🚀

!!! info "Pré-requisitos comuns"
    Todas as receitas assumem que você já instalou o SDK e importou o CSS uma vez no
    entrypoint do app:

    ```bash
    npm install tempest-react-sdk
    ```

    ```tsx
    // src/main.tsx
    import "tempest-react-sdk/styles.css";
    ```

    Apenas `react` e `react-dom` são **peer dependencies** — o resto (`zod`,
    `zustand`, `dexie`, `react-hook-form`, `@tanstack/react-query`, `lucide-react`,
    `react-router-dom`) é instalado junto como dependência direta. Versão atual:
    **0.7.0**.

## Fluxo de autenticação completo

Você quer login persistido, rotas protegidas e um cliente HTTP que injeta o token
e desloga sozinho quando o backend responde 401. Junte `createAuthStore`,
`<RouteGuard>` e `createApiClient`.

```tsx
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

// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(),
});

// src/pages/Login.tsx
import { useState } from "react";
import { Button, Form, FormActions, Input, useNavigate } from "tempest-react-sdk";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuth.use.setSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { user, token } = await api.post<{ user: User; token: string }>("/auth/login", {
      email,
      password,
    });
    setSession({ user, token });
    navigate("/dashboard");
  }

  return (
    <Form layout="stack" gap={4} onSubmit={onSubmit}>
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Senha"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <FormActions align="end">
        <Button type="submit">Entrar</Button>
      </FormActions>
    </Form>
  );
}

// src/routes.tsx
import { defineRoutes, RouteGuard } from "tempest-react-sdk";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";

export const routes = defineRoutes([
  { path: "login", element: <Login /> },
  {
    path: "dashboard",
    element: (
      <RouteGuard when={useAuth.getState().isAuthenticated} redirectTo="/login">
        <Dashboard />
      </RouteGuard>
    ),
  },
]);
```

- `createAuthStore<User>` é um store Zustand persistido; `setSession`, `token`,
  `isAuthenticated` e `logout` vêm prontos. `getState()` lê o valor atual **fora**
  do React — exatamente o que o cliente HTTP e o guard precisam.
- O `createApiClient` injeta `Authorization: Bearer <token>` quando `getToken()`
  devolve string e, em um 401, chama `onUnauthorized` (aqui, `logout()`). Para
  renovar o token em vez de deslogar, adicione `refresh`/`createRefreshQueue` —
  veja [Auth](./auth.md).

!!! tip "Guard como rota vs. componente"
    Use `guard: () => useAuth.getState().isAuthenticated` direto na árvore de
    `defineRoutes` quando a rota inteira é protegida; use `<RouteGuard when={...}>`
    quando você protege um pedaço de JSX. Detalhes em [Routing](./routing.md).

## Lista paginada com busca e ordenação

Você quer uma tabela com busca, ordenação por coluna e paginação sem escrever esse
estado na mão. O `DataTable<T>` faz tudo client-side sobre os dados que você passar.

```tsx
// src/pages/Users.tsx
import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "tempest-react-sdk";
import { api } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const columns: DataTableColumn<User>[] = [
  { key: "name", header: "Nome", sortable: true },
  { key: "email", header: "E-mail" },
  { key: "role", header: "Papel", sortable: true, align: "right" },
];

export function Users() {
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });

  if (isLoading) return <p>Carregando…</p>;

  return (
    <DataTable
      data={data ?? []}
      columns={columns}
      searchable
      pageSize={10}
      initialSort={{ key: "name", direction: "asc" }}
      rowKey={(row) => row.id}
      emptyMessage="Nenhum usuário encontrado"
    />
  );
}
```

- `DataTable` recebe o dataset **completo** em `data` e cuida de busca,
  ordenação e paginação no cliente. Marque as colunas que podem ordenar com
  `sortable: true`; clicar no cabeçalho cicla asc → desc → sem ordenação.
- `searchable` adiciona um input acima da tabela que filtra por substring
  case-insensitive. Restrinja as colunas buscadas com `searchKeys`. Veja
  [Overlays & avançados](./components/advanced.md).

!!! note "Paginação server-side"
    Para datasets grandes, busque uma página por vez (passe `page`/`pageSize` na
    `queryFn`) e use o `Table` headless em vez do `DataTable` — assim a ordenação e a
    paginação ficam por conta do backend.

## Formulário com validação zod

Você quer um formulário validado por um schema zod, com campos brasileiros
mascarados (CPF, telefone) e mensagens de erro automáticas. Junte `useZodForm`,
`<FormProvider>` e `<FormField>`.

```tsx
// src/pages/Signup.tsx
import {
  Button,
  CPFInput,
  Form,
  FormActions,
  FormField,
  FormProvider,
  Input,
  PhoneInput,
  useZodForm,
  validateCPF,
} from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Informe seu nome"),
  email: z.string().email("E-mail inválido"),
  cpf: z.string().refine(validateCPF, "CPF inválido"),
  phone: z.string().min(14, "Telefone inválido"),
});

type SignupValues = z.infer<typeof schema>;

export function Signup() {
  const form = useZodForm(schema, {
    defaultValues: { name: "", email: "", cpf: "", phone: "" },
  });

  function onSubmit(values: SignupValues) {
    console.log("payload", values);
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Nome" required>
          <Input />
        </FormField>
        <FormField name="email" label="E-mail" required>
          <Input type="email" />
        </FormField>
        <FormField name="cpf" label="CPF" required>
          <CPFInput />
        </FormField>
        <FormField name="phone" label="Telefone" required>
          <PhoneInput />
        </FormField>
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Criar conta
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

- `useZodForm(schema, options)` embrulha `useForm` + `zodResolver` e **infere** o
  tipo dos valores a partir do schema — você não digita o tipo do form duas vezes.
- `<FormField name="cpf">` injeta `value`/`onChange`/`error` no controle filho via
  `Controller`, eliminando o boilerplate de `<Controller render={...} />`. Ele lê o
  `control` do `<FormProvider>` na árvore. Os inputs BR (`CPFInput`, `PhoneInput`)
  já aplicam a máscara — `validateCPF` valida os dígitos verificadores de verdade.
  Veja [Forms](./forms.md) e [Forms BR](./forms-br.md).

## Dark mode sem flash

Você quer alternar entre claro e escuro **sem o flash branco** no carregamento da
página. O segredo é rodar um script inline no `<head>` antes do CSS, com
`themeInitScript()`, e usar `ThemeProvider` + `useTheme` no app.

```html
<!-- index.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <script>
      // Substitua pelo retorno de themeInitScript() — lê localStorage["tempest-theme"]
      // e aplica data-tempest-theme em <html> antes da primeira pintura.
      (function () {
        try {
          var stored = localStorage.getItem("tempest-theme");
          var dark =
            stored === "dark" ||
            (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
          if (dark) document.documentElement.setAttribute("data-tempest-theme", "dark");
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/App.tsx
import { ThemeProvider, useTheme } from "tempest-react-sdk";

function ThemeToggle() {
  const { theme, resolvedTheme, toggle } = useTheme();
  return (
    <button onClick={toggle}>
      {resolvedTheme === "dark" ? "🌙" : "☀️"} ({theme})
    </button>
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <ThemeToggle />
    </ThemeProvider>
  );
}
```

- O script inline é a parte que mata o flash: ele aplica `data-tempest-theme="dark"`
  em `<html>` **antes** de qualquer CSS pintar. Gere o conteúdo dele com
  `themeInitScript()` (em SSR/React, injete via
  `<script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />`).
- `useTheme()` devolve `theme` (preferência crua), `resolvedTheme` (o que está
  aplicado) e `toggle()`. Em `defaultTheme="system"`, o provider reage ao
  `prefers-color-scheme` do sistema. Os tokens `--tempest-*` reagem sozinhos. Veja
  [Tema](./theme.md).

!!! tip "Usando o `AppProviders`"
    Se você usa o `<AppProviders>`, o tema já vem ligado — ajuste com
    `theme={{ defaultTheme: "dark" }}`. O script inline no `index.html` continua sendo
    necessário para o no-flash.

## Offline-first

Você quer guardar dados localmente (notificações, drafts) que sobrevivem a reload e
sincronizar com o backend quando estiver online. Junte `createOfflineStore` (Dexie)
com o cliente HTTP.

```ts
// src/stores/notifications.ts
import { createOfflineStore } from "tempest-react-sdk";
import { api } from "@/lib/api";

export type Notification = {
  message_id: string;
  owner_id: string;
  type: "NOTIFY" | "PAYMENT-SUCCESS";
  message: string;
  created_at: string;
  read: boolean;
};

export const notificationsStore = createOfflineStore<Notification, string>({
  databaseName: "TempestNotifications",
  version: 1,
  tableName: "notifications",
  indexes: "&message_id, owner_id, read, created_at",
  keyPath: "message_id",
  ownerField: "owner_id",
});

/**
 * Baixa do backend, grava no IndexedDB e devolve o que está em cache local.
 * Se a rede falhar, cai pro cache offline em vez de quebrar a UI.
 */
export async function syncNotifications(ownerId: string): Promise<Notification[]> {
  try {
    const fresh = await api.get<Notification[]>("/notifications");
    await notificationsStore.bulkPut(fresh, ownerId);
  } catch {
    // Offline ou backend indisponível — segue com o cache local.
  }
  return notificationsStore.list(ownerId, {
    orderBy: "created_at",
    reverse: true,
    limit: 50,
  });
}

// Marcar todas como lidas, localmente:
export async function markAllRead(ownerId: string): Promise<void> {
  await notificationsStore.updateMany(ownerId, { read: true });
}
```

- `createOfflineStore<T, K>` empacota Dexie com scoping por owner: toda operação
  recebe o `ownerId`, então dados de usuários diferentes nunca se misturam. A
  sintaxe de `indexes` é a do Dexie (`&` = chave primária única).
- O padrão de sync é simples: tenta o backend, grava o resultado com `bulkPut`, e
  **sempre** lê do store local no fim — assim a UI funciona online e offline com o
  mesmo código. Veja [Offline](./offline.md).

!!! warning "Não use para estado de UI volátil"
    IndexedDB é para dados que precisam **sobreviver a reload** (histórico, drafts,
    cache). Para estado de UI efêmero (spinner, aba ativa) use Zustand — é muito mais
    barato. Veja [State](./state.md).

## Paleta de comandos ⌘K

Você quer uma paleta estilo ⌘K que abre com o atalho de teclado e navega pelo app.
Junte o componente `Command`, o hook `useKeyboardShortcut` e o `useNavigate`.

```tsx
// src/components/CommandPalette.tsx
import { useState } from "react";
import { Command, useKeyboardShortcut, useNavigate, useTheme } from "tempest-react-sdk";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { toggle } = useTheme();

  // ⌘K (macOS) / Ctrl+K (Windows/Linux) abre a paleta.
  useKeyboardShortcut({ key: "k", mod: true }, () => setOpen(true));

  return (
    <Command
      open={open}
      onOpenChange={setOpen}
      placeholder="Digite um comando…"
      emptyMessage="Nenhum resultado"
      items={[
        {
          id: "home",
          label: "Ir para o início",
          group: "Navegação",
          onSelect: () => navigate("/"),
        },
        {
          id: "dashboard",
          label: "Abrir dashboard",
          group: "Navegação",
          keywords: ["painel"],
          onSelect: () => navigate("/dashboard"),
        },
        {
          id: "theme",
          label: "Alternar tema",
          group: "Preferências",
          onSelect: () => toggle(),
        },
      ]}
    />
  );
}
```

- O `Command` filtra os itens por substring (em `label` + `keywords`), agrupa por
  `group`, prende o foco enquanto aberto e fecha no Escape, clique fora ou seleção.
  Cada `item.onSelect` é a ação — aqui, `navigate(...)` e `toggle()`.
- `useKeyboardShortcut({ key: "k", mod: true }, ...)` casa **Ctrl ou Cmd + K** em
  qualquer OS. O hook recebe um objeto `KeyboardShortcut` (não uma string), e por
  padrão ignora o atalho quando o foco está dentro de um input. Veja
  [Overlays & avançados](./components/advanced.md) e [Hooks](./hooks.md).

## App do zero em 1 minuto

Você quer começar um projeto novo já cabeado com providers, roteamento e store de
auth — sem montar a pirâmide na mão. Use a CLI `create-tempest-app`.

```bash
# Pasta nova — npx baixa o SDK e roda o bin dele
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev            # http://127.0.0.1:5173
```

O `src/App.tsx` gerado já liga tudo com `<AppProviders>` (React Query + tema +
error boundary) por fora e o `<AppRouter>` por dentro:

```tsx
// src/App.tsx — gerado pela CLI
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

- A CLI é o **`bin` do próprio `tempest-react-sdk`** — não um pacote separado. O
  app gerado já nasce com `createAuthStore` + `createSelectors`, `defineRoutes`
  (com rota `lazy` + guard) e `createApiClient`, cada arquivo demonstrando um
  recurso do SDK.
- `<AppProviders>` aninha `ErrorBoundary → QueryProvider → ThemeProvider →
I18nProvider → children` na ordem certa, e o `<AppRouter>` monta router +
  `<Suspense>` + `<Routes>` a partir do array de rotas. Veja
  [Scaffold](./scaffold.md), [App Providers](./app-providers.md) e
  [Routing](./routing.md).

!!! tip "Já tem um projeto?"
    Dentro de um projeto existente, rode `npm install tempest-react-sdk` e
    `npx create-tempest-app .` — a CLI gera `src/` + configs **no diretório atual**,
    preservando arquivos que já existem e mesclando o `package.json`.

## Recap

- **Auth completo**: `createAuthStore` (sessão persistida) + `createApiClient`
  (token + `onUnauthorized` → `logout`) + `<RouteGuard>`/`guard` para proteger
  rotas.
- **Listas**: `DataTable<T>` resolve busca + ordenação + paginação client-side
  sobre os dados de um `useQuery`.
- **Formulários**: `useZodForm` + `<FormProvider>` + `<FormField>` + inputs BR
  mascarados dão validação tipada com schema único.
- **Dark mode**: script inline (`themeInitScript`) no `<head>` mata o flash;
  `ThemeProvider` + `useTheme().toggle()` alternam.
- **Offline**: `createOfflineStore` (Dexie, owner-scoped) + um sync "tenta backend,
  cai pro cache".
- **Paleta ⌘K**: `Command` + `useKeyboardShortcut({ key: "k", mod: true })` +
  `useNavigate`.
- **App do zero**: `create-tempest-app` gera tudo cabeado com `<AppProviders>` +
  `<AppRouter>`.
