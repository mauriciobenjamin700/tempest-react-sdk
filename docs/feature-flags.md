# Feature Flags

Feature flags ligam e desligam funcionalidades sem novo deploy: rollouts graduais (`new-checkout` para 10% dos usuários), kill-switches (`disable_payments` quando o gateway cai), experimentos A/B. O problema é o mesmo da telemetria — você não quer amarrar o app a um SDK específico de flags. O módulo `feature-flags` resolve com uma **interface mínima** (`isEnabled` / `get` / `onChange?`) que isola o app do provider real (GrowthBook, LaunchDarkly, Unleash, custom).

Adapters concretos vêm prontos para GrowthBook e LaunchDarkly; nenhum dos SDKs externos é peer dep — o **caller injeta a instância** já configurada, então você instala apenas o que usa.

!!! info "Por que o adapter recebe a instância, não a cria"
    Cada SDK de flags é inicializado de um jeito (GrowthBook carrega features pela
    rede com `loadFeatures()`, LaunchDarkly espera `waitUntilReady()`, ambos
    recebem atributos de targeting do usuário). O app é dono dessa inicialização;
    o adapter só roteia os lookups. Por isso você passa a instância pronta:
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

`onChange` é opcional — quando presente, os hooks re-renderizam os filhos a cada notificação (via `useSyncExternalStore`).

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

!!! warning "`useFeatureFlag` / `useFlagValue` exigem o provider"
    Os hooks lançam `Error("useFeatureFlag requires <FeatureFlagsProvider>")`
    quando não há provider montado acima. Diferente do `useTelemetry` (que
    devolve `null`), aqui não há fallback silencioso — sempre monte um
    `<FeatureFlagsProvider>`, nem que seja com `createInMemoryFlags()` vazio em
    testes.

## Uso em componentes

```tsx
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";

const showNewFeed = useFeatureFlag("new-feed", false);
const maxItems = useFlagValue<number>("max_items", 10);

return showNewFeed ? <NewFeed limit={maxItems} /> : <ClassicFeed limit={maxItems} />;
```

`useFeatureFlag` faz coerce-to-boolean; `useFlagValue<T>` mantém o tipo (`string` / `number` / `boolean` / `null`).

## Exemplo completo — gate de feature da raiz ao componente

Costurando provider, hook e default seguro num app real:

```tsx
// flags.tsx — adapter na raiz (in-memory aqui; troque pelo provider real em prod)
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
// CheckoutPage.tsx — escolhe a UI pelo flag, lê um limite tipado
import { useFeatureFlag, useFlagValue } from "tempest-react-sdk";
import { NewCheckout } from "./NewCheckout";
import { ClassicCheckout } from "./ClassicCheckout";

export function CheckoutPage() {
  const useNewCheckout = useFeatureFlag("new-checkout", false); // default seguro: false
  const maxCartItems = useFlagValue<number>("max_cart_items", 10); // default seguro: 10

  return useNewCheckout ? (
    <NewCheckout maxItems={maxCartItems} />
  ) : (
    <ClassicCheckout maxItems={maxCartItems} />
  );
}
```

Quando o flag muda no provider (rollout aumentado, kill-switch acionado), `onChange` dispara e os componentes que leem o flag re-renderizam automaticamente — sem reload.

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

!!! tip "O padrão de injeção é idêntico ao da Telemetry"
    Os tipos `GrowthBookLike` / `LDClientLike` declaram só o subset usado — úteis
    pra mockar em testes. Para qualquer provider novo (Unleash, Split,
    Cloudflare), o mesmo padrão se aplica: caller injeta a instância, adapter
    expõe `<X>Like`, mapeamento direto sem estado. Veja
    [Telemetry](./telemetry.md) — é a mesma receita.

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

## Resumo

- **Programe contra `FeatureFlagsAdapter`** (`isEnabled` / `get` / `onChange?`) — troca de provider é trivial.
- **`<FeatureFlagsProvider>` é obrigatório** — os hooks lançam sem ele (diferente de `useTelemetry`).
- **`useFeatureFlag`** → boolean; **`useFlagValue<T>`** → valor tipado; ambos re-renderizam via `onChange`.
- **Adapters injetam a instância** já configurada (`{ growthbook }`, `{ client }`) — nunca peer dep.
- **Sempre passe um default seguro**; flags são para rollouts e kill-switches, não para estado de UI.

### Veja também

- [Telemetry](./telemetry.md) — rastrear exposições do flag; adapters seguem exatamente o mesmo padrão de injeção
