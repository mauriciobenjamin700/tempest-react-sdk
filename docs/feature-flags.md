# Feature Flags

Interface mínima (`isEnabled`, `get`, `onChange`) que isola o app do provider de flags (GrowthBook, LaunchDarkly, Unleash, custom).

## Setup

```tsx
import { FeatureFlagsProvider, createInMemoryFlags } from "tempest-react-sdk";

const flags = createInMemoryFlags({
    initial: { "new-feed": true, "max_items": 50 },
});

<FeatureFlagsProvider adapter={flags}>{children}</FeatureFlagsProvider>;
```

## Uso em componentes

```tsx
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";

const showNewFeed = useFeatureFlag("new-feed", false);
const maxItems = useFlagValue<number>("max_items", 10);

return showNewFeed ? <NewFeed limit={maxItems} /> : <ClassicFeed limit={maxItems} />;
```

Re-renderiza automaticamente quando o adapter notifica (`onChange`).

## Adapter custom

```ts
import type { FeatureFlagsAdapter } from "tempest-react-sdk";
import { GrowthBook } from "@growthbook/growthbook";

const gb = new GrowthBook();
export const growthbookAdapter: FeatureFlagsAdapter = {
    isEnabled: (key, defaultValue = false) => gb.isOn(key) ?? defaultValue,
    get: (key, defaultValue) => gb.getFeatureValue(key, defaultValue),
    onChange: (listener) => gb.subscribe(listener),
};
```

## Padrões

- **Default seguro** — sempre passe o default. Flag offline retorna o padrão.
- **Não use pra estado de UI** — apenas pra rollouts e kill-switches.
- **Não cacheia tipo** — `useFlagValue<number>("k")` retorna o valor cru; faça narrowing no callsite quando precisar.

## Veja também

- [Telemetry](./telemetry.md) — rastrear exposições do flag
