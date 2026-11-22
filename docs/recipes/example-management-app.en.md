# Integrated example: management app

The other recipes solve one screen at a time. This one puts it all together into a **whole app**: the back office of a small clinic, from sign-in to the revenue chart, with different roles seeing different things. 🏥

The **Vida Plena** clinic has three kinds of people using the system:

- **Manager** (`gestor`): sees everything, revenue included, and is the only one who can remove a patient.
- **Front desk** (`recepcao`): registers and edits patients, sees the day's dashboard.
- **Doctor** (`medico`): opens the dashboard to check the week's schedule. The patient registry is not their job — the medical record lives in another system.

They open the app on the front-desk computer and on their phones, between appointments. The app has to hold up: slow network, a session that expires, a phone screen, someone typing an address that does not exist.

## What we will build

- 🔐 **Sign-in** with email and password, a clear error for a wrong password, and a return to the page the person tried to open.
- 🧭 **App shell** with a top bar, a side menu on desktop and a bottom bar on phones. The menu only shows what the role can open.
- 📊 **Dashboard** with four indicators, appointments per day, patients by health plan and revenue over the last 6 months — the last one for the manager only.
- 🗂️ **Patients**: a paginated list with search, create and edit in a modal, removal with confirmation. Every button respects the role.
- ⚙️ **Settings**: light/dark/system theme and language (Portuguese or English).
- 🧯 **Error and 404**: a broken screen does not take the app down, and a wrong address shows a real page.

Every screen covers the five states of a real screen: **loading**, **empty**, **error**, **success** and **mobile**.

!!! info "What you need"
    A project created with [`create-tempest-app`](../scaffold.md). The files on this page **replace** the ones the scaffold generated and add the missing ones. Also install `recharts` (the optional dependency of [`/charts`](../charts.md)) and `zod`:

    ```bash
    npm install recharts zod @tanstack/react-query
    ```

    `@tanstack/react-query` already comes with the SDK; declaring it in your `package.json` makes it explicit that the app imports from it. Run `npx tempest doctor` afterwards: it warns when npm nested a second copy.

## The backend contract

The backend is a FastAPI service built with `tempest-fastapi-sdk`, mounted under `/api`. There are six routes:

| Method | Route | Caller | Response |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | sign-in | `{ "access_token": "…", "token_type": "bearer", "refresh_token": "…" }` |
| `GET` | `/api/auth/me` | after sign-in | `User` |
| `GET` | `/api/dashboard/summary` | dashboard | `DashboardSummary` |
| `GET` | `/api/dashboard/revenue` | dashboard (manager only) | `RevenueReport` — `403` for the other roles |
| `GET` | `/api/patients?search=&page=&size=` | patients | `{ "items": [...], "total": 27, "page": 1, "size": 20, "pages": 2 }` |
| `POST` · `PATCH` · `DELETE` | `/api/patients` · `/api/patients/{id}` | patients | `Patient` (`204` on `DELETE`) |

The user `/api/auth/me` returns:

```json
{ "id": "u1", "name": "Marina Costa", "email": "gestor@vidaplena.com.br", "role": "gestor" }
```

And one day of the dashboard summary — notice that `date` is **just the date**, no time:

```json
{ "date": "2026-11-16", "done": 31, "no_show": 3 }
```

The [FastAPI integration](../integration-fastapi.md) page explains each envelope (`access_token`, the `{ items, total, page, size, pages }` page, the error with `code` and `fields`).

## The structure

```text
vida-plena/
├── .env                          VITE_API_URL=http://127.0.0.1:8000
└── src/
    ├── main.tsx                  mounts the app
    ├── App.tsx                   providers + router
    ├── routes.tsx                route tree with guards
    ├── types.ts                  the types of the contract above
    ├── lib/
    │   ├── api.ts                session, HTTP client, cache, query keys
    │   └── access.tsx            roles → permissions
    ├── locales/
    │   └── messages.ts           pt-BR + en catalog
    ├── layouts/
    │   └── AppLayout.tsx         top bar, side menu, bottom bar
    └── pages/
        ├── Login.tsx
        ├── Dashboard.tsx
        ├── Patients.tsx
        ├── patients/
        │   └── PatientFormModal.tsx
        ├── Settings.tsx
        └── NotFound.tsx
```

