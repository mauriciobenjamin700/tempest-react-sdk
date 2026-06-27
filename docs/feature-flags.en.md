# Feature Flags

Feature flags turn functionality on and off without a new deploy: gradual rollouts (`new-checkout` to 10% of users), kill-switches (`disable_payments` when the gateway goes down), A/B experiments. The problem is the same as telemetry — you don't want to tie the app to a specific flags SDK. The `feature-flags` module solves it with a **minimal interface** (`isEnabled` / `get` / `onChange?`) that isolates the app from the actual provider (GrowthBook, LaunchDarkly, Unleash, custom).

Concrete adapters ship ready-made for GrowthBook and LaunchDarkly; none of the external SDKs is a peer dep — the **caller injects the already-configured instance**, so you only install what you use.

!!! info "Why the adapter receives the instance, doesn't create it"
    Each flags SDK is initialized differently (GrowthBook loads features over the
    network with `loadFeatures()`, LaunchDarkly waits on `waitUntilReady()`, both
    take user targeting attributes). The app owns that initialization; the adapter
    just routes the lookups. That's why you pass the ready instance:
    `createGrowthBookFeatureFlagsAdapter({ growthbook: gb })`.

## Interface

```ts
import type { FeatureFlagsAdapter, FlagValue } from "tempest-react-sdk";

type FlagValue = boolean | string | number | null;

interface FeatureFlagsAdapter {
  isEnabled: (key: string, defaultValue?: boolean) => boolean;
  get: <T extends FlagValue = FlagValue>(key: string, defaultValue?: T) => T;
  onChange?: (listener: () => void) => () => void;
}
```

`onChange` is optional — when present, the hooks re-render children on every notification (via `useSyncExternalStore`).

## Setup with `InMemory` (dev / tests)

```tsx
import { FeatureFlagsProvider, createInMemoryFlags } from "tempest-react-sdk";

const flags = createInMemoryFlags({
  initial: { "new-feed": true, max_items: 50 },
});

<FeatureFlagsProvider adapter={flags}>{children}</FeatureFlagsProvider>;
```

`createInMemoryFlags` also exposes `set(key, value)` for dynamic mutations in tests:

```ts
flags.set("new-feed", false); // fires onChange → automatic re-render
```

!!! warning "`useFeatureFlag` / `useFlagValue` require the provider"
    The hooks throw `Error("useFeatureFlag requires <FeatureFlagsProvider>")`
    when no provider is mounted above. Unlike `useTelemetry` (which returns
    `null`), there's no silent fallback here — always mount a
    `<FeatureFlagsProvider>`, even if just an empty `createInMemoryFlags()` in
    tests.

## Usage in components

```tsx
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";

const showNewFeed = useFeatureFlag("new-feed", false);
const maxItems = useFlagValue<number>("max_items", 10);

return showNewFeed ? <NewFeed limit={maxItems} /> : <ClassicFeed limit={maxItems} />;
```

`useFeatureFlag` coerces to boolean; `useFlagValue<T>` keeps the type (`string` / `number` / `boolean` / `null`).

## Complete example — gating a feature from root to component

Stitching provider, hook, and a safe default together in a real app:

```tsx
// flags.tsx — adapter at the root (in-memory here; swap for the real provider in prod)
import { FeatureFlagsProvider, createInMemoryFlags } from "tempest-react-sdk";
import type { ReactNode } from "react";

const flagsAdapter = createInMemoryFlags({
  initial: { "new-checkout": false, "max_cart_items": 20 },
});

export function AppFlags({ children }: { children: ReactNode }) {
  return <FeatureFlagsProvider adapter={flagsAdapter}>{children}</FeatureFlagsProvider>;
}
```

```tsx
// CheckoutPage.tsx — picks the UI by the flag, reads a typed limit
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";
import { NewCheckout } from "./NewCheckout";
import { ClassicCheckout } from "./ClassicCheckout";

export function CheckoutPage() {
  const useNewCheckout = useFeatureFlag("new-checkout", false); // safe default: false
  const maxCartItems = useFlagValue<number>("max_cart_items", 10); // safe default: 10

  return useNewCheckout ? (
    <NewCheckout maxItems={maxCartItems} />
  ) : (
    <ClassicCheckout maxItems={maxCartItems} />
  );
}
```

When the flag changes on the provider (rollout bumped, kill-switch flipped), `onChange` fires and the components reading the flag re-render automatically — no reload.

