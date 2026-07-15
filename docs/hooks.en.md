# Utility hooks

Every React app rewrites the same wrappers: "debounce this input", "close the menu
on Escape", "store the theme in localStorage", "re-render when the window resizes".
They are small, but each one has a trap — listener cleanup, SSR safety, the
dependency array. The SDK packages these patterns into granular, tested,
**SSR-safe** and independent hooks — import only what you need.

!!! info "Each hook is a standalone piece"
    No hook depends on another or on a provider. `import { useDebounce } from "tempest-react-sdk"`
    and you're done — the bundler tree-shakes the rest. They are grouped by _purpose_
    in these docs, not by coupling.

## Catalogue by purpose

### DOM / viewport

| Hook                                              | What it does                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useMediaQuery(query)`                            | Subscribes to `matchMedia` and re-renders on change.                                                          |
| `useBreakpoint()`                                 | `{ current, width, above, below, isMobile, isTablet, isDesktop }` — reactive breakpoint (xs/sm/md/lg/xl/2xl). |
| `useWindowSize()`                                 | `{ width, height }` of the window, reactive.                                                                  |
| `useEventListener(name, handler, target?, opts?)` | Generic SSR-safe wrapper. `target` default = `window`. Accepts a ref or an `EventTarget` directly.            |
| `useOnline()`                                     | Reactive `navigator.onLine`.                                                                                  |
| `useDocumentVisibility()`                         | Reactive `document.visibilityState`.                                                                          |
| `useIntersectionObserver(ref, opts?)`             | `IntersectionObserverEntry` or `null`.                                                                        |
| `useResizeObserver(ref)`                          | `{ width, height }` of the reference.                                                                         |
| `useScrollLock(active)`                           | Locks `body.overflow`.                                                                                        |
| `useFocusTrap(ref, active)`                       | Confines Tab within the container.                                                                            |
| `useHover(ref)` / `useLongPress(handler, opts?)`  | Pointer gestures (reactive hover / long-press).                                                               |
| `useBeforeInstallPrompt()`                        | Deferred PWA install prompt (`installable`, `installed`, `isStandalone`, `prompt()`).                         |
| `useIdle(timeout?)`                               | True when the user is idle for `timeout` ms.                                                                  |
| `useGeolocation(opts?)`                           | Position + error + loading.                                                                                   |
| `useClickOutside(handler)`                        | Returns a ref; calls `handler` on a `mousedown`/`touchstart` outside the element. SSR-safe.                   |
| `useDocumentTitle(title)`                         | Sets `document.title` while mounted, restoring the previous one on unmount. SSR-safe.                         |
| `useFavicon(href)`                                | Swaps the favicon via `<link rel="icon">` (creating the element if missing). SSR-safe.                        |

### Input / interaction

| Hook                                            | What it does                                                   |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `useDebounce(value, delay?)`                    | Returns the value stabilized after `delay` ms without changes. |
| `useThrottle(value, interval?)`                 | Limits updates to at most one per `interval` ms.               |
| `useClipboard(opts?)`                           | `{ copied, copy, reset }` with a configurable TTL.             |
| `useKeyboardShortcut(shortcut, handler, opts?)` | Global shortcut; accepts `mod` (Ctrl/Cmd).                     |

### State

| Hook                                              | What it does                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `usePagination(initialPage?, initialSize?)`       | `{ page, size, setPage, setSize, reset }`.                                                                        |
| `useClientFilter(items, search, keysOrPredicate)` | Client-side filter by keys or predicate (memoized).                                                               |
| `useLocalStorage<T>(key, default)`                | State persisted to localStorage + synced cross-tab via the `storage` event. SSR-safe.                             |
| `useToggle(initial?)`                             | `[value, { toggle, setTrue, setFalse, set }]` — sugar for boolean state.                                          |
| `useAsync<T>(fn, deps?, { immediate? })`          | Tracks `idle/pending/success/error`. `{ status, data, error, run, reset }`. Distinct from React Query (no cache). |
| `usePrevious(value)`                              | The value from the previous render.                                                                               |
| `useDisclosure(initial?)`                         | `[opened, { open, close, toggle }]` — stable handlers for modals/drawers/popovers.                               |
| `useCounter(initial?, { min, max })`              | `[count, { increment, decrement, set, reset }]` — numeric counter with an optional clamp.                        |
| `useListState<T>(initial?)`                       | `[list, handlers]` with `append`/`prepend`/`insert`/`remove`/`reorder`/`setItem`/`setState`/`apply`/`clear`.      |
| `useMap<K, V>(initial?)`                          | `{ map, set, delete, clear, get, has, size }` — reactive `Map` (a fresh reference on each mutation).             |
| `useSet<T>(initial?)`                             | `{ set, add, delete, clear, has, toggle, size }` — reactive `Set` (a fresh reference on each mutation).          |
| `useQueue<T>({ initialValues, limit })`           | `{ queue, add, update, cleanQueue, size }` — FIFO queue with a `limit` and an overflow buffer.                   |
| `useIsFirstRender()`                              | `true` on the component's first render, `false` after.                                                           |
| `useObjectUrl(blob)`                              | Creates `URL.createObjectURL(blob)` and revokes it on unmount / when the blob changes; `null` for nullish input.  |

### Timers

| Hook                           | What it does                                      |
| ------------------------------ | ------------------------------------------------- |
| `useInterval(callback, delay)` | Declarative `setInterval`; `delay = null` pauses. |
| `useTimeout(callback, delay)`  | Declarative `setTimeout`; `delay = null` cancels. |

### Performance

| Hook                    | What it does                                |
| ----------------------- | ------------------------------------------- |
| `useStableCallback(fn)` | Stable ref that calls the current callback. |
| `useDeepMemo(value)`    | Memoization with structural equality.       |

!!! tip "SSR-safe by default"
    The hooks that touch browser APIs (`useMediaQuery`, `useBreakpoint`,
    `useWindowSize`, `useOnline`, `useDocumentVisibility`, `useLocalStorage`,
    `useEventListener`) check `typeof window === "undefined"` and return a safe
    default on the server, hydrating the real value **after mount**. That is why the
    first client render may briefly show the default (e.g. `width: 0`).

## Examples

### Offline-aware badge

```tsx
import { useOnline, Badge } from "tempest-react-sdk";

