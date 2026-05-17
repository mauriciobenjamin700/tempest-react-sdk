# Hooks utilitários

Conjunto de hooks granulares pra evitar reescrever wrappers de DOM API em cada app. Cada hook é independente — importe só o que precisar.

## Lista

| Hook | O que faz |
|------|-----------|
| `useDebounce(value, delay?)` | Retorna o valor estabilizado após `delay` ms sem mudanças. |
| `usePagination(initialPage?, initialSize?)` | Estado `{ page, size, setPage, setSize, reset }`. |
| `useClientFilter(items, search, keysOrPredicate)` | Filtro client-side por keys ou predicado. |
| `useMediaQuery(query)` | Subscreve `matchMedia` e re-renderiza ao mudar. |
| `useOnline()` | `navigator.onLine` reativo. |
| `useDocumentVisibility()` | `document.visibilityState` reativo. |
| `useIntersectionObserver(ref, opts?)` | `IntersectionObserverEntry` ou `null`. |
| `useResizeObserver(ref)` | `{ width, height }` da referência. |
| `useClipboard(opts?)` | `{ copied, copy, reset }` com TTL configurável. |
| `useKeyboardShortcut(shortcut, handler, opts?)` | Atalho global; aceita `mod` (Ctrl/Cmd). |
| `useBeforeInstallPrompt()` | PWA install prompt diferido. |
| `useIdle(timeout?)` | True quando usuário ocioso. |
| `useGeolocation(opts?)` | Position + erro + loading. |
| `useScrollLock(active)` | Lock de `body.overflow`. |
| `useFocusTrap(ref, active)` | Confina Tab dentro do container. |
| `useStableCallback(fn)` | Ref estável que chama o callback atual. |
| `useDeepMemo(value)` | Memoização com igualdade estrutural. |

## Exemplos curtos

### Offline-aware

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

### Focus trap em Modal custom

```tsx
const ref = useRef<HTMLDivElement>(null);
useFocusTrap(ref, open);
useScrollLock(open);
```

### Performance: useStableCallback

```tsx
const onSelect = useStableCallback((row) => trackClick(row.id));
// onSelect ref é estável; effect não dispara desnecessariamente
useEffect(() => bind(onSelect), [onSelect]);
```

## Veja também

- [Componentes](./components.md)
- [Theme](./theme.md) — `useMediaQuery` pra responsivo programático
