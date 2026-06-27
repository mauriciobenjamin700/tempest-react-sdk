# Hooks utilitários

Toda app React reescreve os mesmos wrappers: "debounce esse input", "fecha o menu
no Escape", "guarda o tema no localStorage", "re-renderiza quando a janela muda de
tamanho". São pequenos, mas cada um tem uma armadilha — limpeza de listener, segurança
em SSR, array de dependências. O SDK empacota esses padrões em hooks granulares,
testados, **SSR-safe** e independentes — importe só o que precisar.

!!! info "Cada hook é uma peça isolada"
    Nenhum hook depende de outro nem de provider. `import { useDebounce } from "tempest-react-sdk"`
    e pronto — o bundler tree-shake o resto. Eles agrupam só por _propósito_ aqui na
    doc, não por acoplamento.

## Catálogo por propósito

### DOM / viewport

| Hook                                              | O que faz                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `useMediaQuery(query)`                            | Subscreve `matchMedia` e re-renderiza ao mudar.                                                              |
| `useBreakpoint()`                                 | `{ current, width, above, below, isMobile, isTablet, isDesktop }` — breakpoint reativo (xs/sm/md/lg/xl/2xl). |
| `useWindowSize()`                                 | `{ width, height }` da janela, reativo.                                                                      |
| `useEventListener(name, handler, target?, opts?)` | Wrap genérico SSR-safe. `target` default = `window`. Aceita ref ou `EventTarget` direto.                     |
| `useOnline()`                                     | `navigator.onLine` reativo.                                                                                  |
| `useDocumentVisibility()`                         | `document.visibilityState` reativo.                                                                          |
| `useIntersectionObserver(ref, opts?)`             | `IntersectionObserverEntry` ou `null`.                                                                       |
| `useResizeObserver(ref)`                          | `{ width, height }` da referência.                                                                           |
| `useScrollLock(active)`                           | Lock de `body.overflow`.                                                                                     |
| `useFocusTrap(ref, active)`                       | Confina Tab dentro do container.                                                                             |
| `useHover(ref)` / `useLongPress(handler, opts?)`  | Gestos de ponteiro (hover reativo / long-press).                                                             |
| `useBeforeInstallPrompt()`                        | PWA install prompt diferido.                                                                                 |
| `useIdle(timeout?)`                               | True quando usuário ocioso por `timeout` ms.                                                                 |
| `useGeolocation(opts?)`                           | Position + erro + loading.                                                                                   |

### Entrada / interação

| Hook                                            | O que faz                                                  |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `useDebounce(value, delay?)`                    | Retorna o valor estabilizado após `delay` ms sem mudanças. |
| `useThrottle(value, interval?)`                 | Limita atualizações a no máximo uma por `interval` ms.     |
| `useClipboard(opts?)`                           | `{ copied, copy, reset }` com TTL configurável.            |
| `useKeyboardShortcut(shortcut, handler, opts?)` | Atalho global; aceita `mod` (Ctrl/Cmd).                    |

### Estado

| Hook                                              | O que faz                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `usePagination(initialPage?, initialSize?)`       | `{ page, size, setPage, setSize, reset }`.                                                                      |
| `useClientFilter(items, search, keysOrPredicate)` | Filtro client-side por keys ou predicado (memoizado).                                                           |
| `useLocalStorage<T>(key, default)`                | State persistido em localStorage + sincronizado cross-tab via `storage` event. SSR-safe.                        |
| `useToggle(initial?)`                             | `[value, { toggle, setTrue, setFalse, set }]` — açúcar pra boolean state.                                       |
| `useAsync<T>(fn, deps?, { immediate? })`          | Track `idle/pending/success/error`. `{ status, data, error, run, reset }`. Distinto de React Query (sem cache). |
| `usePrevious(value)`                              | Valor anterior do render passado.                                                                               |

### Timers

| Hook                           | O que faz                                         |
| ------------------------------ | ------------------------------------------------- |
| `useInterval(callback, delay)` | `setInterval` declarativo; `delay = null` pausa.  |
| `useTimeout(callback, delay)`  | `setTimeout` declarativo; `delay = null` cancela. |

### Performance

| Hook                    | O que faz                               |
| ----------------------- | --------------------------------------- |
| `useStableCallback(fn)` | Ref estável que chama o callback atual. |
| `useDeepMemo(value)`    | Memoização com igualdade estrutural.    |

!!! tip "SSR-safe por padrão"
    Os hooks que tocam APIs do browser (`useMediaQuery`, `useBreakpoint`,
    `useWindowSize`, `useOnline`, `useDocumentVisibility`, `useLocalStorage`,
    `useEventListener`) checam `typeof window === "undefined"` e retornam um default
    seguro no servidor, hidratando o valor real **após o mount**. Por isso o primeiro
    render no client pode mostrar o default (ex.: `width: 0`) por um instante.

## Exemplos

### Offline-aware badge

```tsx
import { useOnline, Badge } from "tempest-react-sdk";

function NetworkPill() {
  const online = useOnline();
  return <Badge variant={online ? "success" : "danger"}>{online ? "online" : "offline"}</Badge>;
}
```

### Atalho global — `useKeyboardShortcut`

```tsx
import { useState } from "react";
import { useKeyboardShortcut } from "tempest-react-sdk";

function CommandPalette() {
  const [open, setOpen] = useState(false);
  useKeyboardShortcut({ key: "k", mod: true }, () => setOpen(true));
  return open ? <div role="dialog">Command palette…</div> : null;
}
```

