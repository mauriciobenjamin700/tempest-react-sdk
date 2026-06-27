# Telemetry

Toda app precisa de telemetria — identificar usuários, rastrear eventos, capturar exceções — mas você não quer espalhar chamadas de `Sentry.captureException` ou `posthog.capture` por todo o código. Se um dia trocar de provider, teria que caçar cada callsite. O módulo `telemetry` resolve isso com uma **interface mínima** que isola o app do provider real (Sentry, PostHog, Datadog, custom). Você programa contra a interface; o provider é injetado uma vez, na raiz.

Adapters concretos para os providers mais comuns vêm prontos no SDK; nenhum deles é peer dep — o **caller injeta a instância** do SDK externo, então você instala apenas o que usa.

!!! info "Por que injetar a instância em vez de declarar peer dep"
    Apps que já inicializam o Sentry no startup (DSN, sample rate, integrações)
    querem reusar _aquela_ instância — não uma criada pelo SDK. E apps que não
    usam Sentry não devem pagar por ele no bundle. Por isso cada
    `create<Provider>Adapter` recebe a instância pronta no options
    (`{ sentry: Sentry }`, `{ posthog }`).

## Interface

```ts
import type { TelemetryAdapter, TelemetryEvent, TelemetryUser } from "tempest-react-sdk";

interface TelemetryAdapter {
  init?: () => void | Promise<void>;
  identify: (user: TelemetryUser | null) => void;
  track: (event: TelemetryEvent) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  flush?: () => Promise<void> | void;
}

interface TelemetryUser {
  id?: string;
  email?: string;
  name?: string;
  traits?: Record<string, unknown>;
}

interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
}
```

## Provider

```tsx
import { TelemetryProvider, consoleTelemetryAdapter } from "tempest-react-sdk";

<TelemetryProvider adapter={consoleTelemetryAdapter}>{children}</TelemetryProvider>;
```

`consoleTelemetryAdapter` é o default para dev/teste — loga cada chamada no `console`.

`TelemetryProvider` invoca `adapter.init?.()` no mount e `adapter.flush?.()` no unmount.

## Uso em componentes

```tsx
import { useTelemetry } from "tempest-react-sdk";

const telemetry = useTelemetry();
telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL: 990 } });
```

`useTelemetry()` retorna `null` quando não há provider montado — a UI não quebra em testes.

!!! warning "Sempre use optional chaining"
    `useTelemetry()` devolve `null` fora de um `<TelemetryProvider>`. Chame
    sempre com `?.` (`telemetry?.track(...)`) — assim os callsites continuam
    funcionando em testes unitários e em árvores que não montam o provider, sem
    explodir com "cannot read property of null".

## Setup completo — adapter + provider + identify + track

Um app real inicializa o adapter na raiz, identifica o usuário no login e rastreia eventos nas ações. Esqueleto completo e copiável:

```tsx
// telemetry.tsx
import posthog from "posthog-js";
import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";
import type { ReactNode } from "react";

export const telemetryAdapter = createPostHogTelemetryAdapter({
  posthog,
  init: {
    apiKey: import.meta.env.VITE_POSTHOG_KEY,
    options: { api_host: "https://us.i.posthog.com" },
  },
});

export function AppTelemetry({ children }: { children: ReactNode }) {
  return <TelemetryProvider adapter={telemetryAdapter}>{children}</TelemetryProvider>;
}
```

```tsx
// useSessionTelemetry.ts — identifica/reseta quando a sessão muda
import { useEffect } from "react";
import { useTelemetry } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";

export function useSessionTelemetry() {
  const telemetry = useTelemetry();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      telemetry?.identify({ id: user.id, email: user.email, name: user.name });
    } else {
      telemetry?.identify(null); // logout → reset
    }
  }, [telemetry, user]);
}
```

```tsx
// CheckoutButton.tsx — rastreia um evento de negócio
import { useTelemetry, Button } from "tempest-react-sdk";

export function CheckoutButton({ aloId, valueBRL }: { aloId: string; valueBRL: number }) {
  const telemetry = useTelemetry();
  return (
    <Button
      onClick={() => {
        telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL } });
      }}
    >
      Comprar
    </Button>
  );
}
```

## Sentry adapter

