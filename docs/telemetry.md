# Telemetry

Interface mínima (`init?` / `identify` / `track` / `captureException` / `flush?`) que isola o app dos detalhes do provider real (Sentry, PostHog, Datadog, custom). Adapters concretos para os providers mais comuns vêm prontos no SDK; nenhum deles é peer dep — você instala apenas o que usa.

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

`useTelemetry()` retorna `null` quando não há provider montado — UI não quebra em testes. **Sempre use optional chaining** (`telemetry?.track(...)`) nos callsites.

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

## Veja também

- [Error Boundary](./error-boundary.md)
- [Logger](./logger.md) — logs estruturados locais
- [Feature Flags](./feature-flags.md) — adapters seguem o mesmo padrão