`mod: true` aceita Ctrl ou Cmd, simplificando cross-OS.

!!! note "Não dispara dentro de inputs"
    Por default (`ignoreInput: true`) o atalho é ignorado quando o foco está num
    `<input>`, `<textarea>`, `<select>` ou `[contenteditable]` — pra não roubar o
    "k" que o usuário está digitando. Passe `{ ignoreInput: false }` se quiser o
    contrário.

### Busca com debounce — `useDebounce`

```tsx
import { useEffect, useState } from "react";
import { useDebounce } from "tempest-react-sdk";

function SearchBox() {
  const [text, setText] = useState("");
  const debounced = useDebounce(text, 400);

  useEffect(() => {
    if (debounced) fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
  }, [debounced]);

  return <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar…" />;
}
```

`useDebounce` adia o _valor_; o `useEffect` só dispara quando ele estabiliza.

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

### Copy-to-clipboard com feedback — `useClipboard`

```tsx
import { useClipboard, Button } from "tempest-react-sdk";

function CopyButton() {
  const { copied, copy } = useClipboard({ resetAfter: 2000 });
  return (
    <Button onClick={() => copy("npm install tempest-react-sdk")}>
      {copied ? "Copiado!" : "Copiar"}
    </Button>
  );
}
```

### Responsive — `useBreakpoint`

```tsx
import { useBreakpoint } from "tempest-react-sdk";

function Hero() {
  const bp = useBreakpoint();
  return <h1 style={{ fontSize: bp.isMobile ? 24 : 48 }}>Bem-vindo</h1>;
}
```

`bp.above("lg")` / `bp.below("md")` cobrem comparações arbitrárias além dos atalhos
`isMobile` / `isTablet` / `isDesktop`.

### Persisted state — `useLocalStorage`

```tsx
import { useLocalStorage } from "tempest-react-sdk";

function ThemeToggle() {
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light");
  return <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme}</button>;
}
```

Multi-tab: outras abas recebem update via `window.addEventListener("storage", ...)` interno.

!!! warning "A `key` deve ser estável e única"
    `useLocalStorage` usa a `key` como dependência interna. Não a monte inline com
    valores que mudam (`` `user-${id}` `` muda toda vez que `id` muda e troca o slot
    de armazenamento). E como a key é global no domínio, escolha um nome com prefixo
    pra não colidir com outra feature.

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
    `useAsync` é o primitivo de uma chamada só, sem cache e sem dependências extras —
    ideal pra ações pontuais (submit, "carregar mais"). Pra dados de servidor com
    cache, dedup e revalidação, use [React Query](./query.md). `useAsync` descarta
    resultados de runs obsoletos, então trocar `id` rápido não causa race.

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

### Focus trap em Modal custom

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

!!! note "Acessibilidade do focus trap"
    `useFocusTrap` confina o Tab dentro do container, mas não substitui o resto do
    contrato de diálogo: marque `role="dialog"` + `aria-modal="true"`, devolva o foco
    ao gatilho ao fechar e trate o Escape. O componente `Modal` do SDK já faz tudo
    isso — só recorra a este hook em overlays caseiros.

### Toggle — `useToggle`

```tsx
import { useToggle } from "tempest-react-sdk";

function Disclosure() {
  const [open, { toggle, setTrue }] = useToggle(false);
  return (
    <>
      <button onClick={toggle}>{open ? "Fechar" : "Abrir"}</button>
      <button onClick={setTrue}>Forçar aberto</button>
      {open && <p>Conteúdo</p>}
    </>
  );
}
```

!!! warning "O segundo elemento é um objeto, não funções soltas"
    `useToggle` retorna `[value, { toggle, setTrue, setFalse, set }]`. Desestruture o
    objeto (`const [on, { toggle }] = useToggle()`) — não `const [on, toggle] = ...`,
    que daria o objeto inteiro em `toggle`.

### Performance — `useStableCallback`

```tsx
import { useEffect } from "react";
import { useStableCallback } from "tempest-react-sdk";

function Tracker({ onSelect }: { onSelect: (id: string) => void }) {
  const stable = useStableCallback(onSelect);
  // `stable` tem ref constante; o effect não re-dispara quando onSelect muda.
  useEffect(() => bindSomething(stable), [stable]);
  return null;
}
```

!!! tip "Cuidado com o array de dependências"
    Passe `useStableCallback` para effects/listeners que você **não** quer re-rodar
    quando o callback muda de identidade. Já valores derivados (`useDebounce`,
    `useAsync` com `deps`) devem entrar nas deps normalmente — omiti-los gera bugs de
    valor obsoleto. Regra geral: confie no `eslint-plugin-react-hooks`.

## Resumo

- Hooks granulares, independentes e tree-shakáveis — importe só o que usar.
- Os que tocam o browser são **SSR-safe**: retornam um default no servidor e hidratam após o mount.
- `useToggle` devolve `[value, { toggle, setTrue, setFalse, set }]` — o segundo item é um objeto.
- `useAsync` é o primitivo sem cache; para dados de servidor com cache use React Query.
- Atenção aos arrays de dependência: `useStableCallback` para fugir de re-runs, deps explícitas no resto.

## Veja também

- [Componentes](./components.md) — `<Show>` / `<Hide>` usam `useBreakpoint` por baixo
- [Theme](./theme.md) — `useMediaQuery` pra responsivo programático
- [Query](./query.md) — React Query quando precisar de cache de servidor
- [Forms](./forms.md) — `useDebounce` em campos de busca, `useAsync` no submit
