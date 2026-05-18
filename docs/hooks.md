# Hooks utilitários

Conjunto de hooks granulares pra evitar reescrever wrappers de DOM API em cada app. Cada hook é independente — importe só o que precisar.

## Lista

### DOM / viewport

| Hook                                              | O que faz                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `useDebounce(value, delay?)`                      | Retorna o valor estabilizado após `delay` ms sem mudanças.                                                   |
| `useMediaQuery(query)`                            | Subscreve `matchMedia` e re-renderiza ao mudar.                                                              |
| `useBreakpoint()`                                 | `{ current, width, above, below, isMobile, isTablet, isDesktop }` — breakpoint reativo (xs/sm/md/lg/xl/2xl). |
| `useEventListener(name, handler, target?, opts?)` | Wrap genérico SSR-safe. `target` default = `window`. Aceita ref ou `EventTarget` direto.                     |
| `useOnline()`                                     | `navigator.onLine` reativo.                                                                                  |
| `useDocumentVisibility()`                         | `document.visibilityState` reativo.                                                                          |
| `useIntersectionObserver(ref, opts?)`             | `IntersectionObserverEntry` ou `null`.                                                                       |
| `useResizeObserver(ref)`                          | `{ width, height }` da referência.                                                                           |
| `useScrollLock(active)`                           | Lock de `body.overflow`.                                                                                     |
| `useFocusTrap(ref, active)`                       | Confina Tab dentro do container.                                                                             |
| `useBeforeInstallPrompt()`                        | PWA install prompt diferido.                                                                                 |
| `useIdle(timeout?)`                               | True quando usuário ocioso por `timeout` ms.                                                                 |
| `useGeolocation(opts?)`                           | Position + erro + loading.                                                                                   |

### Estado

| Hook                                              | O que faz                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `usePagination(initialPage?, initialSize?)`       | `{ page, size, setPage, setSize, reset }`.                                                                      |
| `useClientFilter(items, search, keysOrPredicate)` | Filtro client-side por keys ou predicado.                                                                       |
| `useClipboard(opts?)`                             | `{ copied, copy, reset }` com TTL configurável.                                                                 |
| `useKeyboardShortcut(shortcut, handler, opts?)`   | Atalho global; aceita `mod` (Ctrl/Cmd).                                                                         |
| `useLocalStorage<T>(key, default)`                | State persistido em localStorage + sincronizado cross-tab via `storage` event. SSR-safe.                        |
| `useToggle(initial?)`                             | `[on, toggle, set]` — açúcar pra boolean state.                                                                 |
| `useAsync<T>(fn, deps?, { immediate? })`          | Track `idle/pending/success/error`. `{ status, data, error, run, reset }`. Distinto de React Query (sem cache). |
| `useStableCallback(fn)`                           | Ref estável que chama o callback atual.                                                                         |
| `useDeepMemo(value)`                              | Memoização com igualdade estrutural.                                                                            |

## Exemplos

### Offline-aware badge

```tsx
import { useOnline, Badge } from "tempest-react-sdk";

function NetworkPill() {
  const online = useOnline();
  return <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>;
}
```

### Atalho global

```tsx
import { useKeyboardShortcut } from "tempest-react-sdk";

useKeyboardShortcut({ key: "k", mod: true }, () => openCommandPalette());
```

`mod: true` aceita Ctrl ou Cmd, simplificando cross-OS.

### Lazy load via IntersectionObserver

```tsx
const ref = useRef<HTMLDivElement>(null);
const entry = useIntersectionObserver(ref, { once: true });

return <div ref={ref}>{entry?.isIntersecting && <HeavyChart />}</div>;
```

### Copy-to-clipboard com feedback

```tsx
const { copied, copy } = useClipboard();

<Button onClick={() => copy("npm install tempest-react-sdk")}>
  {copied ? "Copiado!" : "Copiar"}
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

Multi-tab: outras abas recebem update via `window.addEventListener("storage", ...)` interno.

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

// Em ref:
const ref = useRef<HTMLDivElement>(null);
useEventListener("click", handleClick, ref);
```

### Focus trap em Modal custom

```tsx
const ref = useRef<HTMLDivElement>(null);
useFocusTrap(ref, open);
useScrollLock(open);
```

### Performance — `useStableCallback`

```tsx
const onSelect = useStableCallback((row) => trackClick(row.id));
// onSelect ref é estável; effect não dispara desnecessariamente
useEffect(() => bind(onSelect), [onSelect]);
```

### Toggle — `useToggle`

```tsx
const [open, toggle, set] = useToggle(false);

<button onClick={toggle}>{open ? "Fechar" : "Abrir"}</button>;
<button onClick={() => set(true)}>Forçar aberto</button>;
```

## Veja também

- [Componentes](./components.md) — `<Show>` / `<Hide>` usam `useBreakpoint` por baixo
- [Theme](./theme.md) — `useMediaQuery` pra responsivo programático
