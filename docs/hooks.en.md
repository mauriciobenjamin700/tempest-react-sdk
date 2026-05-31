# Utility hooks

A set of granular hooks to avoid rewriting DOM-API wrappers in every app. Each
hook is independent — import only what you need.

## List

### DOM / viewport

| Hook                                              | What it does                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useDebounce(value, delay?)`                      | Returns the value stabilized after `delay` ms without changes.                                                |
| `useMediaQuery(query)`                            | Subscribes to `matchMedia` and re-renders on change.                                                          |
| `useBreakpoint()`                                 | `{ current, width, above, below, isMobile, isTablet, isDesktop }` — reactive breakpoint (xs/sm/md/lg/xl/2xl). |
| `useEventListener(name, handler, target?, opts?)` | Generic SSR-safe wrapper. `target` default = `window`. Accepts a ref or an `EventTarget` directly.            |
| `useOnline()`                                     | Reactive `navigator.onLine`.                                                                                  |
| `useDocumentVisibility()`                         | Reactive `document.visibilityState`.                                                                          |
| `useIntersectionObserver(ref, opts?)`             | `IntersectionObserverEntry` or `null`.                                                                        |
| `useResizeObserver(ref)`                          | `{ width, height }` of the reference.                                                                         |
| `useScrollLock(active)`                           | Locks `body.overflow`.                                                                                        |
| `useFocusTrap(ref, active)`                       | Confines Tab within the container.                                                                            |
| `useBeforeInstallPrompt()`                        | Deferred PWA install prompt.                                                                                  |
| `useIdle(timeout?)`                               | True when the user is idle for `timeout` ms.                                                                  |
| `useGeolocation(opts?)`                           | Position + error + loading.                                                                                   |

### State

| Hook                                              | What it does                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `usePagination(initialPage?, initialSize?)`       | `{ page, size, setPage, setSize, reset }`.                                                                        |
| `useClientFilter(items, search, keysOrPredicate)` | Client-side filter by keys or predicate.                                                                          |
| `useClipboard(opts?)`                             | `{ copied, copy, reset }` with a configurable TTL.                                                                |
| `useKeyboardShortcut(shortcut, handler, opts?)`   | Global shortcut; accepts `mod` (Ctrl/Cmd).                                                                        |
| `useLocalStorage<T>(key, default)`                | State persisted to localStorage + synced cross-tab via the `storage` event. SSR-safe.                             |
| `useToggle(initial?)`                             | `[on, toggle, set]` — sugar for boolean state.                                                                    |
| `useAsync<T>(fn, deps?, { immediate? })`          | Tracks `idle/pending/success/error`. `{ status, data, error, run, reset }`. Distinct from React Query (no cache). |
| `useStableCallback(fn)`                           | Stable ref that calls the current callback.                                                                       |
| `useDeepMemo(value)`                              | Memoization with structural equality.                                                                             |

## Examples

### Offline-aware badge

```tsx
import { useOnline, Badge } from "tempest-react-sdk";

function NetworkPill() {
  const online = useOnline();
  return <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>;
}
```

### Global shortcut

```tsx
import { useKeyboardShortcut } from "tempest-react-sdk";

useKeyboardShortcut({ key: "k", mod: true }, () => openCommandPalette());
```

`mod: true` accepts Ctrl or Cmd, simplifying cross-OS.

### Lazy load via IntersectionObserver

```tsx
const ref = useRef<HTMLDivElement>(null);
const entry = useIntersectionObserver(ref, { once: true });

return <div ref={ref}>{entry?.isIntersecting && <HeavyChart />}</div>;
```

### Copy-to-clipboard with feedback

```tsx
const { copied, copy } = useClipboard();

<Button onClick={() => copy("npm install tempest-react-sdk")}>
  {copied ? "Copied!" : "Copy"}
</Button>;
```

### Responsive — `useBreakpoint`

```tsx
import { useBreakpoint } from "tempest-react-sdk";

function Hero() {
  const bp = useBreakpoint();
  return <h1 style={{ fontSize: bp.isMobile ? 24 : 48 }}>...</h1>;
}
```

### Persisted state — `useLocalStorage`

```tsx
import { useLocalStorage } from "tempest-react-sdk";

function ThemeToggle() {
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light");
  return <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme}</button>;
}
```

Multi-tab: other tabs receive the update through an internal
`window.addEventListener("storage", ...)`.

### Async — `useAsync`

```tsx
import { useAsync, Spinner, ErrorState } from "tempest-react-sdk";

const { status, data, error, run } = useAsync(() => api.get<User>(`/users/${id}`), [id], {
  immediate: true,
});

if (status === "pending") return <Spinner />;
if (status === "error") return <ErrorState description={String(error)} onRetry={run} />;
return <UserCard user={data!} />;
```

### Global listener — `useEventListener`

```tsx
import { useEventListener } from "tempest-react-sdk";

useEventListener("scroll", () => setScrolled(window.scrollY > 100), undefined, { passive: true });

// On a ref:
const ref = useRef<HTMLDivElement>(null);
useEventListener("click", handleClick, ref);
```

### Focus trap in a custom Modal

```tsx
const ref = useRef<HTMLDivElement>(null);
useFocusTrap(ref, open);
useScrollLock(open);
```

### Performance — `useStableCallback`

```tsx
const onSelect = useStableCallback((row) => trackClick(row.id));
// onSelect ref is stable; the effect doesn't fire unnecessarily
useEffect(() => bind(onSelect), [onSelect]);
```

### Toggle — `useToggle`

```tsx
const [open, toggle, set] = useToggle(false);

<button onClick={toggle}>{open ? "Close" : "Open"}</button>;
<button onClick={() => set(true)}>Force open</button>;
```

## See also

- [Components](./components.md) — `<Show>` / `<Hide>` use `useBreakpoint` under the hood
- [Theme](./theme.md) — `useMediaQuery` for programmatic responsiveness