## GrowthBook adapter

Wraps a `GrowthBook` instance (created and configured by the app — `apiHost`, `clientKey`, `attributes`, `loadFeatures()`).

```ts
import { GrowthBook } from "@growthbook/growthbook";
import { FeatureFlagsProvider, createGrowthBookFeatureFlagsAdapter } from "tempest-react-sdk";

const gb = new GrowthBook({
    apiHost: import.meta.env.VITE_GROWTHBOOK_API_HOST,
    clientKey: import.meta.env.VITE_GROWTHBOOK_KEY,
    attributes: { id: userId },
});
await gb.loadFeatures();

const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });

<FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>;
```

Mapping:

| `FeatureFlagsAdapter`     | `GrowthBook`                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `isEnabled(key, default)` | `growthbook.isOn(key)` (falls back to the default if the return isn't a bool)                          |
| `get(key, default)`       | `growthbook.getFeatureValue(key, default)`                                                             |
| `onChange(listener)`      | `growthbook.setRenderer(...)` — installed lazily on the 1st subscription, multiplexes to all listeners |

`GrowthBook` accepts only **one** `setRenderer`, so the adapter keeps an internal fan-out (`Set<listener>`) and installs the single renderer on the first `onChange` call.

## LaunchDarkly adapter

Wraps `launchdarkly-js-client-sdk` (created and initialized by the app).

```ts
import * as LDClient from "launchdarkly-js-client-sdk";
import { FeatureFlagsProvider, createLaunchDarklyFeatureFlagsAdapter } from "tempest-react-sdk";

const client = LDClient.initialize(import.meta.env.VITE_LD_CLIENT_ID, {
    kind: "user",
    key: userId,
});
await client.waitUntilReady();

const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });

<FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>;
```

Mapping:

| `FeatureFlagsAdapter`     | `LDClient`                                                |
| ------------------------- | --------------------------------------------------------- |
| `isEnabled(key, default)` | `client.variation(key, default) === true`                 |
| `get(key, default)`       | `client.variation(key, default)`                          |
| `onChange(listener)`      | `client.on("change", listener)` + `client.off` on cleanup |

!!! tip "The injection pattern is identical to Telemetry's"
    The `GrowthBookLike` / `LDClientLike` types declare only the subset used —
    handy for mocking in tests. For any new provider (Unleash, Split,
    Cloudflare), the same pattern applies: caller injects the instance, adapter
    exposes `<X>Like`, direct stateless mapping. See [Telemetry](./telemetry.en.md)
    — it's the same recipe.

## Custom adapter

The interface is tiny — ~20 lines for any SDK:

```ts
import type { FeatureFlagsAdapter } from "tempest-react-sdk";
import unleash from "unleash-proxy-client";

export const unleashAdapter: FeatureFlagsAdapter = {
  isEnabled: (key, defaultValue = false) => unleash.isEnabled(key) ?? defaultValue,
  get: (key, defaultValue) => unleash.getVariant(key)?.payload?.value ?? defaultValue,
  onChange: (listener) => {
    unleash.on("update", listener);
    return () => unleash.off("update", listener);
  },
};
```

## Patterns

- **Always a safe default** — `useFlagValue<number>("k", 10)`. If the provider is offline or still loading, you get the fallback.
- **Don't use it for UI state** — only for rollouts (`new-checkout`) and kill-switches (`disable_payments`). UI state goes to Zustand/local state.
- **It doesn't cache the type** — `useFlagValue<number>("k")` returns the raw declared value; do the narrowing/coercion at the call site when needed.
- **Track exposures** — combine with [Telemetry](./telemetry.en.md) to record who saw which variant: `telemetry?.track({ name: "flag.exposure", properties: { flag, variant } })`.

## Recap

- **Program against `FeatureFlagsAdapter`** (`isEnabled` / `get` / `onChange?`) — switching provider is trivial.
- **`<FeatureFlagsProvider>` is mandatory** — the hooks throw without it (unlike `useTelemetry`).
- **`useFeatureFlag`** → boolean; **`useFlagValue<T>`** → typed value; both re-render via `onChange`.
- **Adapters inject the already-configured instance** (`{ growthbook }`, `{ client }`) — never a peer dep.
- **Always pass a safe default**; flags are for rollouts and kill-switches, not UI state.

### See also

- [Telemetry](./telemetry.en.md) — track flag exposures; adapters follow the exact same injection pattern
