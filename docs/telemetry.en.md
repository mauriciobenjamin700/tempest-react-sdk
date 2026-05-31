# Telemetry

A minimal interface (`init?` / `identify` / `track` / `captureException` /
`flush?`) that isolates the app from the details of the actual provider (Sentry,
PostHog, Datadog, custom). Concrete adapters for the most common providers ship
ready-made in the SDK; none of them is a peer dep — you only install what you
use.

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

`consoleTelemetryAdapter` is the default for dev/test — it logs every call to the
`console`.

`TelemetryProvider` invokes `adapter.init?.()` on mount and `adapter.flush?.()`
on unmount.

## Usage in components

```tsx
import { useTelemetry } from "tempest-react-sdk";

const telemetry = useTelemetry();
telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL: 990 } });
```

`useTelemetry()` returns `null` when no provider is mounted — the UI does not
break in tests. **Always use optional chaining** (`telemetry?.track(...)`) at the
call sites.

## Sentry adapter

Wraps `@sentry/browser` (or `@sentry/react`) — the Sentry SDK is passed in by the
caller, it does not become a peer dep.

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

Mapping:

| `TelemetryAdapter`           | `@sentry/browser`                                               |
| ---------------------------- | --------------------------------------------------------------- |
| `init()`                     | `Sentry.init(initOptions)` (only when `initOptions` is passed)  |
| `identify(user)`             | `Sentry.setUser({id, email, username, ...traits})`              |
| `identify(null)`             | `Sentry.setUser(null)`                                          |
| `track({name, properties})`  | `Sentry.addBreadcrumb({category, message, level:"info", data})` |
| `captureException(err, ctx)` | `Sentry.captureException(err, { extra: ctx })`                  |
| `flush()`                    | `Sentry.flush(flushTimeout)`                                    |

The `SentryLike` type is exported so you can mock it in tests:

```ts
import type { SentryLike } from "tempest-react-sdk";

const fakeSentry: SentryLike = {
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
};
```

## PostHog adapter

Wraps `posthog-js`.

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

Mapping:

| `TelemetryAdapter`           | `posthog-js`                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `init()`                     | `posthog.init(apiKey, options)` (only when `init` is passed)                                         |
| `identify({id, ...})`        | `posthog.identify(id, { email, name, ...traits })` (skip if `id` is missing)                         |
| `identify(null)`             | `posthog.reset()`                                                                                    |
| `track({name, properties})`  | `posthog.capture(name, properties)`                                                                  |
| `captureException(err, ctx)` | `posthog.captureException(err, ctx)` when available, fallback `posthog.capture("$exception", {...})` |

## Custom adapter

For Datadog, Amplitude, Mixpanel — write ~20 lines:

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

## Integration with ErrorBoundary

```tsx
const telemetry = useTelemetry();

<ErrorBoundary onError={(err, info) => telemetry?.captureException(err, info)}>
  {children}
</ErrorBoundary>;
```

## See also

- [Error Boundary](./error-boundary.md)
- [Logger](./logger.md) — local structured logs
- [Feature Flags](./feature-flags.md) — adapters follow the same pattern
