# Logger

Leveled logger com sinks plugáveis. Padrão: `console`. Plug remote ingestion (Sentry/Datadog) implementando a interface `LoggerSink`.

## Uso

```ts
import { createLogger } from "tempest-react-sdk";

const log = createLogger({ level: "info" });
log.info("app booted");
log.warn("cache miss", { key: "user:42" });
log.error("payment failed", { orderId, reason });
```

Níveis: `debug` < `info` < `warn` < `error`. Tudo abaixo do `level` configurado é descartado.

## Namespaces

```ts
const auth = log.child("auth");
auth.info("login ok"); // "[auth] login ok"

const refresh = auth.child("refresh");
refresh.warn("retry"); // "[auth:refresh] retry"
```

## Sinks custom

```ts
import { createLogger, type LoggerSink } from "tempest-react-sdk";

const datadogSink: LoggerSink = (entry) => {
    fetch("https://datadog/intake", {
        method: "POST",
        body: JSON.stringify({
            level: entry.level,
            message: entry.message,
            context: entry.context,
            ts: entry.timestamp,
        }),
    });
};

const log = createLogger({
    level: "info",
    sinks: [datadogSink],
});
```

Sinks que lançam exceção são silenciados — o app nunca quebra por causa de logging.

## Veja também

- [Telemetry](./telemetry.md) — para eventos de produto, não logs.
- [Error Boundary](./error-boundary.md)
