# Exemplo integrado: app de gestão

As outras receitas resolvem uma tela por vez. Esta junta tudo num **app inteiro**: o back-office de uma clínica pequena, do login ao gráfico de faturamento, com papéis diferentes vendo coisas diferentes. 🏥

A clínica **Vida Plena** tem três tipos de pessoa usando o sistema:

- **Gestora** (`gestor`): vê tudo, inclusive o faturamento, e é a única que pode remover um paciente.
- **Recepção** (`recepcao`): cadastra e edita pacientes, vê o painel do dia.
- **Médico** (`medico`): abre o painel para ver a agenda da semana. O cadastro de pacientes não é com ele — o prontuário mora em outro sistema.

Elas abrem o app no computador da recepção e no celular, entre um atendimento e outro. O app precisa aguentar isso: rede lenta, sessão que expira, tela de celular, alguém digitando um endereço que não existe.

## O que vamos construir

- 🔐 **Login** com e-mail e senha, erro claro para senha errada, e volta para a página que a pessoa tentou abrir.
- 🧭 **Casca do app** com barra superior, menu lateral no desktop e barra inferior no celular. O menu só mostra o que o papel pode abrir.
- 📊 **Painel** com quatro indicadores, consultas por dia, pacientes por convênio e faturamento dos últimos 6 meses — este último só para a gestora.
- 🗂️ **Pacientes**: lista paginada com busca, cadastro e edição num modal, remoção com confirmação. Cada botão respeita o papel.
- ⚙️ **Configurações**: tema claro/escuro/sistema e idioma (português ou inglês).
- 🧯 **Erro e 404**: uma tela quebrada não derruba o app, e um endereço errado mostra uma página de verdade.

Cada tela cobre os cinco estados de uma tela real: **carregando**, **vazio**, **erro**, **sucesso** e **celular**.

!!! info "O que você precisa"
    Um projeto criado com o [`create-tempest-app`](../scaffold.md). Os arquivos desta página **substituem** os gerados pelo scaffold e acrescentam os que faltam. Instale também o `recharts` (dependência opcional do [`/charts`](../charts.md)) e o `zod`:

    ```bash
    npm install recharts zod @tanstack/react-query
    ```

    O `@tanstack/react-query` já vem com o SDK; declarar no seu `package.json` deixa explícito que o app importa dele. Rode `npx tempest doctor` depois: ele avisa se o npm aninhou uma segunda cópia.

## O contrato com o backend

O backend é um serviço FastAPI feito com o `tempest-fastapi-sdk`, montado sob `/api`. São seis rotas:

| Método | Rota | Quem chama | Resposta |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | login | `{ "access_token": "…", "token_type": "bearer", "refresh_token": "…" }` |
| `GET` | `/api/auth/me` | depois do login | `User` |
| `GET` | `/api/dashboard/summary` | painel | `DashboardSummary` |
| `GET` | `/api/dashboard/revenue` | painel (só gestora) | `RevenueReport` — `403` para os outros papéis |
| `GET` | `/api/patients?search=&page=&size=` | pacientes | `{ "items": [...], "total": 27, "page": 1, "size": 20, "pages": 2 }` |
| `POST` · `PATCH` · `DELETE` | `/api/patients` · `/api/patients/{id}` | pacientes | `Patient` (`204` no `DELETE`) |

O usuário que o `/api/auth/me` devolve:

```json
{ "id": "u1", "name": "Marina Costa", "email": "gestor@vidaplena.com.br", "role": "gestor" }
```

E um dia do resumo do painel — repare que `date` é **só a data**, sem hora:

```json
{ "date": "2026-11-16", "done": 31, "no_show": 3 }
```

A página [Integração FastAPI](../integration-fastapi.md) explica cada envelope (`access_token`, a página `{ items, total, page, size, pages }`, o erro com `code` e `fields`).

## A estrutura

```text
vida-plena/
├── .env                          VITE_API_URL=http://127.0.0.1:8000
└── src/
    ├── main.tsx                  monta o app
    ├── App.tsx                   providers + router
    ├── routes.tsx                árvore de rotas com guards
    ├── types.ts                  os tipos do contrato acima
    ├── lib/
    │   ├── api.ts                sessão, cliente HTTP, cache, query keys
    │   └── access.tsx            papéis → permissões
    ├── locales/
    │   └── messages.ts           catálogo pt-BR + en
    ├── layouts/
    │   └── AppLayout.tsx         barra, menu lateral, barra inferior
    └── pages/
        ├── Login.tsx
        ├── Dashboard.tsx
        ├── Patients.tsx
        ├── patients/
        │   └── PatientFormModal.tsx
        ├── Settings.tsx
        └── NotFound.tsx
```

O scaffold gera `src/stores/auth.ts`, `src/layouts/RootLayout.tsx`, `src/pages/Home.tsx` e o `Dashboard.tsx` de exemplo. Apague os três primeiros: a sessão passa a morar em `src/lib/api.ts`, e o `Dashboard.tsx` é substituído pelo desta página.

Vamos de baixo para cima: primeiro os tipos e a sessão, depois a casca, depois cada tela. 🚀

## Os tipos

```ts
// src/types.ts
export type Role = "gestor" | "recepcao" | "medico";

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
}

export interface Patient {
    id: string;
    name: string;
    cpf: string;
    phone: string;
    email: string | null;
    insurance: string | null;
    created_at: string;
}

export interface AppointmentsByDay {
    date: string;
    done: number;
    no_show: number;
}

export interface InsuranceShare {
    insurance: string;
    patients: number;
}

export interface DashboardSummary {
    appointments_today: number;
    appointments_today_delta: number;
    active_patients: number;
    no_show_rate: number;
    appointments_by_day: AppointmentsByDay[];
    insurance_mix: InsuranceShare[];
}

export interface RevenuePoint {
    month: string;
    total: number;
}

export interface RevenueReport {
    month_total: number;
    by_month: RevenuePoint[];
}
```

Um arquivo, espelhando o JSON do backend campo a campo. Os nomes ficam em inglês e em `snake_case`, como o FastAPI devolve: converter para `camelCase` no meio do caminho é uma camada a mais para manter e uma fonte a mais de bug.

`Role` é uma união fechada. É ela que deixa o TypeScript reclamar quando alguém escrever `"recepção"` com cedilha num lugar e sem no outro.

## A sessão e o cliente HTTP