The scaffold generates `src/stores/auth.ts`, `src/layouts/RootLayout.tsx`, `src/pages/Home.tsx` and the sample `Dashboard.tsx`. Delete the first three: the session now lives in `src/lib/api.ts`, and `Dashboard.tsx` is replaced by the one on this page.

We go bottom-up: types and session first, then the shell, then each screen. 🚀

## The types

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

One file, mirroring the backend JSON field by field. The names stay in English and in `snake_case`, as FastAPI returns them: converting to `camelCase` halfway is one more layer to maintain and one more source of bugs.

`Role` is a closed union. It is what makes TypeScript complain when someone writes `"recepção"` with a cedilla in one place and without it in another.

## The session and the HTTP client

```ts
// src/lib/api.ts
import { QueryClient } from "@tanstack/react-query";
import {
    CACHE_TIME,
    STALE_TIME,
    createQueryKeys,
    createTempestAuth,
    shouldRetryQuery,
} from "tempest-react-sdk";

import type { User } from "@/types";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: STALE_TIME.DEFAULT,
            gcTime: CACHE_TIME.DEFAULT,
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
        },
        mutations: { retry: 0 },
    },
});

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

This file is the heart of the app. Piece by piece:

- **`createTempestAuth<User>`** builds the whole session: the persisted store, the client with `Authorization: Bearer`, and `401 → refresh → replay the call` without you writing any of it. It is the preset made for the `tempest-fastapi-sdk` contract — see [FastAPI integration → authentication](../integration-fastapi.md#5-turn-key-authentication-createtempestauth).
- **`prefix: "/api"`** says the service lives under `/api`. From then on you write `"/patients"`, not `"/api/patients"`.
- **`mePath: "/auth/me"`** makes `login()` fetch the user right after the token. That is where `role` comes from.
- **`storeName`** gives the `localStorage` key its own name. Two Tempest apps on the same domain do not fight over the same session.
- **`retry: true`** retries a `GET` that failed on the network or with a `5xx`. A write is never retried on its own — a replayed `POST` could register the patient twice.
- **`onSessionEnd`** clears the query cache when the session ends — on **Sign out**, on expiry and on account switch. Without it, the receptionist who signs in after the manager would see, for a moment, the revenue left in the cache.

!!! warning "Why create the `QueryClient` by hand"
    `AppProviders` creates a `QueryClient` on its own, but it stays locked inside, and `onSessionEnd` needs to call `clear()` on it. So the app creates its own and hands it to the provider. The `defaultOptions` copy the SDK's (`STALE_TIME.DEFAULT`, `CACHE_TIME.DEFAULT`, `shouldRetryQuery`), so the behaviour stays the same — see [Query → Provider](../query.md#provider).

**`createQueryKeys`** gives every cache key a common prefix. Note the `patients()` / `patientList(search)` pair: the list is cached per search, and invalidating `patients()` drops **every** search at once after a registration.

## Roles and permissions

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

The role comes from the backend; **what each role can do** lives here, in one place. Permissions follow the `"resource:action"` format of [`createRoleAccessControl`](../access-control.md), and `"*"` grants everything.

`RoleAccessProvider` reads the signed-in user's `role` and rebuilds the strategy when it changes — on sign-in, on sign-out, on account switch. Every `useCan` and every `<Can>` below it answers for the current role.

!!! danger "Permissions in the frontend are UX, not security"
    Hiding the "Remove" button from the front desk avoids the wrong click. What **prevents** the removal is the backend, which answers `403` to whoever cannot do it. Every rule in this table has to exist in the API too.

## The language catalog

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

Namespaced keys (`dashboard.today`), one block per language. The [SDK's i18n](../i18n.md) falls back to `fallbackLocale` when a key is missing, so a forgotten translation shows the Portuguese text, not the raw key.

!!! note "Only the shell, the dashboard and the settings are translated"
    The patients screen and the sign-in stay in Portuguese on purpose: they belong to the front desk, which works in Portuguese. The language switch exists for the manager, who shows the dashboard to partners from abroad. Translating the rest takes the same path: a key in the catalog, `t("…")` on the screen.

## Mounting the app

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

Same as the scaffold's: the SDK's CSS once, and `<App />`.

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

[`AppProviders`](../app-providers.md) mounts, from the outside in: the global error boundary, React Query with **our** `queryClient`, the theme and i18n. Inside it:

- **`ToastProvider`** — the quick confirmations ("Cadastro atualizado.").
- **`RoleAccessProvider`** — the permissions, which have to sit **above** the router, because the route guards call `useCan`.
- **`AppRouter`** — the route tree.

The global error boundary uses fixed Portuguese text because it sits **outside** `I18nProvider`: when it shows up, i18n may be exactly what broke.

!!! tip "`PAGE_LOADER` is a module constant"
    `AppRouter` rebuilds the route tree when `fallback` changes identity. JSX written straight into the prop would be a new object on every render of `App`. The constant outside the component avoids that — and the same spinner covers each page's chunk loading **and** a guard that is still deciding.

## The routes

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

The app's two doors live here. 🚪

**The session door** is on the `/` route, which wraps all the others. The `useSessionGuard` guard is a hook — hence the `use` prefix — and subscribes to the store: when the session ends, by sign-out or by expiry, it re-renders on its own and sends the person to `/login`. `preserveFrom: true` carries along the address they came from.

The guard asks for **token and user**. Between the token arriving and `/auth/me` answering there is a moment where only the token exists; without the user there is no role, and without a role the permissions say "no" to everything. It is only that moment: when `/auth/me` fails, `login()` undoes the sign-in before rejecting, and the token is not left alone in the store (#748).

**The role door** is on `pacientes`. `useCan` answers in an effect pass, so on the first render it does not know yet. The guard returns `"pending"` meanwhile: the app shows the spinner instead of bouncing the receptionist out in a blink. Details in [Routing → `"pending"`](../routing.md#the-async-function-form-the-third-state-pending).

Pages come in through `lazy`: the doctor, who never opens patients, never downloads its code.

And the `path: "*"` **inside** the protected route makes the 404 show up with the menu around it — whoever got the address wrong still has somewhere to go.

## The sign-in

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

The screen is [`AuthPage`](../components/auth-screens.md) with `LoginForm`: a sheet layout on phones, two columns on desktop, email and password validation, a button with loading.

`onSubmit` only calls `auth.login(values)`. The component itself navigates: when the store gets a user, `signedIn` becomes `true` and `<Navigate>` takes the person to `returnTo`. [`useReturnTo`](../routing.md#going-back-to-where-you-were-after-signing-in) returns the page they came from — and refuses any address outside the app.

That same `if` covers someone already signed in who opens `/login` again: straight back to the dashboard.

When the password is wrong, the API answers `401`. `LoginForm` catches the error and shows an alert above the fields, with the sentence from `errorOptions.statuses`. The `423` covers an account locked after several attempts.

## The shell

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

[`AppShell`](../components/layout.md#appshell) swaps navigation by screen size: `Sidebar` from `md` up, `BottomNavigation` below it. 📱

- **The items depend on the role.** `useCan` decides whether "Pacientes" goes into the list. The doctor does not even see the entry — and typing `/pacientes`, the route guard sends them back to the dashboard.
- **`Sidebar` resolves the active item on its own** with `match="route"`: on `/pacientes?page=2` the "Pacientes" item stays lit. The items have an `href`, so ctrl-click opens a new tab.
- **`BottomNavigation` gets the same list**, with the active item computed by [`activeNavKey`](../components/navigation.md#activenavkey-the-same-resolution-outside-sidebar).
- **Sign out** calls `auth.logout()` and nothing else. The store clears at once, `onSessionEnd` clears the cache, and the session guard takes the person to sign-in.

The `ErrorBoundary` around `<Outlet />` is the app's **second** boundary, and the one that shows up the most: a render error on the dashboard swaps only the content for an error screen, and the menu stays. `resetKeys={[pathname]}` clears the error when the person navigates to another page. See [Error Boundary](../error-boundary.md).

## The dashboard

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

The densest screen in the app. Let's take it in parts. 📊

**The states.** The outer component only decides which of three to show: `isPending` → a skeleton shaped like the screen, `isError` → `ErrorState` with "Try again", otherwise the content. The skeleton has the same layout as the finished dashboard, so nothing jumps when the data arrives.

**The indicators.** Four [`Stat`](../components/feedback.md#stat) in a `Grid` of one column on phones, two on tablets and four on desktop. The numbers go through i18n's `formatNumber`: `1.284` in Portuguese, `1,284` in English.

**Revenue for the manager only.** `RevenueStat` and `RevenueChart` sit inside `<Can action="read" resource="finance">`. `<Can>` does not render its children for whoever cannot — and a component that does not mount does not fire the query. `/dashboard/revenue` is never called by the front desk.

Both use the same `useRevenue()`, with the same query key. React Query makes **one** request and hands the response to both.

**The empty state.** A newly opened clinic has an empty week. Instead of two blank charts, an `EmptyState` explains when they will appear.

**The charts.** A stacked `BarChart`, a donut `PieChart` and a `LineChart`, from the [`tempest-react-sdk/charts`](../charts.md) subpath. The data shape is always the same: `index` is the axis key, `categories` are the series.

!!! warning "The series name is the object key"
    The chart uses each series' key as the text of the legend and the tooltip. That is why the data is rebuilt with the **translated sentence** as the key: `[done]: day.done`, where `done` is `"Realizadas"` or `"Attended"`. Switching the language rebuilds the data and the legend follows.

!!! warning "`timeZone: \"UTC\"` on a date without a time"
    JavaScript reads `"2026-11-16"` as **UTC** midnight, which in Brasília is still the 15th at 9 p.m. Formatted in the local time zone, Monday becomes Sunday. Since the date came without a time, format it in UTC — it goes back to being the 16th the backend sent.

