# Telemetry

Adapter genérico (`identify` / `track` / `captureException` / `flush`) que isola o app dos detalhes do provider real (Sentry, Datadog, PostHog).

## Provider

```tsx
import { TelemetryProvider, consoleTelemetryAdapter } from "tempest-react-sdk";

<TelemetryProvider adapter={consoleTelemetryAdapter}>{children}</TelemetryProvider>;
```

Em produção, substitua `consoleTelemetryAdapter` por um adapter sobre Sentry/Datadog/PostHog:

```ts
import * as Sentry from "@sentry/react";
import type { TelemetryAdapter } from "tempest-react-sdk";

export const sentryAdapter: TelemetryAdapter = {
  init: () => Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN }),
  identify: (user) => Sentry.setUser(user ? { id: user.id, email: user.email } : null),
  track: ({ name, properties }) =>
    Sentry.addBreadcrumb({ category: "track", message: name, data: properties }),
  captureException: (error, context) => Sentry.captureException(error, { extra: context }),
  flush: () => Sentry.close(),
};
```

## Uso

```tsx
import { useTelemetry } from "tempest-react-sdk";

const telemetry = useTelemetry();
telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL: 990 } });
```

Retorna `null` quando o provider não está montado — UI não quebra em testes.

## Integração com ErrorBoundary

```tsx
const telemetry = useTelemetry();

<ErrorBoundary onError={(err, info) => telemetry?.captureException(err, info)}>
  {children}
</ErrorBoundary>;
```

## Veja também

- [Error Boundary](./error-boundary.md)
- [Logger](./logger.md) — para logs estruturados locais
