# Telemetry

Every app needs telemetry — identifying users, tracking events, capturing exceptions — but you don't want `Sentry.captureException` or `posthog.capture` calls scattered across the codebase. If you ever switch providers, you'd have to hunt down every call site. The `telemetry` module solves this with a **minimal interface** that isolates the app from the actual provider (Sentry, PostHog, Datadog, custom). You program against the interface; the provider is injected once, at the root.

Concrete adapters for the most common providers ship ready-made in the SDK; none of them is a peer dep — the **caller injects the instance** of the external SDK, so you only install what you use.

!!! info "Why inject the instance instead of declaring a peer dep"
    Apps that already initialize Sentry at startup (DSN, sample rate,
    integrations) want to reuse _that_ instance — not one created by the SDK. And
    apps that don't use Sentry shouldn't pay for it in the bundle. That's why
    each `create<Provider>Adapter` receives the ready instance in its options
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

`consoleTelemetryAdapter` is the default for dev/test — it logs every call to the `console`.

`TelemetryProvider` invokes `adapter.init?.()` on mount and `adapter.flush?.()` on unmount.

## Usage in components

```tsx
import { useTelemetry } from "tempest-react-sdk";

const telemetry = useTelemetry();
telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL: 990 } });
```

`useTelemetry()` returns `null` when no provider is mounted — the UI does not break in tests.

!!! warning "Always use optional chaining"
    `useTelemetry()` returns `null` outside a `<TelemetryProvider>`. Always call
    it with `?.` (`telemetry?.track(...)`) — that way the call sites keep working
    in unit tests and in trees that don't mount the provider, without blowing up
    with "cannot read property of null".

## Complete setup — adapter + provider + identify + track

A real app initializes the adapter at the root, identifies the user on login, and tracks events on actions. Complete, copy-pasteable skeleton:

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
// useSessionTelemetry.ts — identify/reset when the session changes
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
// CheckoutButton.tsx — track a business event
import { useTelemetry, Button } from "tempest-react-sdk";

export function CheckoutButton({ aloId, valueBRL }: { aloId: string; valueBRL: number }) {
  const telemetry = useTelemetry();
  return (
    <Button
      onClick={() => {
        telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL } });
      }}
    >
      Buy
    </Button>
  );
}
```

## Sentry adapter

Wraps `@sentry/browser` (or `@sentry/react`) — the Sentry SDK is passed in by the caller, it does not become a peer dep.

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

!!! tip "`SentryLike` / `PostHogLike` are subsets, not the whole SDKs"
    Each adapter declares only the methods it uses (`setUser`, `addBreadcrumb`,
    `capture`…). That gives you a tiny target to mock in tests — you assemble an
    object with 3 `vi.fn()` instead of stubbing the full SDK — and keeps the
    adapter resilient to API changes that don't touch that subset.

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

## Recap

- **Program against `TelemetryAdapter`**, not the provider's SDK — switching provider = changing one line at the root.
- **`TelemetryProvider`** injects the adapter; calls `init` on mount, `flush` on unmount.
- **`useTelemetry()` can be `null`** — always `telemetry?.track(...)` with optional chaining.
- **Adapters inject the instance** (`{ sentry }`, `{ posthog }`) — never a peer dep.
- **A custom adapter** is ~20 lines mapping 4 methods.

### See also

- [Error Boundary](./error-boundary.en.md) — `onError` → `captureException`
- [Logger](./logger.en.md) — local structured logs
- [Feature Flags](./feature-flags.en.md) — adapters follow the exact same injection pattern