!!! tip "Money on an axis: compact notation"
    On the revenue chart, `valueFormatter` uses `notation: "compact"`. `R$ 186,430` becomes `R$186K`, which fits the Y axis width on a phone. The month card still shows the full value.

## Patients

This is the registry module, in a lean version. The [CRUD panel (admin)](./admin-crud.md) recipe goes deep into this kind of screen; here the focus is how it fits into the app.

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

- **Debounced search.** `useDebounce` waits 300 ms after the last keystroke. The term goes into the query key, and [`usePaginatedQuery`](../query.md) goes back to page 1 on its own when the search changes.
- **Server pagination.** The hook sends `page` and `size`; the backend answers the `{ items, total, page, size, pages }` envelope. `Pagination` only shows up when there is more than one page.
- **The body's four states**, in this order: loading (a skeleton of rows), error (with the sentence from [`describeApiError`](../http.md#from-a-typed-error-to-the-sentence-on-screen-describeapierror)), empty — with two different messages, because "I did not find that name" and "you have not registered anyone yet" call for different actions — and the table.
- **Mobile.** `stackOnMobile` turns each row into a label/value card; `priority` hides CPF on phones and health plan on tablets, without hiding anything from the card.
- **Permissions, two ways.** The "Novo paciente" button uses `<Can>`. The per-row buttons use `useCan` **once**, at the top of the page — with `<Can>` on each row, that would be 40 checks for 20 rows.
- **Removal with confirmation.** `ConfirmDialog` holds `loading` while the `DELETE` runs. The `409` (patient with a booked appointment) becomes a specific sentence through `statuses`.
- **`encodeIdSegment`** on every id that goes into the URL. An id from outside never escapes its own segment — see [HTTP](../http.md).

