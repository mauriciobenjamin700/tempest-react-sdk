# Utility hooks

Every React app rewrites the same wrappers: "debounce this input", "close the menu
on Escape", "store the theme in localStorage", "re-render when the window resizes".
They are small, but each one has a trap — listener cleanup, running without `window`, the
dependency array. The SDK packages these patterns into granular, tested,
browser-guarded and independent hooks — import only what you need.

!!! info "Each hook is a standalone piece"
    No hook depends on another or on a provider. `import { useDebounce } from "tempest-react-sdk"`
    and you're done — the bundler tree-shakes the rest. They are grouped by _purpose_
    in these docs, not by coupling.

!!! note "Browser-guarded is not SSR support"
    Several hooks below guard on `typeof window === "undefined"` and return a
    default instead of throwing. That exists for Node tests, the service-worker
    context and build plugins — it is **not** a promise of server rendering. The
    SDK is client-only by decision (see
    [Architecture](./architecture.en.md#scope-client-side-only)).

## Catalogue by purpose

### DOM / viewport

| Hook                                              | What it does                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useMediaQuery(query)`                            | Subscribes to `matchMedia` and re-renders on change.                                                          |
| `useBreakpoint()`                                 | `{ current, width, above, below, isMobile, isTablet, isDesktop }` — reactive breakpoint (xs/sm/md/lg/xl/2xl). |
| `useWindowSize()`                                 | `{ width, height }` of the window, reactive.                                                                  |
| `useEventListener(name, handler, target?, opts?)` | Generic browser-guarded wrapper. `target` default = `window`. Accepts a ref or an `EventTarget` directly.            |
| `useOnline(opts?)`                                | Reactive `navigator.onLine`; `{ pingUrl, intervalMs, timeoutMs }` adds a real-reachability probe (catches captive portals / dead links). |
| `useDocumentVisibility()`                         | Reactive `document.visibilityState`.                                                                          |
| `useIntersectionObserver(ref, opts?)`             | `IntersectionObserverEntry` or `null`.                                                                        |
| `useResizeObserver(ref)`                          | `{ width, height }` of the reference.                                                                         |
| `useScrollOverflow(ref, axis?)`                    | `true` while the content overflows its box — use it to give a scroll container a tab stop only when there is something to scroll. |
| `useScrollLock(active)`                           | Locks `body.overflow`.                                                                                        |
| `useFocusTrap(ref, active)`                       | Confines Tab within the container.                                                                            |
| `useHover(ref)` / `useLongPress(handler, opts?)`  | Pointer gestures (reactive hover / long-press).                                                               |
| `useBeforeInstallPrompt()`                        | Deferred PWA install prompt (`installable`, `installed`, `isStandalone`, `prompt()`).                         |
| `useServiceWorkerUpdate({ url })`                 | Registers the SW and exposes `{ updateAvailable, applyUpdate, registration }` — consent-based update flow (pairs with `<UpdatePrompt>`). See [PWA](./pwa.md). |
| `useStorageEstimate({ pollMs? })`                 | `{ usage, quota, ratio, persisted, requestPersist, refresh }` — Storage API quota + `persist()`. Pure pairs: `estimateStorage`, `requestPersistentStorage`. |
| `useIdle(timeout?)`                               | True when the user is idle for `timeout` ms.                                                                  |
| `useGeolocation(opts?)`                           | Position + error + loading.                                                                                   |
| `useClickOutside(handler)`                        | Returns a ref; calls `handler` on a `mousedown`/`touchstart` outside the element. browser-guarded.                   |
| `useDocumentTitle(title)`                         | Sets `document.title` while mounted, restoring the previous one on unmount. browser-guarded.                         |
| `useFavicon(href)`                                | Swaps the favicon via `<link rel="icon">` (creating the element if missing). browser-guarded.                        |
| `useAnnounce()`                                   | Returns `announce(message, politeness?)` — speaks to screen readers through one shared live region. Pure pairs: `announce`, `clearAnnouncer`. |

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
| `useLocalStorage<T>(key, default)`                | State persisted to localStorage + synced cross-tab via the `storage` event. browser-guarded.                             |
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

!!! tip "browser-guarded by default"
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

### Speaking to a screen reader — `useAnnounce`

Something happened that a sighted user can see and a screen reader user cannot: a
filter narrowed a list, a row saved, a copy succeeded. `useAnnounce` returns a stable
function that says so.

```tsx
import { useAnnounce, useClientFilter } from "tempest-react-sdk";
import { useEffect, useState } from "react";

export function FilteredList({ items }: { items: string[] }) {
  const [term, setTerm] = useState("");
  const visible = useClientFilter(items, term, (item, q) => item.includes(q));
  const announce = useAnnounce();

  useEffect(() => {
    announce(`${visible.length} results`);
  }, [visible.length, announce]);

  return (
    <>
      <input value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search" />
      <ul>{visible.map((item) => <li key={item}>{item}</li>)}</ul>
    </>
  );
}
```

`announce(message)` is polite by default; `announce(message, "assertive")` interrupts
whatever is being read — keep it for an error that demands action.

!!! info "Two regions, one polite and one assertive — on purpose"
    Politeness is a property of **the region**, read when the assistive technology
    registers it. Flipping `aria-live` later is honoured by some screen readers,
    ignored by others, and sometimes drops the announcement. Two regions that never
    change are the only version that behaves the same everywhere. And they are
    **shared**: several live regions mutating at once is how announcements get lost or
    doubled.

!!! warning "The same string twice usually announces nothing"
    A screen reader announces when the **content changes** — writing the same text
    again is not a change, so "Item removed" twice in a row is read once. Instead of
    mutating text, every call replaces the region's **child element**: the mutation is
    real even for an identical string, and the reader hears exactly your message with
    no padding character bolted on.

!!! danger "Never wrap streaming text in a live region"
    A live region over text that grows token by token makes the reader start the whole
    answer again on every token. Announce the **edges** — "generating response",
    "response complete" — and leave the transcript in a plain `role="log"` the user
    reads at their own pace. That is what `AIChat` does.

And what **not** to send to the announcer: content already on screen inside a region
with a role — a `SyncStatusBadge` (`role="status"`), a toast, a field error tied to its
input. Announcing those again reads them twice.

Outside React, `announce(message, politeness?)` is the same function and creates the
region on first use. `clearAnnouncer()` removes the regions — useful for test teardown
and for a micro-frontend leaving a page it does not own.

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

Both are browser-guarded; `useDocumentTitle` restores the previous title on unmount.

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

## PWA & pointer gestures

### Install prompt with fallback — `useInstallPrompt`

`useBeforeInstallPrompt` (above) only captures the Chromium `beforeinstallprompt` event. But half of your users are on iOS Safari (which never fires it) or on an Android Chromium fork that stripped the API. `useInstallPrompt` resolves **which strategy** to offer, in a single `method`:

```tsx
import { useInstallPrompt } from "tempest-react-sdk";

function InstallButton() {
  const { method, install, openInChromeIntent } = useInstallPrompt();

  if (method === "native")
    return <button onClick={install}>Install app</button>;
  if (method === "ios")
    return <p>Tap Share → Add to Home Screen</p>;
  if (method === "manual")
    return openInChromeIntent ? (
      <a href={openInChromeIntent}>Open in Chrome to install</a>
    ) : (
      <p>Use the browser menu → Install app</p>
    );
  return null; // "none" — already installed or unsupported runtime
}
```

`method` resolves like this:

- `"native"` → the `beforeinstallprompt` event arrived; call `install()` to trigger the native prompt.
- `"ios"` → iOS/iPadOS Safari; show the "Add to Home Screen" instructions.
- `"manual"` → a Chromium fork without the API, **or** no event arrived within `manualFallbackDelayMs` (3s by default); show generic browser-menu instructions.
- `"none"` → already running as an installed PWA (standalone display mode) or the decline cooldown is active.

When the user declines, the hook stores a timestamp in `localStorage` and hides the CTA for `declineCooldownMs` (7 days by default). It's all pluggable and browser-guarded:

| Option                  | Default                         | What it does                                          |
| ----------------------- | ------------------------------- | ----------------------------------------------------- |
| `declineStorageKey`     | `"tempest:install-declined-at"` | `localStorage` key for the decline timestamp.         |
| `declineCooldownMs`     | `604800000` (7 days)            | How long the CTA stays hidden after a decline.        |
| `manualFallbackDelayMs` | `3000`                          | How long to wait for `beforeinstallprompt` before falling back to `"manual"`. |

!!! info "Environment helpers exported separately"
    The pure functions behind the hook are exported too — useful on their own: `isIOS()`, `isAndroid()`, `isAndroidWithoutPromptApi()` (Mi/UC/Opera Mini/Huawei/KaiOS), `isStandalone()`, and `buildOpenInChromeIntent()` (builds an `intent://` URL that reopens the page in Android Chrome, with a Play Store fallback). The `BeforeInstallPromptEvent` type ships from the SDK as well.

### Long-press that returns handlers — `useLongPressHandlers`

`useLongPress(ref, fn)` (in the **DOM / viewport** table above) attaches pointer listeners to a `ref`. When you'd rather **spread handlers** onto an element and also suppress the click that follows a long-press, use `useLongPressHandlers`:

```tsx
import { useLongPressHandlers } from "tempest-react-sdk";

function AnimalCard({ id }: { id: string }) {
  const longPress = useLongPressHandlers(() => enterSelectionMode(id), {
    delayMs: 500,
  });

  return (
    <button
      {...longPress}
      onClick={() => {
        if (longPress.wasLongPress()) return; // guard the post-hold click
        openDetails(id);
      }}
    >
      Animal {id}
    </button>
  );
}

declare function enterSelectionMode(id: string): void;
declare function openDetails(id: string): void;
```

It fires `onLongPress` once after `delayMs` (mouse or touch), cancels on release/move, and wires `contextmenu` so a desktop right-click opens selection mode just like an Android long-press. `wasLongPress()` reports whether the last interaction was a long-press — use it in `onClick` to avoid navigating twice. Pass `{ disabled: true }` to make the handlers inert.

### Drag to reorder — `useSortable`

Drag-to-reorder, with a **keyboard path of equal standing**. The hook owns interaction only: it never touches your data. `onReorder` fires **once** per committed move and you apply it, typically with `moveItem`.

```tsx
import { moveItem, useSortable } from "tempest-react-sdk";
import { useState } from "react";

export function BacklogPriority() {
  const [items, setItems] = useState(["Fix login", "CSV export", "Dark mode"]);

  const sortable = useSortable({
    itemCount: items.length,
    roleDescription: "Sortable item",
    onReorder: ({ from, to }) => setItems((current) => moveItem(current, from, to)),
  });

  return (
    <ul {...sortable.getListProps()} aria-label="Priority" ref={sortable.setContainer}>
      {items.map((item, index) => (
        <li
          key={item}
          {...sortable.getItemProps(index)}
          className={index === sortable.overIndex ? "highlight" : undefined}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
```

| Field | Type | What it is |
| --- | --- | --- |
| `activeIndex` | `number \| null` | Index being dragged, or `null` when idle |
| `overIndex` | `number \| null` | Where it would land if dropped now — use it to draw the indicator |
| `getItemProps(index)` | props | Spread on each item (pointer, keyboard, `role="option"`, `tabIndex`) |
| `getListProps()` | props | Spread on the container (`role="listbox"`) |
| `setContainer` | callback ref | Point it at the container: that is where hit-testing looks for items |
| `cancel()` | `() => void` | Aborts the drag without reordering |

**Keyboard**: `Space` picks the item up · arrows move it · `Space`/`Enter` drop it · `Escape` cancels.

!!! warning "A reorder that only works by dragging excludes keyboard users"
    That is where most drag-and-drop implementations fail. Here the keyboard path is not an extra: same state (`activeIndex`/`overIndex`), same commit, same `onReorder`. `role="listbox"` + `role="option"` + `aria-roledescription` are what make a screen reader announce the list as sortable.

!!! info "One `onReorder` per move, not per frame"
    The hook does **not** call `onReorder` mid-drag. If it did, a controlled list would re-render on every `pointermove` — and the indices would shift underneath the drag itself. You draw the preview from `overIndex`; the mutation happens once, on release.

!!! tip "Rows of different heights work"
    Hit-testing reads the live rects of the `[data-sortable-index]` children instead of assuming a fixed row height. Changing `itemCount` mid-drag **cancels** it: the list no longer has the indices the drag was based on, and committing would move the wrong row.

## Recap

- Granular, independent, tree-shakeable hooks — import only what you use.
- The browser-facing ones are browser-guarded: they return a default on the server and hydrate after mount.
- `useToggle` returns `[value, { toggle, setTrue, setFalse, set }]` — the second item is an object.
- `useDisclosure`/`useCounter`/`useListState` return a `[state, handlers]` tuple; `useMap`/`useSet`/`useQueue` return a single object.
- `useAsync` is the cache-less primitive; for server data with caching use React Query.
- Watch the dependency arrays: `useStableCallback` to avoid re-runs, explicit deps everywhere else.

## See also

- [Components](./components.md) — `<Show>` / `<Hide>` use `useBreakpoint` under the hood
- [Theme](./theme.md) — `useMediaQuery` for programmatic responsiveness
- [Query](./query.md) — React Query when you need server cache
- [Forms](./forms.md) — `useDebounce` on search fields, `useAsync` on submit
