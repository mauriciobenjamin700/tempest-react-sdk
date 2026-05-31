# Error Boundary

Catches render errors. It does not cover async errors — for those, use
`useErrorHandler` (it re-throws into the nearest boundary).

## Typical usage

```tsx
import { ErrorBoundary, ErrorState } from "tempest-react-sdk";
import { useLocation } from "react-router-dom";

const location = useLocation();

<ErrorBoundary
  resetKeys={[location.pathname]}
  onError={(err, info) => reportToSentry(err, info)}
  fallback={({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />}
>
  {children}
</ErrorBoundary>;
```

`resetKeys` resets the boundary whenever any value changes. Useful to "clear" the
error on navigation.

## Async errors

```tsx
import { useErrorHandler } from "tempest-react-sdk";

const throwError = useErrorHandler();
useEffect(() => {
  socket.on("error", throwError);
}, [throwError]);
```

`throwError(err)` re-throws via `setState` — forcing React to propagate it to the
boundary above.

## Where to place it

- A **global** boundary in the app shell, with a generic fallback.
- **Local** boundaries around optional widgets (side feed, charts) so errors do not take down the whole screen.

## See also

- [Components — ErrorState](./components.md)
