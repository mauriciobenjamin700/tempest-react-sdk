# Telemetry

Toda app precisa de telemetria — identificar usuários, rastrear eventos, capturar exceções — mas você não quer espalhar chamadas de `Sentry.captureException` ou `posthog.capture` por todo o código. Se um dia trocar de provider, teria que caçar cada callsite. O módulo `telemetry` resolve isso com uma **interface mínima** que isola o app do provider real (Sentry, PostHog, Datadog, custom). Você programa contra a interface; o provider é injetado uma vez, na raiz.

Adapters concretos para os providers mais comuns vêm prontos no SDK; nenhum deles é peer dep — o **caller injeta a instância** do SDK externo, então você instala apenas o que usa.

!!! info "Por que injetar a instância em vez de declarar peer dep"
    Apps que já inicializam o Sentry no startup (DSN, sample rate, integrações)
    querem reusar _aquela_ instância — não uma criada pelo SDK. E apps que não
    usam Sentry não devem pagar por ele no bundle. Por isso cada
    `create<Provider>Adapter` recebe a instância pronta no options
    (`{ sentry: Sentry }`, `{ posthog }`).

## Interface

```ts
import type { TelemetryAdapter, TelemetryEvent, TelemetryUser } from "tempest-react-sdk";

interface TelemetryAdapter {
  init?: () => void | Promise<void>;
  identify: (user: TelemetryUser | null) => void;
  track: (event: TelemetryEvent) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  flush?: () => Promise<void> | void;
}

interface TelemetryUser {
  id?: string;
  email?: string;
  name?: string;
  traits?: Record<string, unknown>;
}

interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
}
```

## Provider

```tsx
import { TelemetryProvider, consoleTelemetryAdapter } from "tempest-react-sdk";

<TelemetryProvider adapter={consoleTelemetryAdapter}>{children}</TelemetryProvider>;
```

`consoleTelemetryAdapter` é o default para dev/teste — loga cada chamada no `console`.

`TelemetryProvider` invoca `adapter.init?.()` no mount e `adapter.flush?.()` no unmount.

## Uso em componentes

```tsx
import { useTelemetry } from "tempest-react-sdk";

const telemetry = useTelemetry();
telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL: 990 } });
```

`useTelemetry()` retorna `null` quando não há provider montado — a UI não quebra em testes.

!!! warning "Sempre use optional chaining"
    `useTelemetry()` devolve `null` fora de um `<TelemetryProvider>`. Chame
    sempre com `?.` (`telemetry?.track(...)`) — assim os callsites continuam
    funcionando em testes unitários e em árvores que não montam o provider, sem
    explodir com "cannot read property of null".

## Setup completo — adapter + provider + identify + track

Um app real inicializa o adapter na raiz, identifica o usuário no login e rastreia eventos nas ações. Esqueleto completo e copiável:

```tsx
// telemetry.tsx
import posthog from "posthog-js";
import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";
import type { ReactNode } from "react";

export const telemetryAdapter = createPostHogTelemetryAdapter({
  posthog,
  init: {
    apiKey: import.meta.env.VITE_POSTHOG_KEY,
    options: { api_host: "https://us.i.posthog.com" },
  },
});

export function AppTelemetry({ children }: { children: ReactNode }) {
  return <TelemetryProvider adapter={telemetryAdapter}>{children}</TelemetryProvider>;
}
```

```tsx
// useSessionTelemetry.ts — identifica/reseta quando a sessão muda
import { useEffect } from "react";
import { useTelemetry } from "tempest-react-sdk";
import { useAuthStore } from "./auth-store";

export function useSessionTelemetry() {
  const telemetry = useTelemetry();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      telemetry?.identify({ id: user.id, email: user.email, name: user.name });
    } else {
      telemetry?.identify(null); // logout → reset
    }
  }, [telemetry, user]);
}
```

```tsx
// CheckoutButton.tsx — rastreia um evento de negócio
import { useTelemetry, Button } from "tempest-react-sdk";

export function CheckoutButton({ aloId, valueBRL }: { aloId: string; valueBRL: number }) {
  const telemetry = useTelemetry();
  return (
    <Button
      onClick={() => {
        telemetry?.track({ name: "alo_purchased", properties: { aloId, valueBRL } });
      }}
    >
      Comprar
    </Button>
  );
}
```

