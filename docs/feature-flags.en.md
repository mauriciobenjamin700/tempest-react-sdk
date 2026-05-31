# Feature Flags

A minimal interface (`isEnabled` / `get` / `onChange?`) that isolates the app
from the actual provider (GrowthBook, LaunchDarkly, Unleash, custom). Concrete
adapters ship ready-made for GrowthBook and LaunchDarkly; none of the external
SDKs is a peer dep — you only install what you use.

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

`onChange` is optional — when present, `FeatureFlagsProvider` re-renders children
on every notification.

## Setup with `InMemory` (dev / tests)

```tsx
import { FeatureFlagsProvider, createInMemoryFlags } from "tempest-react-sdk";

const flags = createInMemoryFlags({
  initial: { "new-feed": true, max_items: 50 },
});

<FeatureFlagsProvider adapter={flags}>{children}</FeatureFlagsProvider>;
```

`createInMemoryFlags` also exposes `set(key, value)` for dynamic mutations in
tests:

```ts
flags.set("new-feed", false); // fires onChange → automatic re-render
```

## Usage in components

```tsx
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";

const showNewFeed = useFeatureFlag("new-feed", false);
const maxItems = useFlagValue<number>("max_items", 10);

return showNewFeed ? <NewFeed limit={maxItems} /> : <ClassicFeed limit={maxItems} />;
```

`useFeatureFlag` coerces to boolean; `useFlagValue<T>` keeps the type (`string` /
`number` / `boolean` / `null`).

## GrowthBook adapter

Wraps a `GrowthBook` instance (created and configured by the app — `apiHost`,
`clientKey`, `attributes`, `loadFeatures()`).

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

| `FeatureFlagsAdapter` | `GrowthBook` |
| --- | --- |
| `isEnabled(key, default)` | `growthbook.isOn(key)` (falls back to the default if the return isn't a bool) |
| `get(key, default)` | `growthbook.getFeatureValue(key, default)` |
| `onChange(listener)` | `growthbook.setRenderer(...)` — installed lazily on the 1st subscription, multiplexes to all listeners |

`GrowthBook` accepts only **one** `setRenderer`, so the adapter keeps an internal
fan-out (`Set<listener>`) and installs the single renderer on the first
`onChange` call.

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

| `FeatureFlagsAdapter` | `LDClient` |
| --- | --- |
| `isEnabled(key, default)` | `client.variation(key, default) === true` |
| `get(key, default)` | `client.variation(key, default)` |
| `onChange(listener)` | `client.on("change", listener)` + `client.off` on cleanup |

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
- **Track exposures** — combine with [Telemetry](./telemetry.md) to record who saw which variant: `telemetry?.track({ name: "flag.exposure", properties: { flag, variant } })`.

## See also

- [Telemetry](./telemetry.md) — track flag exposures; adapters follow the same pattern
