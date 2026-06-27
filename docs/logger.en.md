# Logger

`createLogger` is a leveled logger with **pluggable sinks**. The default writes to the `console`; you swap or add destinations (Sentry, Datadog, remote ingestion) by implementing the `LoggerSink` interface. Each entry is structured (`{ level, message, context, timestamp }`), not a loose string.

!!! info "Why not `console.log` directly?"
`console.log` scattered through the code has no level (you can't silence `debug` in production), no namespace (where did that log come from?), and can't be redirected to a remote service. The logger solves all three: it filters by level, prefixes namespaces, and dispatches the same entry to as many sinks as you want.

## Usage

```ts
import { createLogger } from "tempest-react-sdk";

const log = createLogger({ level: "info" });

log.info("app booted");
log.warn("cache miss", { key: "user:42" });
log.error("payment failed", { orderId: "ord_1", reason: "card_declined" });
log.debug("verbose trace"); // dropped: debug < info
```

The second argument (`context`) is a free-form `Record<string, unknown>` object — attach structured metadata instead of interpolating it into the message.

## Levels

The order is `debug` < `info` < `warn` < `error`. Anything **below** the configured `level` is dropped before it even reaches the sinks:

```ts
const prod = createLogger({ level: "warn" });
prod.info("this disappears"); // dropped
prod.warn("this shows up"); // emitted
```

!!! tip "Tune the level per environment"
Use `level: "debug"` in development and `level: "warn"` (or `"error"`) in production. Because filtering happens before the sinks, silenced logs cost no I/O nor network calls.

## Namespaces (child loggers)

`log.child(namespace)` creates a logger that prefixes `[namespace]` to every message. Children can have children — namespaces stack with `:`:

```ts
const log = createLogger({ level: "debug" });

const auth = log.child("auth");
auth.info("login ok"); // "[auth] login ok"

const refresh = auth.child("refresh");
refresh.warn("retry"); // "[auth:refresh] retry"
```

!!! note "Children inherit level and sinks"
A child logger shares the parent's `level` and `sinks` — only the namespace changes. Configure the destination once at the root and create children freely across modules.

## Custom sinks

A sink is just a `(entry: LogEntry) => void` function. Implement the `LoggerSink` interface to send logs anywhere:

```ts
import { createLogger, type LoggerSink } from "tempest-react-sdk";

const datadogSink: LoggerSink = (entry) => {
  fetch("https://http-intake.logs.datadoghq.com/api/v2/logs", {
    method: "POST",
    headers: { "DD-API-KEY": import.meta.env.VITE_DD_KEY },
    body: JSON.stringify({
      status: entry.level,
      message: entry.message,
      context: entry.context,
      timestamp: entry.timestamp,
    }),
  }).catch(() => {
    /* never let a network failure propagate into logging */
  });
};

const log = createLogger({ level: "info", sinks: [datadogSink] });
```

To write to the console **and** a remote destination, combine sinks in the array — `consoleSink` is exported for exactly this:

```ts
import { createLogger, consoleSink } from "tempest-react-sdk";

const log = createLogger({
  level: "info",
  sinks: [consoleSink, datadogSink],
});
```

!!! warning "Sinks never take down the app"
Each sink runs inside an internal `try/catch` — if a sink throws, the error is swallowed and the remaining sinks still receive the entry. Faulty logging must not break the application.

## Plugging into telemetry

The same sink pattern connects the logger to your telemetry provider. Here is a sink that turns logs into Sentry breadcrumbs:

```ts
import { createLogger, type LoggerSink } from "tempest-react-sdk";
import * as Sentry from "@sentry/browser";

const sentrySink: LoggerSink = (entry) => {
  Sentry.addBreadcrumb({
    level: entry.level === "warn" ? "warning" : entry.level,
    message: entry.message,
    data: entry.context,
  });
};

export const log = createLogger({ level: "info", sinks: [sentrySink] });
```

!!! note "Logger ≠ Telemetry"
The logger is for **technical diagnostics** (traces, failures, state). Product/business events (`signup`, `purchase`) go through the [Telemetry](./telemetry.md) module, which has its own event semantics and dedicated adapters. Use each for what it is built for.

## Recap

- `createLogger({ level, sinks, namespace })` creates a leveled logger; default is `level: "info"` + `consoleSink`.
- Levels `debug` < `info` < `warn` < `error`; anything below `level` is filtered before the sinks.
- `log.child(ns)` prefixes `[ns]`; children nest with `:` and inherit the parent's level/sinks.
- A `LoggerSink` is `(entry: LogEntry) => void`; combine several in the `sinks` array (including the exported `consoleSink`).
- Sinks run in `try/catch` — a broken sink never takes down the app nor the other sinks.
- The logger is for technical diagnostics; product events go through Telemetry.

## See also

- [Telemetry](./telemetry.md) — for product events, not logs
- [Error Boundary](./error-boundary.md) — forward `onError` to a sink/telemetry