## Sentry adapter

Wrap `@sentry/browser` (ou `@sentry/react`) — o SDK Sentry é passado pelo caller, não vira peer dep.

```ts
import * as Sentry from "@sentry/browser";
import { createSentryTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createSentryTelemetryAdapter({
    sentry: Sentry,
    initOptions: {
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
    },
    flushTimeout: 2000,        // default
    breadcrumbCategory: "app", // default
});

<TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
```

Mapeamento:

| `TelemetryAdapter`           | `@sentry/browser`                                                  |
| ---------------------------- | ------------------------------------------------------------------ |
| `init()`                     | `Sentry.init(initOptions)` (apenas quando `initOptions` é passado) |
| `identify(user)`             | `Sentry.setUser({id, email, username, ...traits})`                 |
| `identify(null)`             | `Sentry.setUser(null)`                                             |
| `track({name, properties})`  | `Sentry.addBreadcrumb({category, message, level:"info", data})`    |
| `captureException(err, ctx)` | `Sentry.captureException(err, { extra: ctx })`                     |
| `flush()`                    | `Sentry.flush(flushTimeout)`                                       |

O tipo `SentryLike` é exportado pra você mockar em testes:

```ts
import type { SentryLike } from "tempest-react-sdk";

const fakeSentry: SentryLike = {
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
};
```

## PostHog adapter

Wrap `posthog-js`.

```ts
import posthog from "posthog-js";
import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";

const adapter = createPostHogTelemetryAdapter({
    posthog,
    init: {
        apiKey: import.meta.env.VITE_POSTHOG_KEY,
        options: { api_host: "https://us.i.posthog.com" },
    },
});

<TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
```

Mapeamento:

| `TelemetryAdapter`           | `posthog-js`                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `init()`                     | `posthog.init(apiKey, options)` (apenas quando `init` é passado)                                        |
| `identify({id, ...})`        | `posthog.identify(id, { email, name, ...traits })` (skip se `id` ausente)                               |
| `identify(null)`             | `posthog.reset()`                                                                                       |
| `track({name, properties})`  | `posthog.capture(name, properties)`                                                                     |
| `captureException(err, ctx)` | `posthog.captureException(err, ctx)` quando disponível, fallback `posthog.capture("$exception", {...})` |

!!! tip "`SentryLike` / `PostHogLike` são subsets, não os SDKs inteiros"
    Cada adapter declara só os métodos que usa (`setUser`, `addBreadcrumb`,
    `capture`…). Isso te dá um alvo minúsculo para mockar em testes — você
    monta um objeto com 3 `vi.fn()` em vez de stubar o SDK completo — e mantém
    o adapter resiliente a mudanças de API que não tocam esse subset.

## Erros do app para o backend Tempest (`/api/app-errors`)

O erro que importa acontece no celular do usuário, muitas vezes **sem sinal**, e some ali mesmo. Se o seu backend usa o `tempest-fastapi-sdk`, ele já tem onde guardar esse erro: o módulo `app_errors` monta `POST /api/app-errors` e uma tabela consultável no admin. Falta só o lado do app — e é isso que `createAppErrorReporter` entrega. 🚀

```ts
import { createAppErrorReporter } from "tempest-react-sdk";

export const reporter = createAppErrorReporter({
    endpoint: `${import.meta.env.VITE_API_URL}/api/app-errors`,
    getToken: () => sessionStorage.getItem("access_token"),
    device: () => ({
        platform: "web",
        app_version: import.meta.env.VITE_APP_VERSION,
        os_version: navigator.userAgent,
    }),
});

try {
    throw new Error("Falha ao ler a foto", { cause: new TypeError("size=0") });
} catch (error) {
    reporter.report(error, { step: "crop", mime: "image/jpeg", size: 0 });
}
```

Pedaço por pedaço:

