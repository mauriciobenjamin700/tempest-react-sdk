# Error Boundary

`ErrorBoundary` catches errors thrown during the render of any descendant and shows a fallback instead of a blank screen. `useErrorHandler` extends that to asynchronous errors, which React does not catch on its own.

!!! info "Why this matters"
    Without a boundary, a render error in any component unmounts the whole tree — the user sees a blank page. A boundary isolates the failure: the broken branch turns into a friendly fallback (with a retry button) and the rest of the app stays up.

## Typical usage

`fallback` accepts a static node or a render-prop receiving `{ error, reset }`. The render-prop is the recommended path — you show the message and offer a retry button that clears the boundary:

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
        <ErrorState title="Something went wrong" description={error.message} onRetry={reset} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

declare function reportToSentry(error: Error, info: React.ErrorInfo): void;
```

The three props that matter:

- `fallback`: a static node **or** `({ error, reset }) => ReactNode`. `error` is the captured `Error`; `reset()` clears the state and re-renders the children.
- `onError(error, info)`: called from `componentDidCatch`. Forward it to your tracker (Sentry, Datadog, console). `info.componentStack` shows where it blew up.
- `resetKeys`: an array watched with `Object.is` equality. When **any** value changes, the boundary resets itself.

!!! tip "`resetKeys` clears the error on navigation"
    By passing `resetKeys={[location.pathname]}`, the boundary recovers automatically when the user changes route — without it, the fallback would stay stuck on screen until a manual `reset()`.

## Asynchronous errors

Boundaries only catch errors thrown **during render**. Failures in callbacks, timers, websockets or promises happen outside render, so React never sees them. `useErrorHandler` fixes this: it re-throws the error inside a `setState`, forcing a render pass that the boundary above intercepts.

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

!!! note "Accepts any value"
    `throwError` takes `unknown` and normalizes it to `Error`: if you pass something that is not an `Error` (a string, an object), it wraps it in `new Error(String(value))` before propagating.

## How AppProviders mounts the boundary

`AppProviders` already places the `ErrorBoundary` as **the outermost layer** (above Query, Theme and i18n), so an error from any provider or from the UI itself lands in the fallback. It is opt-in: the boundary only mounts if you pass `errorBoundary` with a `fallback`.

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

The internal order is `ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider`, i.e. the global boundary wraps everything.

## Where to place boundaries

- **One global** boundary in the app shell (via `AppProviders` or manually), with a generic fallback — the safety net.
- **Local** boundaries around optional widgets (side feed, charts, embeds) so an isolated error does not take down the whole screen. Each local boundary can have its own `fallback` and `resetKeys`.

## Recap

- `ErrorBoundary` catches **render** errors; `fallback` is a static node or a `({ error, reset })` render-prop.
- `onError(error, info)` forwards to telemetry; `info.componentStack` locates the failure.
- `resetKeys` resets the boundary when any value (by `Object.is`) changes — great with `location.pathname`.
- `useErrorHandler()` covers **async** errors by re-throwing into render; it accepts `unknown` and normalizes to `Error`.
- `AppProviders` mounts the boundary as the outermost layer when you pass `errorBoundary={{ fallback }}`.
- Combine a global boundary with local boundaries around optional widgets.

## See also

- [Components — ErrorState](./components.md) — a ready-made fallback with retry
- [App Providers](./app-providers.md) — where the global boundary is mounted
- [Logger](./logger.md) / [Telemetry](./telemetry.md) — destinations for `onError`