Wrap `@sentry/browser` (ou `@sentry/react`) — o SDK Sentry é passado pelo caller, não vira peer dep.

```ts
import * as Sentry from "@sentry/browser";
import { createSentryTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createSentryTelemetryAdapter({
    sentry: Sentry,
    initOptions: {
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
    },
    flushTimeout: 2000,        // default
    breadcrumbCategory: "app", // default
});

<TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
```

Mapeamento:

| `TelemetryAdapter`           | `@sentry/browser`                                                  |
| ---------------------------- | ------------------------------------------------------------------ |
| `init()`                     | `Sentry.init(initOptions)` (apenas quando `initOptions` é passado) |
| `identify(user)`             | `Sentry.setUser({id, email, username, ...traits})`                 |
| `identify(null)`             | `Sentry.setUser(null)`                                             |
| `track({name, properties})`  | `Sentry.addBreadcrumb({category, message, level:"info", data})`    |
| `captureException(err, ctx)` | `Sentry.captureException(err, { extra: ctx })`                     |
| `flush()`                    | `Sentry.flush(flushTimeout)`                                       |

O tipo `SentryLike` é exportado pra você mockar em testes:

```ts
import type { SentryLike } from "tempest-react-sdk";

const fakeSentry: SentryLike = {
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
};
```

## PostHog adapter

Wrap `posthog-js`.

```ts
import posthog from "posthog-js";
import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createPostHogTelemetryAdapter({
    posthog,
    init: {
        apiKey: import.meta.env.VITE_POSTHOG_KEY,
        options: { api_host: "https://us.i.posthog.com" },
    },
});

<TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
```

Mapeamento:

| `TelemetryAdapter`           | `posthog-js`                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `init()`                     | `posthog.init(apiKey, options)` (apenas quando `init` é passado)                                        |
| `identify({id, ...})`        | `posthog.identify(id, { email, name, ...traits })` (skip se `id` ausente)                               |
| `identify(null)`             | `posthog.reset()`                                                                                       |
| `track({name, properties})`  | `posthog.capture(name, properties)`                                                                     |
| `captureException(err, ctx)` | `posthog.captureException(err, ctx)` quando disponível, fallback `posthog.capture("$exception", {...})` |

!!! tip "`SentryLike` / `PostHogLike` são subsets, não os SDKs inteiros"
    Cada adapter declara só os métodos que usa (`setUser`, `addBreadcrumb`,
    `capture`…). Isso te dá um alvo minúsculo para mockar em testes — você
    monta um objeto com 3 `vi.fn()` em vez de stubar o SDK completo — e mantém
    o adapter resiliente a mudanças de API que não tocam esse subset.

## Adapter custom

Para Datadog, Amplitude, Mixpanel — escreva ~20 linhas:

```ts
import type { TelemetryAdapter } from "tempest-react-sdk";
import { datadogRum } from "@datadog/browser-rum";

export const datadogAdapter: TelemetryAdapter = {
  init: () => datadogRum.init({ clientToken: "...", applicationId: "...", site: "datadoghq.com" }),
  identify: (user) =>
    user ? datadogRum.setUser({ id: user.id, email: user.email }) : datadogRum.clearUser(),
  track: ({ name, properties }) => datadogRum.addAction(name, properties),
  captureException: (error, context) => datadogRum.addError(error, context),
};
```

## Integração com ErrorBoundary

```tsx
const telemetry = useTelemetry();

<ErrorBoundary onError={(err, info) => telemetry?.captureException(err, info)}>
  {children}
</ErrorBoundary>;
```

## Resumo

- **Programe contra `TelemetryAdapter`**, não contra o SDK do provider — troca de provider = troca de uma linha na raiz.
- **`TelemetryProvider`** injeta o adapter; chama `init` no mount, `flush` no unmount.
- **`useTelemetry()` pode ser `null`** — sempre `telemetry?.track(...)` com optional chaining.
- **Adapters injetam a instância** (`{ sentry }`, `{ posthog }`) — nunca peer dep.
- **Adapter custom** é ~20 linhas mapeando 4 métodos.

### Veja também

- [Error Boundary](./error-boundary.md) — `onError` → `captureException`
- [Logger](./logger.md) — logs estruturados locais
- [Feature Flags](./feature-flags.md) — adapters seguem exatamente o mesmo padrão de injeção