```ts
// src/lib/api.ts
import { createQueryClient, createQueryKeys, createTempestAuth } from "tempest-react-sdk";

import type { User } from "@/types";

export const queryClient = createQueryClient();

export const auth = createTempestAuth<User>({
    baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000",
    prefix: "/api",
    mePath: "/auth/me",
    storeName: "vida-plena-auth",
    retry: true,
    onSessionEnd: () => {
        queryClient.clear();
    },
});

export const api = auth.api;

export const queryKeys = createQueryKeys("vida-plena", {
    dashboard: () => ["dashboard"],
    revenue: () => ["revenue"],
    patients: () => ["patients"],
    patientList: (search: string) => ["patients", { search }],
});
```

Este arquivo é o coração do app. Pedaço por pedaço:

- **`createTempestAuth<User>`** monta a sessão inteira: o store persistido, o cliente com `Authorization: Bearer`, e o `401 → refresh → repete a chamada` sem você escrever nada. É o preset feito para o contrato do `tempest-fastapi-sdk` — veja [Integração FastAPI → autenticação](../integration-fastapi.md#5-autenticacao-turn-key-createtempestauth).
- **`prefix: "/api"`** diz que o serviço mora sob `/api`. Daí em diante você escreve `"/patients"`, não `"/api/patients"`.
- **`mePath: "/auth/me"`** faz o `login()` buscar o usuário logo depois do token. É de lá que vem o `role`.
- **`storeName`** dá um nome próprio à chave no `localStorage`. Dois apps Tempest no mesmo domínio não brigam pela mesma sessão.
- **`retry: true`** repete `GET` que falhou por rede ou `5xx`. Escrita nunca é repetida sozinha — um `POST` repetido poderia cadastrar o paciente duas vezes.
- **`onSessionEnd`** limpa o cache de queries quando a sessão termina — no **Sair**, na expiração e na troca de conta. Sem isso, a recepcionista que entra depois da gestora veria, por um instante, o faturamento que ficou no cache.

!!! note "Por que o app cria o `QueryClient`"
    O `AppProviders` cria um `QueryClient` sozinho, mas ele fica preso lá dentro, e o `onSessionEnd` precisa chamar `clear()` nele. Então o app cria o próprio com `createQueryClient()` e o entrega ao provider. É o mesmo client, com os mesmos defaults do SDK, sem redigitar nenhum — veja [`createQueryClient`](../query.md#createqueryclient-o-client-fora-do-react).

**`createQueryKeys`** dá um prefixo comum a todas as chaves de cache. Repare na dupla `patients()` / `patientList(search)`: a lista é guardada por busca, e invalidar `patients()` derruba **todas** as buscas de uma vez depois de um cadastro.

## Papéis e permissões

```tsx
// src/lib/access.tsx
import { useMemo, type ReactNode } from "react";
import { AccessControlProvider, createRoleAccessControl } from "tempest-react-sdk";

import { auth } from "@/lib/api";
import type { Role } from "@/types";

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
    gestor: ["*"],
    recepcao: ["dashboard:read", "patients:read", "patients:create", "patients:update"],
    medico: ["dashboard:read"],
};

export function RoleAccessProvider({ children }: { children: ReactNode }): ReactNode {
    const role = auth.useAuthStore((state) => state.user?.role);
    const control = useMemo(
        () => createRoleAccessControl({ role, roles: ROLE_PERMISSIONS }),
        [role],
    );

    return <AccessControlProvider control={control}>{children}</AccessControlProvider>;
}
```

O papel vem do backend; **o que cada papel pode fazer** fica aqui, num lugar só. As permissões seguem o formato `"recurso:ação"` do [`createRoleAccessControl`](../access-control.md), e `"*"` libera tudo.

O `RoleAccessProvider` lê o `role` do usuário logado e recria a estratégia quando ele muda — no login, no Sair, na troca de conta. Todo `useCan` e todo `<Can>` abaixo dele passam a responder pelo papel atual.

!!! danger "Permissão no front é UX, não segurança"
    Esconder o botão "Remover" da recepção evita o clique errado. Quem **impede** a remoção é o backend, que devolve `403` para quem não pode. Cada regra desta tabela precisa existir também na API.

## O catálogo de idiomas

```ts
// src/locales/messages.ts
import type { Catalog } from "tempest-react-sdk";

export const messages: Catalog = {
    "pt-BR": {
        "nav.dashboard": "Painel",
        "nav.patients": "Pacientes",
        "nav.settings": "Configurações",
        "nav.logout": "Sair",
        "common.errorTitle": "Algo deu errado",
        "common.retry": "Tentar de novo",
        "page.error": "Esta tela encontrou um erro inesperado.",
        "dashboard.title": "Painel da clínica",
        "dashboard.description": "O dia de hoje e os últimos 7 dias, num relance.",
        "dashboard.today": "Consultas hoje",
        "dashboard.vsLastWeek": "vs. mesmo dia da semana passada",
        "dashboard.active": "Pacientes ativos",
        "dashboard.activeHint": "Com consulta nos últimos 12 meses",
        "dashboard.noShow": "Taxa de faltas",
        "dashboard.noShowHint": "Últimos 7 dias",
        "dashboard.week": "Consultas por dia",
        "dashboard.series.done": "Realizadas",
        "dashboard.series.noShow": "Faltas",
        "dashboard.mix": "Pacientes por convênio",
        "dashboard.series.patients": "Pacientes",
        "dashboard.empty": "Nenhuma consulta nos últimos 7 dias",
        "dashboard.emptyHint": "Os gráficos aparecem assim que a agenda tiver atendimentos.",
        "dashboard.error": "Não foi possível carregar o painel.",
        "dashboard.revenue": "Faturamento do mês",
        "dashboard.revenueChart": "Faturamento nos últimos 6 meses",
        "dashboard.series.revenue": "Faturamento",
        "dashboard.revenueError": "Não foi possível carregar o faturamento.",
        "settings.title": "Configurações",
        "settings.description": "Preferências deste navegador. Não afetam a sua equipe.",
        "settings.theme": "Tema",
        "settings.light": "Claro",
        "settings.dark": "Escuro",
        "settings.system": "Sistema",
        "settings.language": "Idioma",
        "notFound.title": "Página não encontrada",
        "notFound.description": "O endereço não existe ou foi movido.",
        "notFound.back": "Voltar ao painel",
    },
    en: {
        "nav.dashboard": "Dashboard",
        "nav.patients": "Patients",
        "nav.settings": "Settings",
        "nav.logout": "Sign out",
        "common.errorTitle": "Something went wrong",
        "common.retry": "Try again",
        "page.error": "This screen hit an unexpected error.",
        "dashboard.title": "Clinic dashboard",
        "dashboard.description": "Today and the last 7 days, at a glance.",
        "dashboard.today": "Appointments today",
        "dashboard.vsLastWeek": "vs. same weekday last week",
        "dashboard.active": "Active patients",
        "dashboard.activeHint": "Seen in the last 12 months",
        "dashboard.noShow": "No-show rate",
        "dashboard.noShowHint": "Last 7 days",
        "dashboard.week": "Appointments per day",
        "dashboard.series.done": "Attended",
        "dashboard.series.noShow": "No-shows",
        "dashboard.mix": "Patients by health plan",
        "dashboard.series.patients": "Patients",
        "dashboard.empty": "No appointments in the last 7 days",
        "dashboard.emptyHint": "The charts show up once the schedule has appointments.",
        "dashboard.error": "Could not load the dashboard.",
        "dashboard.revenue": "Revenue this month",
        "dashboard.revenueChart": "Revenue over the last 6 months",
        "dashboard.series.revenue": "Revenue",
        "dashboard.revenueError": "Could not load the revenue.",
        "settings.title": "Settings",
        "settings.description": "Preferences for this browser. They do not affect your team.",
        "settings.theme": "Theme",
        "settings.light": "Light",
        "settings.dark": "Dark",
        "settings.system": "System",
        "settings.language": "Language",
        "notFound.title": "Page not found",
        "notFound.description": "The address does not exist or has moved.",
        "notFound.back": "Back to the dashboard",
    },
};
```

Chaves com namespace (`dashboard.today`), um bloco por idioma. O [i18n do SDK](../i18n.md) cai no `fallbackLocale` quando uma chave falta, então uma tradução esquecida mostra o português, não a chave crua.

!!! note "Só a casca, o painel e as configurações são traduzidos"
    A tela de pacientes e o login ficam em português de propósito: são da recepção, que trabalha em português. O idioma existe para a gestora, que mostra o painel para sócios de fora. Para traduzir o resto, é o mesmo caminho: chave no catálogo, `t("…")` na tela.

## Montando o app

```tsx
// src/main.tsx
import "tempest-react-sdk/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
```

Igual ao do scaffold: o CSS do SDK uma vez, e o `<App />`.

```tsx
// src/App.tsx
import type { ReactNode } from "react";
import {
    AppProviders,
    AppRouter,
    Center,
    ErrorState,
    Spinner,
    ToastProvider,
} from "tempest-react-sdk";

import { RoleAccessProvider } from "@/lib/access";
import { queryClient } from "@/lib/api";
import { messages } from "@/locales/messages";
import { routes } from "@/routes";

const PAGE_LOADER: ReactNode = (
    <Center minHeight="60vh">
        <Spinner size="lg" label="Carregando…" />
    </Center>
);

export function App(): ReactNode {
    return (
        <AppProviders
            query={{ client: queryClient }}
            theme={{ defaultTheme: "system" }}
            i18n={{ locale: "pt-BR", fallbackLocale: "pt-BR", messages }}
            errorBoundary={{
                fallback: ({ reset }) => (
                    <ErrorState
                        title="Algo deu errado"
                        description="Recarregue a página. Se o problema continuar, avise a gestão da clínica."
                        onRetry={reset}
                    />
                ),
                onError: (error, info) => console.error(error, info.componentStack),
            }}
        >
            <ToastProvider position="top-right">
                <RoleAccessProvider>
                    <AppRouter routes={routes} fallback={PAGE_LOADER} />
                </RoleAccessProvider>
            </ToastProvider>
        </AppProviders>
    );
}
```

O [`AppProviders`](../app-providers.md) monta, de fora para dentro: o error boundary global, o React Query com o **nosso** `queryClient`, o tema e o i18n. Dentro dele:

- **`ToastProvider`** — as confirmações rápidas ("Cadastro atualizado.").
- **`RoleAccessProvider`** — as permissões, que precisam estar **acima** do router, porque os guards das rotas chamam `useCan`.
- **`AppRouter`** — a árvore de rotas.

O error boundary global usa texto fixo em português porque ele fica **fora** do `I18nProvider`: quando ele aparece, pode ser justamente o i18n que quebrou.

!!! tip "`PAGE_LOADER` é uma constante de módulo"
    O `AppRouter` refaz a árvore de rotas quando o `fallback` muda de identidade. Um JSX escrito direto na prop seria um objeto novo a cada render do `App`. A constante fora do componente evita isso — e o mesmo spinner cobre o carregamento do chunk de cada página **e** o guard que ainda está decidindo.

## As rotas

```tsx
// src/routes.tsx
import { defineRoutes, useCan, type RouteGuardResult } from "tempest-react-sdk";

import { AppLayout } from "@/layouts/AppLayout";
import { auth } from "@/lib/api";
import { Login } from "@/pages/Login";
import { NotFound } from "@/pages/NotFound";

export const routes = defineRoutes([
    { path: "/login", element: <Login /> },
    {
        path: "/",
        element: <AppLayout />,
        redirectTo: "/login",
        preserveFrom: true,
        guard: function useSessionGuard(): RouteGuardResult {
            return auth.useAuthStore((state) => state.isAuthenticated && state.user !== null);
        },
        children: [
            { index: true, lazy: () => import("@/pages/Dashboard") },
            {
                path: "pacientes",
                lazy: () => import("@/pages/Patients"),
                redirectTo: "/",
                guard: function usePatientsGuard(): RouteGuardResult {
                    const { allowed, isLoading } = useCan({ action: "read", resource: "patients" });
                    return isLoading ? "pending" : allowed;
                },
            },
            { path: "configuracoes", lazy: () => import("@/pages/Settings") },
            { path: "*", element: <NotFound /> },
        ],
    },
]);
```

Aqui moram as duas portas do app. 🚪

**A porta da sessão** está na rota `/`, que envolve todas as outras. O guard `useSessionGuard` é um hook — por isso o nome começa com `use` — e assina o store: quando a sessão termina, por Sair ou por expiração, ele re-renderiza sozinho e manda para `/login`. O `preserveFrom: true` leva junto o endereço de onde a pessoa veio.

O guard pede **token e usuário**. Entre o token chegar e o `/auth/me` responder existe um instante em que só o token existe; sem o usuário não há papel, e sem papel as permissões dizem "não" para tudo. É só esse instante: se o `/auth/me` falha, o `login()` desfaz a entrada antes de rejeitar, e o token não fica sozinho no store (#748).

**A porta do papel** está em `pacientes`. O `useCan` responde numa passada de efeito, então no primeiro render ele ainda não sabe. O guard devolve `"pending"` nesse meio-tempo: o app mostra o spinner, em vez de mandar a recepcionista embora num piscar de olhos. Detalhes em [Roteamento → `"pending"`](../routing.md#forma-de-funcao-assincrona-o-terceiro-estado-pending).

As páginas entram por `lazy`: o médico, que nunca abre pacientes, nunca baixa o código dela.

E o `path: "*"` **dentro** da rota protegida faz o 404 aparecer com o menu em volta — quem errou o endereço ainda tem para onde ir.

## O login

```tsx
// src/pages/Login.tsx
import type { ReactNode } from "react";
import { AuthPage, LoginForm, Navigate, useReturnTo } from "tempest-react-sdk";

import { auth } from "@/lib/api";

export function Login(): ReactNode {
    const returnTo = useReturnTo("/");
    const signedIn = auth.useAuthStore((state) => state.isAuthenticated && state.user !== null);

    if (signedIn) return <Navigate to={returnTo} replace />;

    return (
        <AuthPage
            brand={<strong>Vida Plena</strong>}
            title="Bem-vindo(a) de volta"
            subtitle="Entre com o e-mail da clínica para abrir o painel."
            aside={{ content: <p>Agenda, pacientes e faturamento num lugar só.</p> }}
            footer={<small>Problemas para entrar? Fale com a gestão da clínica.</small>}
        >
            <LoginForm
                onSubmit={async (values) => {
                    await auth.login(values);
                }}
                errorOptions={{
                    statuses: {
                        401: "E-mail ou senha incorretos.",
                        423: "Conta bloqueada após várias tentativas. Fale com a gestão.",
                    },
                }}
            />
        </AuthPage>
    );
}
```

A tela é o [`AuthPage`](../components/auth-screens.md) com o `LoginForm`: layout de folha no celular, duas colunas no desktop, validação de e-mail e senha, botão com loading.

O `onSubmit` só chama `auth.login(values)`. Quem navega é o próprio componente: quando o store passa a ter usuário, o `signedIn` vira `true` e o `<Navigate>` leva a pessoa para o `returnTo`. O [`useReturnTo`](../routing.md#voltar-para-onde-estava-depois-do-login) devolve a página de onde ela veio — e recusa qualquer endereço de fora do app.

Esse mesmo `if` cobre quem já está logado e abre `/login` de novo: volta direto para o painel.

Quando a senha está errada, a API responde `401`. O `LoginForm` captura o erro e mostra um alerta acima dos campos, com a frase do `errorOptions.statuses`. O `423` cobre a conta bloqueada depois de várias tentativas.

## A casca

```tsx
// src/layouts/AppLayout.tsx
import { LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
    AppShell,
    Avatar,
    BottomNavigation,
    Button,
    ErrorBoundary,
    ErrorState,
    Navbar,
    Outlet,
    Sidebar,
    activeNavKey,
    useCan,
    useI18n,
    useLocation,
    useNavigate,
    type SidebarItem,
} from "tempest-react-sdk";

import { auth } from "@/lib/api";

export function AppLayout(): ReactNode {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const user = auth.useAuthStore((state) => state.user);
    const patients = useCan({ action: "read", resource: "patients" });

    const items: SidebarItem[] = [
        {
            key: "/",
            href: "/",
            label: t("nav.dashboard"),
            icon: <LayoutDashboard size={18} />,
        },
        ...(patients.allowed
            ? [
                  {
                      key: "/pacientes",
                      href: "/pacientes",
                      label: t("nav.patients"),
                      icon: <Users size={18} />,
                  },
              ]
            : []),
        {
            key: "/configuracoes",
            href: "/configuracoes",
            label: t("nav.settings"),
            icon: <Settings size={18} />,
        },
    ];

    return (
        <AppShell
            navbar={
                <Navbar
                    logo={<strong>Vida Plena</strong>}
                    actions={
                        <>
                            <Avatar name={user?.name} size="sm" />
                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<LogOut size={16} />}
                                onClick={() => void auth.logout()}
                            >
                                {t("nav.logout")}
                            </Button>
                        </>
                    }
                />
            }
            sidebar={
                <Sidebar
                    items={items}
                    value={pathname}
                    match="route"
                    onChange={(key) => navigate(key)}
                />
            }
            bottomNav={
                <BottomNavigation
                    items={items}
                    value={activeNavKey(
                        pathname,
                        items.map((item) => item.key),
                    )}
                    onChange={(key) => navigate(key)}
                />
            }
        >
            <ErrorBoundary
                resetKeys={[pathname]}
                fallback={({ reset }) => (
                    <ErrorState
                        title={t("common.errorTitle")}
                        description={t("page.error")}
                        retryLabel={t("common.retry")}
                        onRetry={reset}
                    />
                )}
            >
                <Outlet />
            </ErrorBoundary>
        </AppShell>
    );
}
```

O [`AppShell`](../components/layout.md#appshell) troca a navegação pelo tamanho da tela: `Sidebar` a partir de `md`, `BottomNavigation` abaixo disso. 📱

- **Os itens dependem do papel.** `useCan` decide se "Pacientes" entra na lista. O médico nem vê a entrada — e se digitar `/pacientes`, o guard da rota o devolve ao painel.
- **A `Sidebar` resolve o item ativo sozinha** com `match="route"`: em `/pacientes?page=2` o item "Pacientes" continua aceso. Os itens têm `href`, então ctrl-clique abre em outra aba.
- **A `BottomNavigation` recebe a mesma lista**, com o item ativo calculado pelo [`activeNavKey`](../components/navigation.md#activenavkey-a-mesma-resolucao-fora-do-sidebar).
- **O Sair** chama `auth.logout()` e mais nada. O store limpa na hora, o `onSessionEnd` limpa o cache, e o guard da sessão leva para o login.

O `ErrorBoundary` em volta do `<Outlet />` é o **segundo** boundary do app, e o que mais aparece: um erro de render no painel troca só o conteúdo por uma tela de erro, e o menu continua lá. O `resetKeys={[pathname]}` limpa o erro quando a pessoa navega para outra página. Veja [Error Boundary](../error-boundary.md).

## O painel

```tsx
// src/pages/Dashboard.tsx
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { CalendarCheck, CircleDollarSign, UserX, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
    Can,
    Card,
    EmptyState,
    ErrorState,
    Grid,
    Page,
    Skeleton,
    Stack,
    Stat,
    useDocumentTitle,
    useI18n,
} from "tempest-react-sdk";
import { BarChart, LineChart, PieChart } from "tempest-react-sdk/charts";

import { api, queryKeys } from "@/lib/api";
import type { DashboardSummary, RevenueReport } from "@/types";

function useRevenue(): UseQueryResult<RevenueReport, Error> {
    return useQuery({
        queryKey: queryKeys.revenue(),
        queryFn: () => api.get<RevenueReport>("/dashboard/revenue"),
    });
}

function useMoney(): (value: number) => string {
    const { formatNumber } = useI18n();
    return (value: number): string =>
        formatNumber(value, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function RevenueStat(): ReactNode {
    const { t } = useI18n();
    const money = useMoney();
    const revenue = useRevenue();

    if (revenue.isPending) return <Skeleton height={112} />;
    return (
        <Stat
            label={t("dashboard.revenue")}
            value={revenue.isError ? "—" : money(revenue.data.month_total)}
            icon={<CircleDollarSign size={18} />}
        />
    );
}

function RevenueChart(): ReactNode {
    const { t, formatDate, formatNumber } = useI18n();
    const revenue = useRevenue();
    const compactMoney = (value: number): string =>
        formatNumber(value, { style: "currency", currency: "BRL", notation: "compact" });

    if (revenue.isPending) return <Skeleton height={340} />;
    if (revenue.isError) {
        return (
            <ErrorState
                title={t("common.errorTitle")}
                description={t("dashboard.revenueError")}
                retryLabel={t("common.retry")}
                onRetry={() => void revenue.refetch()}
            />
        );
    }

    const series = t("dashboard.series.revenue");
    const data = revenue.data.by_month.map((point) => ({
        month: formatDate(`${point.month}-01`, { month: "short", timeZone: "UTC" }),
        [series]: point.total,
    }));

    return (
        <Card title={t("dashboard.revenueChart")}>
            <LineChart
                data={data}
                index="month"
                categories={[series]}
                valueFormatter={compactMoney}
                height={280}
            />
        </Card>
    );
}

function DashboardSkeleton(): ReactNode {
    return (
        <Stack gap={4}>
            <Grid columns={{ mobile: 1, tablet: 2, desktop: 4 }} gap={4}>
                <Skeleton height={112} />
                <Skeleton height={112} />
                <Skeleton height={112} />
            </Grid>
            <Skeleton height={340} />
        </Stack>
    );
}

function DashboardBody({ summary }: { summary: DashboardSummary }): ReactNode {
    const { t, formatDate, formatNumber } = useI18n();
    const done = t("dashboard.series.done");
    const noShow = t("dashboard.series.noShow");
    const patients = t("dashboard.series.patients");

    const week = summary.appointments_by_day.map((day) => ({
        day: formatDate(day.date, { weekday: "short", day: "2-digit", timeZone: "UTC" }),
        [done]: day.done,
        [noShow]: day.no_show,
    }));
    const mix = summary.insurance_mix.map((share) => ({
        insurance: share.insurance,
        [patients]: share.patients,
    }));
    const delta = summary.appointments_today_delta;
    const isEmptyWeek = summary.appointments_by_day.every((day) => day.done + day.no_show === 0);

    return (
        <Stack gap={4}>
            <Grid columns={{ mobile: 1, tablet: 2, desktop: 4 }} gap={4}>
                <Stat
                    label={t("dashboard.today")}
                    value={formatNumber(summary.appointments_today)}
                    delta={formatNumber(delta, { style: "percent", signDisplay: "exceptZero" })}
                    trend={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
                    hint={t("dashboard.vsLastWeek")}
                    icon={<CalendarCheck size={18} />}
                />
                <Stat
                    label={t("dashboard.active")}
                    value={formatNumber(summary.active_patients)}
                    hint={t("dashboard.activeHint")}
                    icon={<Users size={18} />}
                />
                <Stat
                    label={t("dashboard.noShow")}
                    value={formatNumber(summary.no_show_rate, {
                        style: "percent",
                        maximumFractionDigits: 1,
                    })}
                    hint={t("dashboard.noShowHint")}
                    icon={<UserX size={18} />}
                />
                <Can action="read" resource="finance">
                    <RevenueStat />
                </Can>
            </Grid>

            {isEmptyWeek ? (
                <EmptyState
                    icon={<CalendarCheck size={40} />}
                    title={t("dashboard.empty")}
                    description={t("dashboard.emptyHint")}
                />
            ) : (
                <Grid columns={{ mobile: 1, desktop: "2fr 1fr" }} gap={4}>
                    <Card title={t("dashboard.week")}>
                        <BarChart
                            data={week}
                            index="day"
                            categories={[done, noShow]}
                            stack
                            height={280}
                        />
                    </Card>
                    <Card title={t("dashboard.mix")}>
                        <PieChart
                            data={mix}
                            index="insurance"
                            category={patients}
                            donut
                            height={280}
                        />
                    </Card>
                </Grid>
            )}

            <Can action="read" resource="finance">
                <RevenueChart />
            </Can>
        </Stack>
    );
}

export default function Dashboard(): ReactNode {
    const { t } = useI18n();
    useDocumentTitle(t("dashboard.title"));
    const summary = useQuery({
        queryKey: queryKeys.dashboard(),
        queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    });

    return (
        <Page title={t("dashboard.title")} description={t("dashboard.description")}>
            {summary.isPending ? (
                <DashboardSkeleton />
            ) : summary.isError ? (
                <ErrorState
                    title={t("common.errorTitle")}
                    description={t("dashboard.error")}
                    retryLabel={t("common.retry")}
                    onRetry={() => void summary.refetch()}
                />
            ) : (
                <DashboardBody summary={summary.data} />
            )}
        </Page>
    );
}
```

A tela mais densa do app. Vamos por partes. 📊

**Os estados.** O componente de fora só decide qual dos três mostrar: `isPending` → esqueleto no formato da tela, `isError` → `ErrorState` com "Tentar de novo", senão o conteúdo. O esqueleto tem o mesmo desenho do painel pronto, então nada pula quando os dados chegam.

**Os indicadores.** Quatro [`Stat`](../components/feedback.md#stat) num `Grid` de uma coluna no celular, duas no tablet e quatro no desktop. Os números passam pelo `formatNumber` do i18n: `1.284` em português, `1,284` em inglês.

**O faturamento só para a gestora.** `RevenueStat` e `RevenueChart` estão dentro de `<Can action="read" resource="finance">`. O `<Can>` não renderiza os filhos para quem não pode — e componente que não monta não dispara a query. O `/dashboard/revenue` nunca é chamado pela recepção.

Os dois usam o mesmo `useRevenue()`, com a mesma query key. O React Query faz **uma** requisição e entrega a resposta aos dois.

**O vazio.** Uma clínica recém-aberta tem a semana zerada. Em vez de dois gráficos vazios, um `EmptyState` explica quando eles vão aparecer.

**Os gráficos.** `BarChart` empilhado, `PieChart` em rosca e `LineChart`, do subpath [`tempest-react-sdk/charts`](../charts.md). O formato de dados é sempre o mesmo: `index` é a chave do eixo, `categories` são as séries.

!!! warning "O nome da série é a chave do objeto"
    O gráfico usa a chave de cada série como texto da legenda e do tooltip. Por isso os dados são remontados com a **frase traduzida** como chave: `[done]: day.done`, onde `done` vale `"Realizadas"` ou `"Attended"`. Trocar o idioma refaz os dados e a legenda acompanha.

!!! warning "`timeZone: \"UTC\"` em data sem hora"
    `"2026-11-16"` é lido pelo JavaScript como meia-noite **UTC**, que em Brasília ainda é dia 15 às 21h. Formatada no fuso local, a segunda-feira vira domingo. Como a data veio sem hora, formate em UTC — ela volta a ser o dia 16 que o backend mandou.

!!! tip "Eixo com dinheiro: notação compacta"
    No gráfico de faturamento, o `valueFormatter` usa `notation: "compact"`. `R$ 186.430` vira `R$ 186 mil`, que cabe na largura do eixo Y no celular. O cartão do mês continua mostrando o valor inteiro.

## Pacientes

Este é o módulo de cadastro, numa versão enxuta. A receita [Painel CRUD (admin)](./admin-crud.md) vai fundo nesse tipo de tela; aqui o foco é como ele se encaixa no app.

```tsx
// src/pages/Patients.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
    Badge,
    Button,
    Can,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    Page,
    Pagination,
    SearchBar,
    Skeleton,
    Stack,
    Table,
    encodeIdSegment,
    formatCPF,
    formatPhone,
    useCan,
    useDebounce,
    useDescribeApiError,
    useDocumentTitle,
    usePaginatedQuery,
    useToast,
    type OffsetPage,
    type TableColumn,
} from "tempest-react-sdk";

import { api, queryKeys } from "@/lib/api";
import { PatientFormModal } from "@/pages/patients/PatientFormModal";
import type { Patient } from "@/types";

interface Editing {
    patient: Patient | null;
}

export default function Patients(): ReactNode {
    useDocumentTitle("Pacientes");
    const [search, setSearch] = useState("");
    const term = useDebounce(search.trim(), 300);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [removing, setRemoving] = useState<Patient | null>(null);
    const canUpdate = useCan({ action: "update", resource: "patients" }).allowed;
    const canDelete = useCan({ action: "delete", resource: "patients" }).allowed;
    const queryClient = useQueryClient();
    const toast = useToast();
    const describe = useDescribeApiError();

    const patients = usePaginatedQuery<Patient>({
        queryKey: queryKeys.patientList(term),
        pageSize: 20,
        queryFn: (params) =>
            api.get<OffsetPage<Patient>>("/patients", {
                params: { ...params, search: term || undefined },
            }),
    });

    const remove = useMutation({
        mutationFn: (patient: Patient) =>
            api.delete<void>(`/patients/${encodeIdSegment(patient.id)}`),
        onSuccess: async (_result, patient) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.patients() });
            toast.success(`${patient.name} foi removido(a) do cadastro.`);
            setRemoving(null);
        },
        onError: (error) => {
            toast.error(
                describe(error, "Não foi possível remover o paciente.", {
                    statuses: { 409: "Este paciente tem consultas futuras na agenda." },
                }),
            );
        },
    });

    const columns: TableColumn<Patient>[] = [
        { key: "name", header: "Nome", render: (patient) => <strong>{patient.name}</strong> },
        {
            key: "cpf",
            header: "CPF",
            render: (patient) => formatCPF(patient.cpf),
            priority: "tablet",
        },
        { key: "phone", header: "Celular", render: (patient) => formatPhone(patient.phone) },
        {
            key: "insurance",
            header: "Convênio",
            priority: "desktop",
            render: (patient) => (
                <Badge variant={patient.insurance ? "info" : "neutral"}>
                    {patient.insurance ?? "Particular"}
                </Badge>
            ),
        },
        {
            key: "actions",
            header: "Ações",
            align: "right",
            render: (patient) => (
                <Stack direction="horizontal" gap={1} justify="end">
                    {canUpdate && (
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={`Editar ${patient.name}`}
                            onClick={() => setEditing({ patient })}
                        >
                            <Pencil size={16} />
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={`Remover ${patient.name}`}
                            onClick={() => setRemoving(patient)}
                        >
                            <Trash2 size={16} />
                        </Button>
                    )}
                </Stack>
            ),
        },
    ];

    const newPatientButton = (
        <Can action="create" resource="patients">
            <Button leftIcon={<UserPlus size={16} />} onClick={() => setEditing({ patient: null })}>
                Novo paciente
            </Button>
        </Can>
    );

    let body: ReactNode;
    if (patients.isLoading) {
        body = (
            <Stack gap={2}>
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
            </Stack>
        );
    } else if (patients.error) {
        body = (
            <ErrorState
                description={describe(patients.error, "Não foi possível carregar os pacientes.")}
                onRetry={patients.refetch}
            />
        );
    } else if (patients.items.length === 0) {
        body = term ? (
            <EmptyState
                icon={<Users size={40} />}
                title={`Nenhum paciente encontrado para "${term}"`}
                description="Confira a grafia ou busque pelo CPF."
                action={
                    <Button variant="ghost" onClick={() => setSearch("")}>
                        Limpar busca
                    </Button>
                }
            />
        ) : (
            <EmptyState
                icon={<Users size={40} />}
                title="Nenhum paciente cadastrado"
                description="Cadastre o primeiro paciente para começar a agendar consultas."
                action={newPatientButton}
            />
        );
    } else {
        body = (
            <Table
                data={patients.items}
                columns={columns}
                rowKey={(patient) => patient.id}
                stackOnMobile
                scrollLabel="Pacientes"
            />
        );
    }

    return (
        <Page
            eyebrow="Cadastro"
            title="Pacientes"
            description={`${patients.total} pacientes no cadastro da clínica.`}
            actions={newPatientButton}
            toolbar={
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar por nome ou CPF"
                    aria-label="Buscar pacientes"
                />
            }
            footer={
                patients.pageCount > 1 && (
                    <Pagination
                        page={patients.pageNumber}
                        totalPages={patients.pageCount}
                        totalItems={patients.total}
                        onPageChange={patients.setPage}
                    />
                )
            }
        >
            {body}

            {editing && (
                <PatientFormModal
                    key={editing.patient?.id ?? "new"}
                    patient={editing.patient}
                    onClose={() => setEditing(null)}
                />
            )}

            <ConfirmDialog
                open={removing !== null}
                title="Remover paciente?"
                description={`${removing?.name ?? ""} sai do cadastro. O histórico de consultas continua no prontuário.`}
                confirmLabel="Remover"
                variant="danger"
                loading={remove.isPending}
                onConfirm={() => {
                    if (removing) remove.mutate(removing);
                }}
                onCancel={() => setRemoving(null)}
            />
        </Page>
    );
}
```

- **Busca com debounce.** O `useDebounce` espera 300 ms depois da última tecla. O termo entra na query key, e o [`usePaginatedQuery`](../query.md) volta para a página 1 sozinho quando a busca muda.
- **Paginação do servidor.** O hook manda `page` e `size`; o backend responde o envelope `{ items, total, page, size, pages }`. A `Pagination` só aparece quando há mais de uma página.
- **Os quatro estados do corpo**, nesta ordem: carregando (esqueleto de linhas), erro (com a frase do [`describeApiError`](../http.md#do-erro-tipado-para-a-frase-na-tela-describeapierror)), vazio — com duas mensagens diferentes, porque "não achei esse nome" e "você ainda não cadastrou ninguém" pedem ações diferentes — e a tabela.
- **Celular.** `stackOnMobile` transforma cada linha num cartão de rótulo e valor; `priority` esconde CPF no celular e convênio no tablet, sem esconder nada do cartão.
- **Permissões, duas formas.** O botão "Novo paciente" usa `<Can>`. Os botões de cada linha usam o `useCan` **uma vez**, no topo da página — com `<Can>` em cada linha, seriam 40 checagens para 20 linhas.
- **Remoção com confirmação.** O `ConfirmDialog` segura o `loading` enquanto o `DELETE` roda. O `409` (paciente com consulta marcada) vira uma frase específica pelo `statuses`.
- **`encodeIdSegment`** em todo id que entra na URL. Um id vindo de fora nunca escapa do próprio segmento — veja [HTTP](../http.md).

O modal de cadastro e edição:

```tsx
// src/pages/patients/PatientFormModal.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
    Button,
    CPFInput,
    Form,
    FormActions,
    FormField,
    FormProvider,
    Input,
    Modal,
    PhoneInput,
    Select,
    encodeIdSegment,
    isApiError,
    unmask,
    useDescribeApiError,
    useToast,
    useZodForm,
    validateCPF,
} from "tempest-react-sdk";
import { z } from "zod";

import { api, queryKeys } from "@/lib/api";
import type { Patient } from "@/types";

const INSURANCES = ["Unimed", "Bradesco Saúde", "SulAmérica", "Amil", "Hapvida"];

const patientSchema = z.object({
    name: z.string().trim().min(3, "Informe o nome completo"),
    cpf: z.string().refine(validateCPF, "CPF inválido"),
    phone: z.string().refine((value) => unmask(value).length >= 10, "Telefone incompleto"),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]),
    insurance: z.string(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

const FIELD_NAMES: ReadonlyArray<keyof PatientFormValues> = [
    "name",
    "cpf",
    "phone",
    "email",
    "insurance",
];

export interface PatientFormModalProps {
    patient: Patient | null;
    onClose: () => void;
}

export function PatientFormModal({ patient, onClose }: PatientFormModalProps): ReactNode {
    const queryClient = useQueryClient();
    const toast = useToast();
    const describe = useDescribeApiError();
    const form = useZodForm(patientSchema, {
        defaultValues: {
            name: patient?.name ?? "",
            cpf: patient?.cpf ?? "",
            phone: patient?.phone ?? "",
            email: patient?.email ?? "",
            insurance: patient?.insurance ?? "",
        },
    });

    const save = useMutation({
        mutationFn: (values: PatientFormValues) => {
            const body = {
                name: values.name,
                cpf: unmask(values.cpf),
                phone: unmask(values.phone),
                email: values.email || null,
                insurance: values.insurance || null,
            };
            return patient
                ? api.patch<Patient>(`/patients/${encodeIdSegment(patient.id)}`, { body })
                : api.post<Patient>("/patients", { body });
        },
        onSuccess: async (saved) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.patients() });
            toast.success(patient ? "Cadastro atualizado." : `${saved.name} foi cadastrado(a).`);
            onClose();
        },
        onError: (error) => {
            const fields = isApiError(error) ? error.fields : undefined;
            for (const name of FIELD_NAMES) {
                const message = fields?.[name];
                if (message) form.setError(name, { message });
            }
            toast.error(
                describe(error, "Não foi possível salvar o paciente.", {
                    codes: { PATIENT_CPF_TAKEN: "Já existe um paciente com este CPF." },
                }),
            );
        },
    });

    return (
        <Modal
            open
            onClose={onClose}
            title={patient ? "Editar paciente" : "Novo paciente"}
            fullscreenOnMobile
        >
            <FormProvider {...form}>
                <Form
                    layout="stack"
                    gap={4}
                    onSubmit={form.handleSubmit((values) => save.mutate(values))}
                >
                    <FormField name="name" label="Nome completo" required>
                        <Input autoComplete="off" />
                    </FormField>
                    <FormField name="cpf" label="CPF" required>
                        <CPFInput />
                    </FormField>
                    <FormField name="phone" label="Celular" required>
                        <PhoneInput />
                    </FormField>
                    <FormField name="email" label="E-mail">
                        <Input type="email" />
                    </FormField>
                    <FormField name="insurance" label="Convênio">
                        <Select
                            options={[
                                { value: "", label: "Particular" },
                                ...INSURANCES.map((name) => ({ value: name, label: name })),
                            ]}
                        />
                    </FormField>
                    <FormActions align="end">
                        <Button variant="ghost" type="button" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" loading={save.isPending}>
                            Salvar
                        </Button>
                    </FormActions>
                </Form>
            </FormProvider>
        </Modal>
    );
}
```

- **Um schema zod** é a fonte da verdade: tipo, validação e mensagens. O CPF passa pelo `validateCPF` de [Forms BR](../forms-br.md); o telefone precisa de pelo menos 10 dígitos.
- **`CPFInput` e `PhoneInput`** mascaram enquanto a pessoa digita. Antes de enviar, o `unmask` tira a pontuação: o backend guarda só dígitos.
- **Campo opcional vira `null`.** E-mail e convênio vazios saem como `null`, que é o que o backend espera para "não informado".
- **O `Select` de convênio** tem "Particular" como uma opção de verdade, com valor vazio. Um `placeholder` seria desabilitado, e a recepcionista não conseguiria voltar um paciente para particular.
- **Erros do servidor no campo certo.** O `422` do FastAPI chega com `error.fields`. O `onError` copia cada mensagem para o campo do mesmo nome com `form.setError`, e o `PATIENT_CPF_TAKEN` vira "Já existe um paciente com este CPF.".
- **`key` no modal.** A página monta o modal com `key={patient.id}`. Abrir outro paciente cria um formulário novo, com os valores certos — sem `reset()` manual.
- **`fullscreenOnMobile`**: no celular, o formulário ocupa a tela inteira em vez de um diálogo espremido.

## Configurações

```tsx
// src/pages/Settings.tsx
import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import {
    Card,
    Page,
    SegmentedControl,
    Stack,
    useDocumentTitle,
    useI18n,
    useTheme,
    type ThemeMode,
} from "tempest-react-sdk";

const LOCALE_NAMES: Record<string, string> = {
    "pt-BR": "Português",
    en: "English",
};

export default function Settings(): ReactNode {
    const { t, locale, availableLocales, setLocale } = useI18n();
    const { theme, setTheme } = useTheme();
    useDocumentTitle(t("settings.title"));

    return (
        <Page title={t("settings.title")} description={t("settings.description")}>
            <Stack gap={4}>
                <Card title={t("settings.theme")}>
                    <SegmentedControl<ThemeMode>
                        aria-label={t("settings.theme")}
                        value={theme}
                        onChange={setTheme}
                        options={[
                            { value: "light", label: t("settings.light"), icon: <Sun size={16} /> },
                            { value: "dark", label: t("settings.dark"), icon: <Moon size={16} /> },
                            {
                                value: "system",
                                label: t("settings.system"),
                                icon: <Monitor size={16} />,
                            },
                        ]}
                    />
                </Card>
                <Card title={t("settings.language")}>
                    <SegmentedControl
                        aria-label={t("settings.language")}
                        value={locale}
                        onChange={setLocale}
                        options={availableLocales.map((code) => ({
                            value: code,
                            label: LOCALE_NAMES[code] ?? code,
                        }))}
                    />
                </Card>
            </Stack>
        </Page>
    );
}
```

Duas escolhas, dois `SegmentedControl`. 🌗

- **Tema**: `useTheme()` devolve a preferência (`"light"`, `"dark"` ou `"system"`) e o `setTheme`. O provider grava a escolha e escreve `data-tempest-theme` no `<html>`; todos os componentes trocam de cor juntos. Veja [Tema](../theme.md).
- **Idioma**: as opções vêm do próprio catálogo (`availableLocales`). O `I18nProvider` grava a escolha e atualiza o `<html lang>`.

!!! tip "Sem o flash do tema errado"
    Quem escolheu "Escuro" vê um instante de tela clara ao recarregar, até o React montar. A receita [Dark mode sem flash](./dark-mode.md) mostra o script do `<head>` que resolve isso.

## A página 404

```tsx
// src/pages/NotFound.tsx
import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button, EmptyState, useDocumentTitle, useI18n, useNavigate } from "tempest-react-sdk";

export function NotFound(): ReactNode {
    const { t } = useI18n();
    const navigate = useNavigate();
    useDocumentTitle(t("notFound.title"));

    return (
        <EmptyState
            icon={<SearchX size={40} />}
            title={t("notFound.title")}
            description={t("notFound.description")}
            action={<Button onClick={() => navigate("/")}>{t("notFound.back")}</Button>}
        />
    );
}
```

Um `EmptyState` com um caminho de volta. Como a rota `*` está dentro da casca, o menu continua na tela.

## Rodando

```bash
cp .env.example .env
npm run dev
```

Abra `http://127.0.0.1:5173/pacientes` sem estar logado. ✅ O que você deve ver:

1. O app manda para `/login`. Senha errada mostra "E-mail ou senha incorretos.".
2. Com a senha certa da gestora, você volta para `/pacientes` — não para o painel.
3. Busque um nome que não existe: aparece "Nenhum paciente encontrado" com "Limpar busca".
4. Cadastre um paciente com o CPF `111.111.111-11`: o campo acusa "CPF inválido" antes de qualquer requisição.
5. No painel, os quatro indicadores e os três gráficos. Em Configurações, troque para Escuro e English: o painel inteiro acompanha.
6. Entre como recepção: o botão de remover some, o faturamento some.
7. Entre como médico, no celular: o menu inferior não tem "Pacientes", e `/pacientes` volta para o painel.

!!! check "Testado contra um backend de mentira"
    O fluxo acima foi exercitado num Chromium headless, a 1280×860 e a 390×844, com um servidor que responde o contrato da tabela do começo. Os arquivos desta página compilam com `tsc --noEmit` no `tsconfig.json` do scaffold.

## Recap

- 🔐 `createTempestAuth` é a sessão inteira; o `onSessionEnd` limpa o que é da conta que saiu.
- 🚪 Dois guards: a sessão na rota que envolve tudo, o papel na rota de cada módulo — com `"pending"` enquanto o `useCan` decide.
- 👥 Papel vem do backend, permissão mora num mapa só, e `<Can>`/`useCan` leem do provider. O backend repete cada regra.
- 🧭 `AppShell` + `Sidebar` + `BottomNavigation` com a mesma lista de itens, filtrada pelo papel.
- 📊 Cada tela tem esqueleto, erro com "tentar de novo", vazio com uma ação, e o conteúdo.
- 🌍 Tema e idioma são preferências do navegador, gravadas pelos próprios providers.
- 🧯 Um boundary global fora de tudo e um por página dentro da casca; 404 dentro da casca.
