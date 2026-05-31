# Logger

A leveled logger with pluggable sinks. Default: `console`. Plug in remote
ingestion (Sentry/Datadog) by implementing the `LoggerSink` interface.

## Usage

```ts
import { createLogger } from "tempest-react-sdk";

const log = createLogger({ level: "info" });
log.info("app booted");
log.warn("cache miss", { key: "user:42" });
log.error("payment failed", { orderId, reason });
```

Levels: `debug` < `info` < `warn` < `error`. Everything below the configured
`level` is discarded.

## Namespaces

```ts
const auth = log.child("auth");
auth.info("login ok"); // "[auth] login ok"

const refresh = auth.child("refresh");
refresh.warn("retry"); // "[auth:refresh] retry"
```

## Custom sinks

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

Sinks that throw are silenced — the app never breaks because of logging.

## See also

- [Telemetry](./telemetry.md) — for product events, not logs.
- [Error Boundary](./error-boundary.md)
