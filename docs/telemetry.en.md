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

## App errors to a Tempest backend (`/api/app-errors`)

The error that matters happens on the user's phone, often **with no signal**, and dies right there. If your backend uses `tempest-fastapi-sdk`, it already has a place for it: the `app_errors` module mounts `POST /api/app-errors` and a table you can query from the admin. Only the app side is missing — and that is what `createAppErrorReporter` delivers. 🚀

```ts
import { createAppErrorReporter } from "tempest-react-sdk";

export const reporter = createAppErrorReporter({
    endpoint: `${import.meta.env.VITE_API_URL}/api/app-errors`,
    getToken: () => sessionStorage.getItem("access_token"),
    device: () => ({
        platform: "web",
        app_version: import.meta.env.VITE_APP_VERSION,
        os_version: navigator.userAgent,
    }),
});

try {
    throw new Error("Could not read the photo", { cause: new TypeError("size=0") });
} catch (error) {
    reporter.report(error, { step: "crop", mime: "image/jpeg", size: 0 });
}
```

Piece by piece:

- **`endpoint`** — the full URL of the route.
- **`getToken`** — optional. The route is public: an error before login, or with an expired session, still has to get through. A missing, empty or throwing token sends anonymously; the backend takes `user_id` from the token, **never** from the body.
- **`getPrincipal`** — optional. Who is signed in, read when the error happens, for `foreignReports: "drop"`; see [Logout and who owns each report](#logout-and-who-owns-each-report).
- **`device`** — read **when the error happens**, not when it is sent. A report queued offline on `1.4.0` must not go out labelled `1.5.0`.
- **`report(error, context)`** — never throws. It describes the error, stamps the device, queues it and tries to send.

### What goes in `message`

`describeAppError` (exported, if you want it on its own) turns any thrown value into the `code` + `message` pair:

```text
Error: Could not read the photo
caused by: TypeError: size=0
context: {"step":"crop","mime":"image/jpeg","size":0}
Error: Could not read the photo
    at …
```

`code` is the error's `name`. The order is deliberate: the backend cuts `message` at 4000 characters, so what is worth most comes first — the **`cause` chain**, where the real failure almost always is, then your context, and the stack last.

!!! tip "`DOMException` too"
    The `NotReadableError` a file picker throws is a `DOMException`, which does
    not always pass `instanceof Error`. The reporter reads the error by shape
    (`name` + `message`), so the cause arrives whole instead of becoming `{}`.

### Offline and the queue

Everything goes through a `localStorage` queue **before** the network. With no signal, the report waits; when the browser fires `online`, the queue drains on its own. Two rules bound it:

- **An identical report (with the same stamp) becomes a counter.** A failure in a loop is stored once, and goes out with `[repeated N×]` at the start of `message`.
- **A ceiling of 50** (`maxEntries`) — the oldest leaves first.

What each answer does:

| Answer | The report |
| --- | --- |
| 2xx | leaves the queue |
| 429 | stays; sending pauses for `Retry-After` and resumes on its own |
| 5xx, 408, network failure | stays; retried on the next `report`, `online` or `flush()` |
| any other 4xx | is dropped — the backend would refuse that body forever, and it would block the ones behind it |

`flush()` drains now and returns `{ sent, dropped, pending, retryAfterMs }`; concurrent calls share one run. `dispose()` removes the `online` listener and the timer.

### Logout and who owns each report

The token is read **when the queue drains**, not when the error happens — and the queue survives a logout. Left alone, an error Ana had offline would go out with Bruno's token if he signed in on the same browser before the queue drained: the backend takes `user_id` from the token and would credit Bruno with Ana's message, context and stack.

That is why each report is **stamped with a one-way fingerprint of the token in force when the error happened** (`entry.session`), and only goes out with a bearer when the token at send time is **that very one**:

```ts
import { createAppErrorReporter } from "tempest-react-sdk";

let currentUserId: string | null = null;

export const reporter = createAppErrorReporter({
    endpoint: "/api/app-errors",
    getToken: () => sessionStorage.getItem("access_token"),
    getPrincipal: () => currentUserId,
    foreignReports: "drop",
});

export function onLogout(): void {
    currentUserId = null;
    reporter.clear();
}
```

- **The bearer depends on the token alone.** Same token at error and at send → bearer; any other → anonymous. A refresh between the error and the send also makes the report go out anonymously: attribution is lost, **never** misplaced.
- **`getPrincipal`** — optional. A **stable, non-secret** id of who is signed in (the user id, not the email), stored only as a fingerprint (`entry.owner`). It does **not** grant the bearer — the principal and the token come from different sources, and a user store lagging behind a login would send Ana's report with Bruno's token. It lets `"drop"` tell whose report is whose. Only a string or a number counts as an id; an `async` or throwing getter reads as nobody.
- **`foreignReports`** — what to do with a report that cannot go out with the current bearer:
    - `"anonymous"` (default) sends it without `Authorization`. The route is public and the error is still useful.
    - `"drop"` discards every report **not proven** to be the current principal's: someone else's, nobody's (raised with no session) or of unknown owner (old queue, or nobody signed in now). For apps where the previous user's error text must not leave the device. **Needs `getPrincipal`**: without it the only identity is the token, which changes on refresh — so a mismatch proves nothing, and the reporter sends anonymously instead of deleting the user's own reports (in dev, a one-time `console.warn` says so).
- **`reporter.clear()` on logout** empties the queue, stops a `flush` in flight before its next send, and discards reports still waiting for an async `getToken`.
- **An async `getToken` has a deadline**: after 5 s with no answer, the report is queued with no session and the `flush` goes on without a token — nothing hangs waiting.

| Report raised under | Sent under | `"anonymous"` (default) | `"drop"` + `getPrincipal` |
| --- | --- | --- | --- |
| Ana's token | the same token | Ana's bearer | Ana's bearer |
| Ana's token | Ana's refreshed token | anonymous | anonymous |
| Ana's token | Bruno's token, or none | anonymous | dropped |
| no token (before login) | anything | anonymous | dropped |
| old queue, no stamp | anything | anonymous | dropped |

!!! check "No credential on disk"
    `localStorage` holds the report and stamps such as `t:3f1c…` — 64 bits of
    hash that do not turn back into a token. The token stays only where the
    app keeps it.

### With `TelemetryProvider`

If the app already programs against `useTelemetry()`, the adapter connects both ends:

```tsx
import type { ReactNode } from "react";
import {
    createAppErrorReporter,
    createAppErrorTelemetryAdapter,
    TelemetryProvider,
} from "tempest-react-sdk";

const reporter = createAppErrorReporter({ endpoint: "/api/app-errors" });
const adapter = createAppErrorTelemetryAdapter({ reporter });

export function AppTelemetry({ children }: { children: ReactNode }) {
    return <TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
}
```

| `TelemetryAdapter`           | reporter                    |
| ---------------------------- | --------------------------- |
| `captureException(err, ctx)` | `reporter.report(err, ctx)` |
| `flush()`                    | `reporter.flush()`          |
| `identify` / `track`         | nothing                     |

!!! info "Why `identify` and `track` do nothing"
    The backend takes the user from the token, never from the client, and the
    route stores errors, not product events. Need both? Use this adapter for
    errors and an analytics one (PostHog) for events.

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
- **`createAppErrorReporter`** takes field errors to a Tempest backend's `/api/app-errors`, with an offline queue, dedup and 429 handling — and each report only leaves with a bearer under the same token it was raised with (`clear()` on logout).

### See also

- [Error Boundary](./error-boundary.en.md) — `onError` → `captureException`
- [Logger](./logger.en.md) — local structured logs
- [Feature Flags](./feature-flags.en.md) — adapters follow the exact same injection pattern
