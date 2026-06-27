# Error Boundary

`ErrorBoundary` captura erros lançados durante o render de qualquer descendente e mostra um fallback no lugar de uma tela branca. `useErrorHandler` estende isso para erros assíncronos, que o React não captura sozinho.

!!! info "Por que isso importa"
    Sem um boundary, um erro de render em qualquer componente desmonta a árvore inteira — o usuário vê uma página em branco. Um boundary isola a falha: o ramo quebrado vira um fallback amigável (com botão de tentar de novo) e o resto do app continua de pé.

## Uso típico

`fallback` aceita um nó estático ou uma render-prop que recebe `{ error, reset }`. A render-prop é o caminho recomendado — você mostra a mensagem e oferece um botão de retry que limpa o boundary:

```tsx
import { useEffect } from "react";
import { ErrorBoundary, ErrorState } from "tempest-react-sdk";
import { useLocation } from "react-router-dom";

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <ErrorBoundary
      resetKeys={[location.pathname]}
      onError={(error, info) => reportToSentry(error, info)}
      fallback={({ error, reset }) => (
        <ErrorState title="Algo deu errado" description={error.message} onRetry={reset} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

declare function reportToSentry(error: Error, info: React.ErrorInfo): void;
```

As três props que importam:

- `fallback`: nó estático **ou** `({ error, reset }) => ReactNode`. `error` é o `Error` capturado; `reset()` limpa o estado e re-renderiza os filhos.
- `onError(error, info)`: chamado no `componentDidCatch`. Encaminhe para seu rastreador (Sentry, Datadog, console). `info.componentStack` mostra onde estourou.
- `resetKeys`: array observado por igualdade `Object.is`. Quando **qualquer** valor muda, o boundary reseta sozinho.

!!! tip "`resetKeys` limpa o erro ao navegar"
    Passando `resetKeys={[location.pathname]}`, o boundary se recupera automaticamente quando o usuário troca de rota — sem isso, o fallback ficaria preso na tela até um `reset()` manual.

## Erros assíncronos

Boundaries só capturam erros lançados **durante o render**. Falhas em callbacks, timers, websockets ou promises acontecem fora do render, então o React não as vê. `useErrorHandler` resolve isso: ele re-lança o erro dentro de um `setState`, forçando uma passada de render que o boundary acima intercepta.

```tsx
import { useEffect } from "react";
import { useErrorHandler } from "tempest-react-sdk";

export function LiveFeed({ socket }: { socket: WebSocket }) {
  const throwError = useErrorHandler();

  useEffect(() => {
    const onError = (event: Event) => throwError(event);
    socket.addEventListener("error", onError);
    return () => socket.removeEventListener("error", onError);
  }, [socket, throwError]);

  return <Feed />;
}
```

!!! note "Aceita qualquer valor"
    `throwError` recebe `unknown` e normaliza para `Error`: se você passar algo que não é `Error` (uma string, um objeto), ele embrulha em `new Error(String(value))` antes de propagar.

## Como o AppProviders monta o boundary

`AppProviders` já posiciona o `ErrorBoundary` como **a camada mais externa** (acima de Query, Theme e i18n), de modo que um erro de qualquer provider ou da própria UI cai no fallback. Ele é opt-in: o boundary só monta se você passar `errorBoundary` com um `fallback`.

```tsx
import { AppProviders, ErrorState } from "tempest-react-sdk";

<AppProviders
  errorBoundary={{
    fallback: ({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />,
    onError: (error, info) => reportToSentry(error, info),
  }}
  i18n={{ locale: "pt-BR", messages }}
>
  <App />
</AppProviders>;
```

A ordem interna é `ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider`, ou seja, o boundary global cobre tudo.

## Onde colocar boundaries

- **Um global** no shell do app (via `AppProviders` ou manual), com fallback genérico — a rede de segurança.
- **Locais** ao redor de widgets opcionais (feed lateral, gráficos, embeds) para que um erro isolado não derrube a tela inteira. Cada boundary local pode ter seu próprio `fallback` e `resetKeys`.

## Recap

- `ErrorBoundary` captura erros de **render**; `fallback` é nó estático ou render-prop `({ error, reset })`.
- `onError(error, info)` encaminha para telemetria; `info.componentStack` localiza a falha.
- `resetKeys` reseta o boundary quando qualquer valor (por `Object.is`) muda — ótimo com `location.pathname`.
- `useErrorHandler()` cobre erros **assíncronos** re-lançando no render; aceita `unknown` e normaliza para `Error`.
- `AppProviders` monta o boundary como camada mais externa quando você passa `errorBoundary={{ fallback }}`.
- Combine um boundary global com boundaries locais ao redor de widgets opcionais.

## Veja também

- [Componentes — ErrorState](./components.md) — fallback pronto com retry
- [App Providers](./app-providers.md) — onde o boundary global é montado
- [Logger](./logger.md) / [Telemetry](./telemetry.md) — destinos para o `onError`
