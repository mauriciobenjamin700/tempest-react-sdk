# Error Boundary

Captura erros de render. Não cobre erros async — pra esses, use `useErrorHandler` (re-lança no boundary mais próximo).

## Uso típico

```tsx
import { ErrorBoundary, ErrorState } from "tempest-react-sdk";
import { useLocation } from "react-router-dom";

const location = useLocation();

<ErrorBoundary
    resetKeys={[location.pathname]}
    onError={(err, info) => reportToSentry(err, info)}
    fallback={({ error, reset }) => (
        <ErrorState description={error.message} onRetry={reset} />
    )}
>
    {children}
</ErrorBoundary>;
```

`resetKeys` reseta o boundary quando qualquer valor muda. Útil pra "limpar" o erro ao navegar.

## Erros async

```tsx
import { useErrorHandler } from "tempest-react-sdk";

const throwError = useErrorHandler();
useEffect(() => {
    socket.on("error", throwError);
}, [throwError]);
```

`throwError(err)` re-lança via `setState` — força o React a propagar pro boundary acima.

## Onde colocar

- Um boundary **global** no shell do app, fallback genérico.
- Boundaries **locais** ao redor de widgets opcionais (feed lateral, gráficos) pra erros não derrubarem a tela toda.

## Veja também

- [Componentes — ErrorState](./components.md)
