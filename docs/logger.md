# Logger

`createLogger` é um logger nivelado com **sinks plugáveis**. O padrão escreve no `console`; você troca ou soma destinos (Sentry, Datadog, ingestão remota) implementando a interface `LoggerSink`. Cada entrada é estruturada (`{ level, message, context, timestamp }`), não uma string solta.

!!! info "Por que não `console.log` direto?"
`console.log` espalhado pelo código não tem nível (não dá pra silenciar `debug` em produção), não tem namespace (de onde veio aquele log?) e não dá pra redirecionar para um serviço remoto. O logger resolve os três: filtra por nível, prefixa namespaces e despacha a mesma entrada para quantos sinks você quiser.

## Uso

```ts
import { createLogger } from "tempest-react-sdk";

const log = createLogger({ level: "info" });

log.info("app booted");
log.warn("cache miss", { key: "user:42" });
log.error("payment failed", { orderId: "ord_1", reason: "card_declined" });
log.debug("verbose trace"); // descartado: debug < info
```

O segundo argumento (`context`) é um objeto livre `Record<string, unknown>` — anexe metadados estruturados em vez de interpolar na mensagem.

## Níveis

A ordem é `debug` < `info` < `warn` < `error`. Tudo **abaixo** do `level` configurado é descartado antes mesmo de chegar aos sinks:

```ts
const prod = createLogger({ level: "warn" });
prod.info("isso some"); // descartado
prod.warn("isso aparece"); // emitido
```

!!! tip "Ajuste o nível por ambiente"
Use `level: "debug"` em desenvolvimento e `level: "warn"` (ou `"error"`) em produção. Como o filtro acontece antes dos sinks, logs silenciados não custam I/O nem chamadas de rede.

## Namespaces (loggers filhos)

`log.child(namespace)` cria um logger que prefixa `[namespace]` em cada mensagem. Filhos podem ter filhos — os namespaces se acumulam com `:`:

```ts
const log = createLogger({ level: "debug" });

const auth = log.child("auth");
auth.info("login ok"); // "[auth] login ok"

const refresh = auth.child("refresh");
refresh.warn("retry"); // "[auth:refresh] retry"
```

!!! note "Filhos herdam nível e sinks"
Um logger filho compartilha o `level` e os `sinks` do pai — só o namespace muda. Configure o destino uma vez na raiz e crie filhos à vontade pelos módulos.

## Sinks custom

Um sink é só uma função `(entry: LogEntry) => void`. Implemente a interface `LoggerSink` para mandar logs a qualquer lugar:

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
    /* nunca propaga falha de rede pro logging */
  });
};

const log = createLogger({ level: "info", sinks: [datadogSink] });
```

Para escrever no console **e** num destino remoto, combine sinks no array — `consoleSink` é exportado para isso:

```ts
import { createLogger, consoleSink } from "tempest-react-sdk";

const log = createLogger({
  level: "info",
  sinks: [consoleSink, datadogSink],
});
```

!!! warning "Sinks nunca derrubam o app"
Cada sink roda dentro de um `try/catch` interno — se um sink lançar exceção, o erro é engolido e os demais sinks ainda recebem a entrada. Logging defeituoso não pode quebrar a aplicação.

## Plugando na telemetria

O mesmo padrão de sink conecta o logger ao seu provider de telemetria. Aqui um sink que vira breadcrumbs no Sentry:

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
O logger é para **diagnóstico técnico** (traces, falhas, estados). Eventos de produto/negócio (`signup`, `purchase`) vão pelo módulo de [Telemetry](./telemetry.md), que tem semântica própria de eventos e adapters dedicados. Use cada um para o que foi feito.

## Recap

- `createLogger({ level, sinks, namespace })` cria um logger nivelado; padrão é `level: "info"` + `consoleSink`.
- Níveis `debug` < `info` < `warn` < `error`; o que está abaixo do `level` é filtrado antes dos sinks.
- `log.child(ns)` prefixa `[ns]`; filhos aninham com `:` e herdam nível/sinks do pai.
- Um `LoggerSink` é `(entry: LogEntry) => void`; combine vários no array `sinks` (incluindo o exportado `consoleSink`).
- Sinks rodam em `try/catch` — um sink quebrado nunca derruba o app nem os outros sinks.
- Logger é para diagnóstico técnico; eventos de produto vão pela Telemetry.

## Veja também

- [Telemetry](./telemetry.md) — para eventos de produto, não logs
- [Error Boundary](./error-boundary.md) — encaminhe `onError` para um sink/telemetria
