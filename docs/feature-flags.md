# Feature Flags

Interface mínima (`isEnabled` / `get` / `onChange?`) que isola o app do provider real (GrowthBook, LaunchDarkly, Unleash, custom). Adapters concretos vêm prontos para GrowthBook e LaunchDarkly; nenhum dos SDKs externos é peer dep — você instala apenas o que usa.

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

`onChange` é opcional — quando presente, `FeatureFlagsProvider` re-renderiza filhos a cada notificação.

## Setup com `InMemory` (dev / testes)

```tsx
import { FeatureFlagsProvider, createInMemoryFlags } from "tempest-react-sdk";

const flags = createInMemoryFlags({
  initial: { "new-feed": true, max_items: 50 },
});

<FeatureFlagsProvider adapter={flags}>{children}</FeatureFlagsProvider>;
```

`createInMemoryFlags` também expõe `set(key, value)` para mutações dinâmicas em testes:

```ts
flags.set("new-feed", false); // dispara onChange → re-render automático
```

## Uso em componentes

```tsx
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";

const showNewFeed = useFeatureFlag("new-feed", false);
const maxItems = useFlagValue<number>("max_items", 10);

return showNewFeed ? <NewFeed limit={maxItems} /> : <ClassicFeed limit={maxItems} />;
```

`useFeatureFlag` faz coerce-to-boolean; `useFlagValue<T>` mantém o tipo (`string` / `number` / `boolean` / `null`).

## GrowthBook adapter

Wrap uma instância `GrowthBook` (criada e configurada pelo app — `apiHost`, `clientKey`, `attributes`, `loadFeatures()`).

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

Mapeamento:

| `FeatureFlagsAdapter`     | `GrowthBook`                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `isEnabled(key, default)` | `growthbook.isOn(key)` (fallback no default se retorno não-bool)                                |
| `get(key, default)`       | `growthbook.getFeatureValue(key, default)`                                                      |
| `onChange(listener)`      | `growthbook.setRenderer(...)` — instalado lazy na 1ª inscrição, multiplexa para todos listeners |

`GrowthBook` aceita apenas **um** `setRenderer`, então o adapter mantém um fan-out interno (`Set<listener>`) e instala o renderer único na primeira chamada de `onChange`.

## LaunchDarkly adapter

Wrap `launchdarkly-js-client-sdk` (criado e inicializado pelo app).

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

Mapeamento:

| `FeatureFlagsAdapter`     | `LDClient`                                                |
| ------------------------- | --------------------------------------------------------- |
| `isEnabled(key, default)` | `client.variation(key, default) === true`                 |
| `get(key, default)`       | `client.variation(key, default)`                          |
| `onChange(listener)`      | `client.on("change", listener)` + `client.off` no cleanup |

## Adapter custom

A interface é minúscula — ~20 linhas para qualquer SDK:

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

## Padrões

- **Default seguro sempre** — `useFlagValue<number>("k", 10)`. Se o provider está offline ou ainda carregando, você ganha o fallback.
- **Não use pra estado de UI** — use apenas para rollouts (`new-checkout`) e kill-switches (`disable_payments`). Estado de UI vai pra Zustand/local state.
- **Não cacheia tipo** — `useFlagValue<number>("k")` retorna o valor cru declarado; faça narrowing/coerção no callsite quando precisar.
- **Rastreie exposições** — combine com [Telemetry](./telemetry.md) para gravar quem viu qual variante: `telemetry?.track({ name: "flag.exposure", properties: { flag, variant } })`.

## Veja também

- [Telemetry](./telemetry.md) — rastrear exposições do flag, adapters seguem o mesmo padrão