The create and edit modal:

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

- **One zod schema** is the source of truth: type, validation and messages. CPF goes through `validateCPF` from [Forms BR](../forms-br.md); the phone needs at least 10 digits.
- **`CPFInput` and `PhoneInput`** mask while the person types. Before sending, `unmask` strips the punctuation: the backend stores digits only.
- **An optional field becomes `null`.** Empty email and health plan go out as `null`, which is what the backend expects for "not provided".
- **The health plan `Select`** has "Particular" (self-pay) as a real option, with an empty value. A `placeholder` would be disabled, and the receptionist could not move a patient back to self-pay.
- **Server errors on the right field.** FastAPI's `422` arrives with `error.fields`. `onError` copies each message to the field of the same name with `form.setError`, and `PATIENT_CPF_TAKEN` becomes "Já existe um paciente com este CPF.".
- **`key` on the modal.** The page mounts the modal with `key={patient.id}`. Opening another patient creates a new form, with the right values — no manual `reset()`.
- **`fullscreenOnMobile`**: on phones, the form takes the whole screen instead of a cramped dialog.

## Settings

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

Two choices, two `SegmentedControl`s. 🌗

- **Theme**: `useTheme()` returns the preference (`"light"`, `"dark"` or `"system"`) and `setTheme`. The provider stores the choice and writes `data-tempest-theme` on `<html>`; every component changes color together. See [Theme](../theme.md).
- **Language**: the options come from the catalog itself (`availableLocales`). `I18nProvider` stores the choice and updates `<html lang>`.