- **`endpoint`** — a URL inteira da rota.
- **`getToken`** — opcional. A rota é pública: erro antes do login, ou com sessão vencida, também tem que chegar. Token ausente, vazio ou que lança vira envio anônimo; o backend tira o `user_id` do token, **nunca** do body.
- **`getPrincipal`** — opcional. Quem está logado, lido na hora do erro, para o `foreignReports: "drop"`; veja [Logout e de quem é cada relato](#logout-e-de-quem-e-cada-relato).
- **`device`** — lido **na hora do erro**, não na hora do envio. Um relato enfileirado offline na `1.4.0` não pode sair rotulado `1.5.0`.
- **`report(error, context)`** — nunca lança. Descreve o erro, carimba o aparelho, enfileira e tenta enviar.

### O que vai no `message`

`describeAppError` (exportado, se você quiser usar sozinho) transforma qualquer valor lançado no par `code` + `message`:

```text
Error: Falha ao ler a foto
caused by: TypeError: size=0
context: {"step":"crop","mime":"image/jpeg","size":0}
Error: Falha ao ler a foto
    at …
```

`code` é o `name` do erro. A ordem é proposital: o backend corta o `message` em 4000 caracteres, então vem primeiro o que vale mais — a **cadeia de `cause`**, onde quase sempre está a falha de verdade, depois o seu contexto, e a stack por último.

!!! tip "`DOMException` também"
    O `NotReadableError` que o seletor de arquivos lança é uma `DOMException`, que
    nem sempre passa em `instanceof Error`. O reporter lê o erro pelo formato
    (`name` + `message`), então a causa chega inteira em vez de virar `{}`.

### Offline e a fila

Tudo passa por uma fila em `localStorage` **antes** da rede. Sem sinal, o relato espera; quando o navegador dispara `online`, a fila drena sozinha. Duas regras seguram o tamanho dela:

- **Relato idêntico (com o mesmo carimbo) vira contador.** Um erro em loop entra uma vez, e sai com `[repeated N×]` no começo do `message`.
- **Teto de 50** (`maxEntries`) — o mais antigo sai primeiro.

O que cada resposta faz:

| Resposta | O relato |
| --- | --- |
| 2xx | sai da fila |
| 429 | fica; o envio pausa pelo `Retry-After` e retoma sozinho |
| 5xx, 408, falha de rede | fica; tenta de novo no próximo `report`, `online` ou `flush()` |
| outro 4xx | é descartado — o backend recusaria aquele body para sempre, e ele travaria os de trás |

`flush()` drena na hora e devolve `{ sent, dropped, pending, retryAfterMs }`; chamadas concorrentes compartilham a mesma execução. `dispose()` remove o listener de `online` e o timer.

### Logout e de quem é cada relato

O token é lido **na hora do envio**, não na hora do erro — e a fila sobrevive ao logout. Sem cuidado, um erro que a Ana teve offline sairia com o token do Bruno, se ele entrasse no mesmo navegador antes de a fila drenar: o backend tira o `user_id` do token e atribuiria ao Bruno a mensagem, o contexto e a stack da Ana.

Por isso cada relato é **carimbado com uma impressão digital de mão única do token em vigor quando o erro aconteceu** (`entry.session`), e só sai com Bearer se o token do envio for **esse mesmo**:

```ts
import { createAppErrorReporter } from "tempest-react-sdk";

let currentUserId: string | null = null;

export const reporter = createAppErrorReporter({
    endpoint: "/api/app-errors",
    getToken: () => sessionStorage.getItem("access_token"),
    getPrincipal: () => currentUserId,
    foreignReports: "drop",
});

export function onLogout(): void {
    currentUserId = null;
    reporter.clear();
}
```

- **O Bearer depende só do token.** Mesmo token no erro e no envio → Bearer; qualquer outro → anônimo. Um refresh entre o erro e o envio também faz o relato sair anônimo: a atribuição se perde, **nunca** vai para a pessoa errada.
- **`getPrincipal`** — opcional. Um id **estável e não secreto** de quem está logado (o id do usuário, não o e-mail), guardado só como impressão digital (`entry.owner`). Ele **não** libera o Bearer — principal e token vêm de fontes diferentes, e um store de usuário atrasado em relação ao login mandaria o relato da Ana com o token do Bruno. Ele serve para o `"drop"` saber de quem é cada relato. Só string ou número contam como id; um getter `async` ou que lança vale "ninguém".
- **`foreignReports`** — o que fazer com relato que não pode sair com o Bearer atual:
    - `"anonymous"` (padrão) envia sem `Authorization`. A rota é pública e o erro continua útil.
    - `"drop"` descarta todo relato que **não se prova** do principal atual: de outra pessoa, de ninguém (levantado sem sessão) ou de dono desconhecido (fila antiga, ou ninguém logado agora). Para app em que o texto do erro do usuário anterior não pode sair do aparelho. **Exige `getPrincipal`**: sem ele, a única identidade é o token, que muda no refresh — então divergência não prova dono alheio, e o reporter envia anônimo em vez de apagar os relatos do próprio usuário.
- **`reporter.clear()` no logout** esvazia a fila, interrompe um `flush` em andamento antes do próximo envio e descarta relatos que ainda esperavam um `getToken` assíncrono.
- **`getToken` assíncrono tem prazo**: depois de 5 s sem resposta, o relato entra na fila sem sessão e o `flush` segue sem token — nada trava esperando.

| Relato levantado com | Enviado com | `"anonymous"` (padrão) | `"drop"` + `getPrincipal` |
| --- | --- | --- | --- |
| token da Ana | o mesmo token | Bearer da Ana | Bearer da Ana |
| token da Ana | token renovado da Ana | anônimo | anônimo |
| token da Ana | token do Bruno, ou nenhum | anônimo | descartado |
| nenhum token (antes do login) | qualquer um | anônimo | descartado |
| fila antiga, sem carimbo | qualquer um | anônimo | descartado |

!!! check "Nada de credencial em disco"
    O `localStorage` guarda o relato e carimbos como `t:3f1c…` — 64 bits de
    hash, que não viram token de volta. O token continua só onde o app o guarda.

### Com o `TelemetryProvider`

Se o app já programa contra `useTelemetry()`, o adapter liga as duas pontas:

```tsx
import type { ReactNode } from "react";
import {
    createAppErrorReporter,
    createAppErrorTelemetryAdapter,
    TelemetryProvider,
} from "tempest-react-sdk";

const reporter = createAppErrorReporter({ endpoint: "/api/app-errors" });
const adapter = createAppErrorTelemetryAdapter({ reporter });

export function AppTelemetry({ children }: { children: ReactNode }) {
    return <TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>;
}
```

| `TelemetryAdapter`           | reporter                    |
| ---------------------------- | --------------------------- |
| `captureException(err, ctx)` | `reporter.report(err, ctx)` |
| `flush()`                    | `reporter.flush()`          |
| `identify` / `track`         | nada                        |

!!! info "Por que `identify` e `track` não fazem nada"
    O backend tira o usuário do token, nunca do cliente, e a rota guarda erros,
    não eventos de produto. Precisa dos dois? Use este adapter para erros e um de
    analytics (PostHog) para eventos.

## Adapter custom

Para Datadog, Amplitude, Mixpanel — escreva ~20 linhas:

```ts
import type { TelemetryAdapter } from "tempest-react-sdk";
import { datadogRum } from "@datadog/browser-rum";

export const datadogAdapter: TelemetryAdapter = {
  init: () => datadogRum.init({ clientToken: "...", applicationId: "...", site: "datadoghq.com" }),
  identify: (user) =>
    user ? datadogRum.setUser({ id: user.id, email: user.email }) : datadogRum.clearUser(),
  track: ({ name, properties }) => datadogRum.addAction(name, properties),
  captureException: (error, context) => datadogRum.addError(error, context),
};
```

## Integração com ErrorBoundary

```tsx
const telemetry = useTelemetry();

<ErrorBoundary onError={(err, info) => telemetry?.captureException(err, info)}>
  {children}
</ErrorBoundary>;
```

## Resumo

- **Programe contra `TelemetryAdapter`**, não contra o SDK do provider — troca de provider = troca de uma linha na raiz.
- **`TelemetryProvider`** injeta o adapter; chama `init` no mount, `flush` no unmount.
- **`useTelemetry()` pode ser `null`** — sempre `telemetry?.track(...)` com optional chaining.
- **Adapters injetam a instância** (`{ sentry }`, `{ posthog }`) — nunca peer dep.
- **Adapter custom** é ~20 linhas mapeando 4 métodos.
- **`createAppErrorReporter`** leva erro do campo ao `/api/app-errors` do backend Tempest, com fila offline, dedup e respeito ao 429 — e cada relato só sai com Bearer sob o mesmo token com que foi levantado (`clear()` no logout).

### Veja também

- [Error Boundary](./error-boundary.md) — `onError` → `captureException`
- [Logger](./logger.md) — logs estruturados locais
- [Feature Flags](./feature-flags.md) — adapters seguem exatamente o mesmo padrão de injeção