function NetworkPill() {
  const online = useOnline();
  return <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>;
}
```

### Global shortcut — `useKeyboardShortcut`

```tsx
import { useState } from "react";
import { useKeyboardShortcut } from "tempest-react-sdk";

function CommandPalette() {
  const [open, setOpen] = useState(false);
  useKeyboardShortcut({ key: "k", mod: true }, () => setOpen(true));
  return open ? <div role="dialog">Command palette…</div> : null;
}
```

`mod: true` accepts Ctrl or Cmd, simplifying cross-OS.

!!! note "Doesn't fire inside inputs"
    By default (`ignoreInput: true`) the shortcut is ignored when focus is in an
    `<input>`, `<textarea>`, `<select>` or `[contenteditable]` — so it doesn't steal
    the "k" the user is typing. Pass `{ ignoreInput: false }` if you want the
    opposite.

### Debounced search — `useDebounce`

```tsx
import { useEffect, useState } from "react";
import { useDebounce } from "tempest-react-sdk";

function SearchBox() {
  const [text, setText] = useState("");
  const debounced = useDebounce(text, 400);

  useEffect(() => {
    if (debounced) fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
  }, [debounced]);

  return <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search…" />;
}
```

`useDebounce` defers the _value_; the `useEffect` only fires once it stabilizes.

### Lazy load via IntersectionObserver

```tsx
import { useRef } from "react";
import { useIntersectionObserver } from "tempest-react-sdk";

function LazyChart() {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useIntersectionObserver(ref, { once: true });
  return <div ref={ref}>{entry?.isIntersecting && <HeavyChart />}</div>;
}
```

### Copy-to-clipboard with feedback — `useClipboard`

```tsx
import { useClipboard, Button } from "tempest-react-sdk";