!!! tip "No wrong-theme flash"
    Someone who picked "Dark" sees an instant of light screen on reload, until React mounts. The [Dark mode without flash](./dark-mode.md) recipe shows the `<head>` script that fixes it.

## The 404 page

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

An `EmptyState` with a way back. Since the `*` route sits inside the shell, the menu stays on screen.

## Running it

```bash
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173/pacientes` while signed out. ✅ What you should see:

1. The app sends you to `/login`. A wrong password shows "E-mail ou senha incorretos.".
2. With the manager's right password, you go back to `/pacientes` — not to the dashboard.
3. Search for a name that does not exist: "Nenhum paciente encontrado" shows up with "Limpar busca".
4. Register a patient with CPF `111.111.111-11`: the field flags "CPF inválido" before any request.
5. On the dashboard, the four indicators and the three charts. In Settings, switch to Dark and English: the whole dashboard follows.
6. Sign in as front desk: the remove button is gone, revenue is gone.
7. Sign in as the doctor, on a phone: the bottom menu has no "Pacientes", and `/pacientes` goes back to the dashboard.

!!! check "Tested against a fake backend"
    The flow above was exercised in headless Chromium, at 1280×860 and 390×844, against a server that answers the contract in the table at the top. The files on this page compile with `tsc --noEmit` under the scaffold's `tsconfig.json`.

## Recap

- 🔐 `createTempestAuth` is the whole session; `onSessionEnd` clears what belonged to the account that left.
- 🚪 Two guards: the session on the route that wraps everything, the role on each module's route — with `"pending"` while `useCan` decides.
- 👥 The role comes from the backend, permissions live in one map, and `<Can>`/`useCan` read from the provider. The backend repeats every rule.
- 🧭 `AppShell` + `Sidebar` + `BottomNavigation` with the same item list, filtered by role.
- 📊 Every screen has a skeleton, an error with "try again", an empty state with an action, and the content.
- 🌍 Theme and language are browser preferences, stored by the providers themselves.
- 🧯 One global boundary outside everything and one per page inside the shell; the 404 inside the shell.