function CopyButton() {
  const { copied, copy } = useClipboard({ resetAfter: 2000 });
  return (
    <Button onClick={() => copy("npm install tempest-react-sdk")}>
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}
```

### Responsive — `useBreakpoint`

```tsx
import { useBreakpoint } from "tempest-react-sdk";

function Hero() {
  const bp = useBreakpoint();
  return <h1 style={{ fontSize: bp.isMobile ? 24 : 48 }}>Welcome</h1>;
}
```

`bp.above("lg")` / `bp.below("md")` cover arbitrary comparisons beyond the
`isMobile` / `isTablet` / `isDesktop` shortcuts.

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

!!! warning "The `key` must be stable and unique"
    `useLocalStorage` uses the `key` as an internal dependency. Don't build it inline
    with changing values (`` `user-${id}` `` changes every time `id` changes and
    swaps the storage slot). And since the key is global per domain, pick a prefixed
    name so it doesn't collide with another feature.

### Async — `useAsync`

```tsx
import { useAsync, Spinner, ErrorState, UserCard } from "tempest-react-sdk";

function UserPanel({ id }: { id: string }) {
  const { status, data, error, run } = useAsync(
    () => fetch(`/api/users/${id}`).then((r) => r.json()),
    [id],
    { immediate: true },
  );

  if (status === "pending") return <Spinner />;
  if (status === "error") return <ErrorState description={String(error)} onRetry={run} />;
  return <UserCard user={data} />;
}
```

!!! tip "useAsync vs React Query"
    `useAsync` is the one-shot primitive — no cache, no extra dependencies — ideal
    for point actions (submit, "load more"). For server data with caching, dedup and
    revalidation, use [React Query](./query.md). `useAsync` discards results from
    stale runs, so changing `id` quickly never causes a race.

### Global listener — `useEventListener`

```tsx
import { useState } from "react";
import { useEventListener } from "tempest-react-sdk";

function ScrollWatcher() {
  const [scrolled, setScrolled] = useState(false);
  useEventListener("scroll", () => setScrolled(window.scrollY > 100), undefined, {
    passive: true,
  });
  return <header data-scrolled={scrolled}>…</header>;
}
```

### Focus trap in a custom Modal

```tsx
import { useRef } from "react";
import { useFocusTrap, useScrollLock } from "tempest-react-sdk";

function CustomModal({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useScrollLock(open);
  return open ? (
    <div ref={ref} role="dialog" aria-modal="true">
      …
    </div>
  ) : null;
}
```

!!! note "Focus-trap accessibility"
    `useFocusTrap` confines Tab inside the container, but it does not replace the rest
    of the dialog contract: set `role="dialog"` + `aria-modal="true"`, return focus to
    the trigger on close, and handle Escape. The SDK's `Modal` component already does
    all of this — only reach for this hook in hand-rolled overlays.

### Toggle — `useToggle`

```tsx
import { useToggle } from "tempest-react-sdk";

function Disclosure() {
  const [open, { toggle, setTrue }] = useToggle(false);
  return (
    <>
      <button onClick={toggle}>{open ? "Close" : "Open"}</button>
      <button onClick={setTrue}>Force open</button>
      {open && <p>Content</p>}
    </>
  );
}
```

!!! warning "The second element is an object, not loose functions"
    `useToggle` returns `[value, { toggle, setTrue, setFalse, set }]`. Destructure the
    object (`const [on, { toggle }] = useToggle()`) — not `const [on, toggle] = ...`,
    which would put the whole object in `toggle`.

### Performance — `useStableCallback`

```tsx
import { useEffect } from "react";
import { useStableCallback } from "tempest-react-sdk";

function Tracker({ onSelect }: { onSelect: (id: string) => void }) {
  const stable = useStableCallback(onSelect);
  // `stable` has a constant ref; the effect doesn't re-fire when onSelect changes.
  useEffect(() => bindSomething(stable), [stable]);
  return null;
}
```

!!! tip "Mind the dependency array"
    Pass `useStableCallback` to effects/listeners you **don't** want to re-run when
    the callback's identity changes. Derived values (`useDebounce`, `useAsync` with
    `deps`) should still go into the deps normally — omitting them causes stale-value
    bugs. Rule of thumb: trust `eslint-plugin-react-hooks`.

### Disclosure — `useDisclosure`

```tsx
import { useDisclosure, Modal, Button } from "tempest-react-sdk";

function EditPanel() {
  const [opened, { open, close }] = useDisclosure(false);
  return (
    <>
      <Button onClick={open}>Edit</Button>
      <Modal open={opened} onClose={close} title="Edit profile">
        …
      </Modal>
    </>
  );
}
```

The handlers (`open`/`close`/`toggle`) are referentially stable across renders — unlike `useToggle`, it's the right sugar for overlays.

### Clamped counter — `useCounter`

```tsx
import { useCounter, Button } from "tempest-react-sdk";

function Quantity() {
  const [count, { increment, decrement, reset }] = useCounter(1, { min: 1, max: 10 });
  return (
    <>
      <Button onClick={decrement}>−</Button>
      <span>{count}</span>
      <Button onClick={increment}>+</Button>
      <Button onClick={reset}>Reset</Button>
    </>
  );
}
```

`useCounter(initial, { min, max })` clamps the value — `increment`/`decrement`/`set` respect the bounds.

### List as state — `useListState`

```tsx
import { useListState, Button } from "tempest-react-sdk";

function TodoList() {
  const [items, handlers] = useListState<string>(["Buy bread"]);
  return (
    <>
      <Button onClick={() => handlers.append("New item")}>Add</Button>
      <ul>
        {items.map((item, i) => (
          <li key={i} onClick={() => handlers.remove(i)}>
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
```

Immutable handlers: `append`/`prepend`/`insert`/`remove`/`reorder`/`setItem`/`setState`/`apply`/`clear`. Use `handlers.reorder({ from, to })` for drag-and-drop.

### Reactive Map and Set — `useMap` / `useSet`

```tsx
import { useMap, useSet } from "tempest-react-sdk";

function SelectionTracker() {
  const selected = useSet<string>();
  const meta = useMap<string, number>();

  return (
    <button
      onClick={() => {
        selected.toggle("a");
        meta.set("clicks", (meta.get("clicks") ?? 0) + 1);
      }}
    >
      {selected.size} selected · {meta.get("clicks") ?? 0} clicks
    </button>
  );
}
```

`useMap` returns `{ map, set, delete, clear, get, has, size }` and `useSet` returns `{ set, add, delete, clear, has, toggle, size }` — each mutation yields a fresh reference and re-renders.

### FIFO queue — `useQueue`

```tsx
import { useQueue, Button } from "tempest-react-sdk";

function Notifications() {
  const { queue, add, cleanQueue, size } = useQueue<string>({ limit: 3 });
  return (
    <>
      <Button onClick={() => add(`msg ${Date.now()}`)}>Enqueue</Button>
      <Button onClick={cleanQueue}>Clear visible ({size})</Button>
      <ul>
        {queue.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </>
  );
}
```

`useQueue({ initialValues, limit })` keeps up to `limit` items visible in `queue`; the surplus sits in a buffer and surfaces as `cleanQueue` frees space.

### Close on outside click — `useClickOutside`

```tsx
import { useState } from "react";
import { useClickOutside } from "tempest-react-sdk";

function Menu() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return open ? (
    <div ref={ref} role="menu">
      …
    </div>
  ) : null;
}
```

`useClickOutside(handler)` returns a ref; the `handler` fires on a `mousedown`/`touchstart` outside the element.

### Title and favicon — `useDocumentTitle` / `useFavicon`

```tsx
import { useDocumentTitle, useFavicon } from "tempest-react-sdk";

function InboxPage({ unread }: { unread: number }) {
  useDocumentTitle(unread > 0 ? `(${unread}) Inbox` : "Inbox");
  useFavicon(unread > 0 ? "/favicon-alert.ico" : "/favicon.ico");
  return <main>…</main>;
}
```

Both are SSR-safe; `useDocumentTitle` restores the previous title on unmount.

### First render — `useIsFirstRender`

```tsx
import { useEffect } from "react";
import { useIsFirstRender } from "tempest-react-sdk";

function Analytics({ query }: { query: string }) {
  const first = useIsFirstRender();
  useEffect(() => {
    if (!first) track("search-refined", { query });
  }, [query, first]);
  return null;
}
```

Returns `true` only on the first render — handy to skip mount-time effects.

## Recap

- Granular, independent, tree-shakeable hooks — import only what you use.
- The browser-facing ones are **SSR-safe**: they return a default on the server and hydrate after mount.
- `useToggle` returns `[value, { toggle, setTrue, setFalse, set }]` — the second item is an object.
- `useDisclosure`/`useCounter`/`useListState` return a `[state, handlers]` tuple; `useMap`/`useSet`/`useQueue` return a single object.
- `useAsync` is the cache-less primitive; for server data with caching use React Query.
- Watch the dependency arrays: `useStableCallback` to avoid re-runs, explicit deps everywhere else.

## See also

- [Components](./components.md) — `<Show>` / `<Hide>` use `useBreakpoint` under the hood
- [Theme](./theme.md) — `useMediaQuery` for programmatic responsiveness
- [Query](./query.md) — React Query when you need server cache
- [Forms](./forms.md) — `useDebounce` on search fields, `useAsync` on submit
