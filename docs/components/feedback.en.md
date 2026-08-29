# Status & feedback

Signaling state, success, error, activity. Spinners, skeletons, alerts, KPIs.

## What this category is

Components that **communicate state** to the user — what happened, what's
happening, and what isn't there. They group by intent:

- **Messages** (success/error/warning): `Alert` (inline), `Banner` (top of
  page), `Toast` (transient) — three scopes of the same concept.
- **Status labels**: `Badge` (fixed status), `Tag` (removable chip), `Stat`
  (KPI).
- **Activity/loading**: `Spinner`, `Progress`, `Skeleton`, `NProgressBar` (fixed
  top bar).
- **Empty/error screen states**: `EmptyState`, `ErrorState`.

**When to use:** whenever the user needs to know the outcome of an action or the
state of some data. The golden rule: **never leave an async action without
feedback** — show `Spinner`/`Skeleton` during, `Toast`/`Alert` on completion.

!!! tip "Alert vs Banner vs Toast — pick by scope"
    `Alert` is inline and stays until the user resolves the context. `Banner` is
    persistent at the top and applies to the whole page/app. `Toast` is
    transient and dismisses itself. Use `Toast` for quick confirmations, `Alert`
    for errors tied to a field/section, `Banner` for global notices
    (maintenance, expiration).

## `Alert`

<!-- gallery:feedback-extra -->
[![Alert · Timeline · BottomSheet in the gallery](../assets/gallery/feedback-extra.webp)](../gallery.md)

*Section `feedback-extra` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** a message tied to a specific context on the screen (form error,
result of an operation in a section). Visible until the condition changes.

An inline banner. Different from `Banner` (top-of-page) and `Toast` (transient).

```tsx
import { useState } from "react";
import { Alert } from "tempest-react-sdk";
import { AlertCircle } from "lucide-react";

export function Avisos() {
    const [open, setOpen] = useState(true);

    return (
        <>
            <Alert variant="success" appearance="soft" title="Saved">
                Your changes were applied successfully.
            </Alert>

            {open && (
                <Alert
                    variant="danger"
                    appearance="outline"
                    icon={<AlertCircle size={16} />}
                    onClose={() => setOpen(false)}
                >
                    Could not process the payment.
                </Alert>
            )}
        </>
    );
}
```

| Prop          | Type                                                        | Default  |
| ------------- | ----------------------------------------------------------- | -------- |
| `variant`     | `"neutral" \| "info" \| "success" \| "warning" \| "danger"` | `"info"` |
| `appearance`  | `"soft" \| "solid" \| "outline"`                            | `"soft"` |
| `title`       | `ReactNode`                                                 | —        |
| `icon`        | `ReactNode`                                                 | —        |
| `description` | `ReactNode`                                                 | —        |
| `onClose`     | `() => void` (renders the close button)                     | —        |
| `closeLabel`  | `string`                                                    | —        |

**A11y**: `role="status"` for info/success, `role="alert"` for warning/danger.

## `Banner`

<!-- gallery:data-display -->
[![Stat · Tag · Money · Banner in the gallery](../assets/gallery/data-display.webp)](../gallery.md)

*Section `data-display` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Persistent, top-of-page. Use it for environment indicators, maintenance,
expiration.

```tsx
import { useState } from "react";
import { Banner, Button } from "tempest-react-sdk";

export function AvisoDeAssinatura() {
    const [open, setOpen] = useState(true);
    if (!open) return null;

    return (
        <Banner
            variant="warning"
            dismissible
            onDismiss={() => setOpen(false)}
            action={<Button size="sm">Renew</Button>}
        >
            Your subscription expires in 3 days.
        </Banner>
    );
}
```

Same variants as Alert.

## `Badge`

<!-- gallery:feedback -->
[![Badges · Cards · Skeleton in the gallery](../assets/gallery/feedback.webp)](../gallery.md)

*Section `feedback` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** a short, read-only status label next to an item (order status,
count). For a chip the user removes, use `Tag`.

Status pill — not removable.

```tsx
import { Badge } from "tempest-react-sdk";

export function Selos() {
    return (
        <>
            <Badge>Default</Badge>
            <Badge variant="success">Paid</Badge>
            <Badge variant="danger" appearance="solid">
                Overdue
            </Badge>
            <Badge variant="warning" appearance="outline" shape="square">
                Pending
            </Badge>
            <Badge variant="info" dot>
                3
            </Badge>
        </>
    );
}
```

| Prop         | Type                                                                     | Default     |
| ------------ | ------------------------------------------------------------------------ | ----------- |
| `variant`    | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `appearance` | `"soft" \| "solid" \| "outline"`                                         | `"soft"`    |
| `shape`      | `"pill" \| "square"`                                                     | `"pill"`    |
| `size`       | `"sm" \| "md" \| "lg"`                                                   | `"md"`      |
| `dot`        | `boolean` (status indicator + number)                                    | `false`     |

## `Tag`

A removable chip. Use it for filter tokens, applied filters, selected entities.

```tsx
import { Tag } from "tempest-react-sdk";

export function Filtros({ removeFilter }: { removeFilter: (key: string) => void }) {
    return (
        <>
            <Tag onRemove={() => removeFilter("sp")} variant="primary">
                São Paulo
            </Tag>
            <Tag size="sm">In stock</Tag>
        </>
    );
}
```

| Prop          | Type                                                                     | Default     |
| ------------- | ------------------------------------------------------------------------ | ----------- |
| `variant`     | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `size`        | `"sm" \| "md" \| "lg"`                                                   | `"md"`      |
| `onRemove`    | `() => void`                                                             | —           |
| `removeLabel` | `string` (a11y)                                                          | `"Remover"` |

## `Stat`

**When to use:** highlight a single metric with its delta (revenue, sessions,
NPS) on dashboards. For several KPIs side by side, combine with `Grid`.

A KPI card for dashboards.

```tsx
import { Stat } from "tempest-react-sdk";
import { TrendingUp } from "lucide-react";

export function Metricas() {
    return (
        <>
            <Stat
                label="Revenue"
                value="R$ 12.345"
                delta="+12,4%"
                hint="vs. previous month"
                icon={<TrendingUp size={16} />}
            />
            <Stat label="Sessions" value="1.2k" delta="-3%" hint="last 7 days" />
            <Stat label="NPS" value="78" delta="0" trend="flat" />
        </>
    );
}
```

| Prop    | Type                       | Default                                   |
| ------- | -------------------------- | ----------------------------------------- |
| `label` | `ReactNode`                | —                                         |
| `value` | `ReactNode`                | —                                         |
| `delta` | `ReactNode`                | —                                         |
| `trend` | `"up" \| "down" \| "flat"` | inferred from `+`/`-` in the delta string |
| `hint`  | `ReactNode`                | —                                         |
| `icon`  | `ReactNode`                | —                                         |

## `Progress`

<!-- gallery:advanced -->
[![Stepper · Progress · VirtualList in the gallery](../assets/gallery/advanced.webp)](../gallery.md)

*Section `advanced` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Progress bar.

```tsx
import { Progress } from "tempest-react-sdk";

export function Barras({ uploadProgress }: { uploadProgress: number }) {
    return (
        <>
            <Progress value={uploadProgress} max={100} variant="primary" />
            <Progress value={100} variant="success" />
            <Progress indeterminate variant="primary" />
        </>
    );
}
```

| Prop            | Type                                 | Default     |
| --------------- | ------------------------------------ | ----------- |
| `value`         | `number`                             | —           |
| `max`           | `number`                             | `100`       |
| `variant`       | `"primary" \| "success" \| "danger"` | `"primary"` |
| `indeterminate` | `boolean`                            | `false`     |

## `NProgress`

**When to use:** a fixed top loading bar for transitions with no exact position —
route navigation, background requests. For deterministic upload progress, prefer
`Progress`.

An imperative controller (`nprogress`) + the visual bar (`<NProgressBar>`). Mount
the bar once near the app root and drive the controller from anywhere (router
transitions, fetch interceptors).

```tsx
import { Button, NProgressBar, nprogress } from "tempest-react-sdk";

async function loadPage(): Promise<void> {
    nprogress.start();
    try {
        await fetch("/api/data");
    } finally {
        nprogress.done();
    }
}

export function Raiz() {
    return (
        <>
            <NProgressBar color="var(--tempest-primary)" height={3} />
            <Button onClick={loadPage}>Load</Button>
        </>
    );
}
```

| `nprogress` | Signature                   | What it does                                    |
| ----------- | --------------------------- | ----------------------------------------------- |
| `start`     | `() => void`                | Shows the bar and starts trickling toward ~0.9. |
| `done`      | `() => void`                | Completes to `1` and hides the bar shortly after. |
| `set`       | `(n: number) => void`       | Sets progress explicitly (clamped `0..1`).      |
| `inc`       | `(amount?: number) => void` | Increments progress by `amount`.                |

| Prop (`NProgressBar`) | Type     | Default                  |
| --------------------- | -------- | ------------------------ |
| `color`               | `string` | `var(--tempest-primary)` |
| `height`              | `number` | `3`                      |
| `className`           | `string` | —                        |

!!! tip "Great with router navigation"
    Call `nprogress.start()` when a transition begins and `nprogress.done()` when
    the route mounts. `nprogress` is a module-level singleton — no provider or
    props drilling needed.

**A11y**: the bar uses `role="progressbar"` with `aria-valuenow` reflecting the
percentage.

## `Spinner`

A generic loader.

```tsx
import { Spinner } from "tempest-react-sdk";

export function Carregando() {
    return (
        <>
            <Spinner />
            <Spinner size="lg" />
            <Spinner size="lg" caption="Loading…" />
            <Spinner overlay caption="Loading…" />
        </>
    );
}
```

| Prop      | Type                                   | Default        | Description                                                  |
| --------- | -------------------------------------- | -------------- | ------------------------------------------------------------ |
| `size`    | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"`         | Indicator size.                                              |
| `label`   | `string`                               | `"Carregando"` | Accessible label (screen readers).                           |
| `caption` | `ReactNode`                            | —              | **Visible** text under the spinner.                          |
| `overlay` | `boolean`                              | `false`        | Centers inside a full-area container (`position: absolute`). |

!!! note "Back-compat"
    `<Spinner />` with no `caption`/`overlay` stays a single `<span role="status">` — existing usage is unchanged.

## `Skeleton`

**When to use:** loading content whose **shape** is already known (cards, table
rows, avatar). It reduces layout shift. For shapeless loading (a button
processing), use `Spinner`.

A placeholder with shimmer while data loads.

!!! tip "Skeleton mirrors the final layout"
    Give the skeleton the same dimensions/proportions as the real content — that
    is what eliminates layout shift when the data arrives. Skeletons that are too
    generic (a single block) confuse more than they help.

```tsx
import { Skeleton, Stack } from "tempest-react-sdk";

export function Esqueleto({ loading }: { loading: boolean }) {
    if (loading) {
        return (
            <Stack gap={2}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="rect" height={120} />
                <Skeleton variant="circle" width={40} height={40} />
            </Stack>
        );
    }
    return <p>Loaded content</p>;
}
```

| Prop      | Type                           | Default  |
| --------- | ------------------------------ | -------- |
| `variant` | `"rect" \| "text" \| "circle"` | `"rect"` |
| `width`   | `number \| string`             | `"100%"` |
| `height`  | `number \| string`             | —        |

## `RefreshIndicator`

<!-- gallery:material -->
[![Material (ListTile · FAB · Rail) in the gallery](../assets/gallery/material.webp)](../gallery.md)

*Section `material` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** give the user a **pull-to-refresh** gesture on scrollable
mobile lists/screens (touch) — feeds, inboxes, dashboards. It wraps the
scrollable content and fires `onRefresh` when the user pulls past the threshold
and releases.

It is a **touch** gesture — there's no mouse equivalent. The SDK `Spinner` shows
while pulling and during the refresh.

```tsx
import { RefreshIndicator } from "tempest-react-sdk";

interface FeedItem {
    id: string;
    title: string;
}

export function Feed({ items, refetch }: { items: FeedItem[]; refetch: () => Promise<void> }) {
    return (
        <RefreshIndicator onRefresh={refetch}>
            <ul>
                {items.map((item) => (
                    <li key={item.id}>{item.title}</li>
                ))}
            </ul>
        </RefreshIndicator>
    );
}
```

| Prop        | Type                          | Default |
| ----------- | ----------------------------- | ------- |
| `onRefresh` | `() => void \| Promise<void>` | —       |
| `children`  | `ReactNode` (scrollable area) | —       |
| `threshold` | `number` (px before firing)   | `80`    |
| `disabled`  | `boolean`                     | `false` |

!!! note "Touch-only gesture"
    `RefreshIndicator` listens for touch drags that start with the container
    scrolled to the top — it doesn't respond to the mouse. On desktop, offer an
    explicit "Refresh" button as a fallback.

## `Toast`

**When to use:** a transient confirmation of an action that already finished
("Saved", "Item removed") — it needs no attention and dismisses itself. For
errors the user must resolve, prefer `Alert`/`Banner` (which stay).

Transient notifications. Set up via `ToastProvider` + use via `useToast()`.

!!! warning "Toast is not for critical errors"
    Toasts disappear in a few seconds — if the user must **act** on the message
    (fix a field, retry), it has to persist. Use `Toast` only for dismissible
    feedback; actionable errors go in `Alert`/`ErrorState`.

```tsx
import { ToastProvider, useToast } from "tempest-react-sdk";

function Salvar() {
    const toast = useToast();

    return (
        <button
            onClick={() => {
                toast.success("Saved");
                toast.error("Could not process the payment.", { duration: 8000 });
                toast.show({
                    title: "Sync",
                    description: "In progress…",
                    variant: "info",
                });
            }}
        >
            Save
        </button>
    );
}

export function App() {
    return (
        <ToastProvider position="top-right" defaultDuration={4000}>
            <Salvar />
        </ToastProvider>
    );
}
```

| `ToastApi` | Signature                                        |
| ---------- | ------------------------------------------------ |
| `show`     | `(options: ToastOptions) => string` (returns id) |
| `success`  | `(description, options?) => string`              |
| `error`    | `(description, options?) => string`              |
| `warning`  | `(description, options?) => string`              |
| `info`     | `(description, options?) => string`              |
| `dismiss`  | `(id: string) => void`                           |

`ToastProvider.position`: `"top-right"` (default), `"top-left"`, `"top-center"`,
`"bottom-right"`, `"bottom-left"`, `"bottom-center"`.

**Safe-area aware**.

## `EmptyState`

<!-- gallery:table -->
[![Table & Pagination in the gallery](../assets/gallery/table.webp)](../gallery.md)

*Section `table` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** a list/collection returned **zero items successfully** (no
orders yet, search with no results). Always offer a way out (create the first
item, clear filters). Don't confuse it with an error — for a failure use
`ErrorState`.

A centered "nothing here".

```tsx
import { Button, EmptyState } from "tempest-react-sdk";
import { Inbox, Plus } from "lucide-react";

export function SemPedidos() {
    return (
        <EmptyState
            icon={<Inbox size={32} />}
            title="No orders yet"
            description="When your customers place orders, they show up here."
            action={<Button leftIcon={<Plus size={16} />}>New order</Button>}
        />
    );
}
```

## `ErrorState`

**When to use:** an operation **failed** (a request errored, an exception) and
the user can retry. Unlike `EmptyState`, which represents success with no data.

A failure with a retry button.

```tsx
import { ErrorState } from "tempest-react-sdk";

export function FalhaAoCarregar({
    error,
    refetch,
}: {
    error: unknown;
    refetch: () => void;
}) {
    return (
        <ErrorState
            title="Could not load"
            description={String(error)}
            onRetry={refetch}
        />
    );
}
```

## `OfflineIndicator`

**When to use:** warn that the app is offline and confirm when the connection returns. Driven by `useOnline` — renders nothing while online, so mount it at the root without an `if`.

```tsx
import { OfflineIndicator } from "tempest-react-sdk";

export function Raiz() {
    return <OfflineIndicator position="top" />;
}
```

`position`: `"top"` | `"bottom"` (default). Pass `children` to replace the body, or `onlineFlashMs={0}` to skip the confirmation flash. See [PWA & Offline-First](../pwa.md).

## `SyncStatusBadge`

<!-- gallery:pwa -->
[![PWA: Install · Push in the gallery](../assets/gallery/pwa.webp)](../gallery.md)

*Section `pwa` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** show the offline engine state (synced / syncing / pending / offline / error). Two modes: pass `sync` to connect straight to the engine (zero wiring), or pass an explicit `tone` (presentational, testable without IndexedDB).

```tsx
import { SyncStatusBadge, useSyncStatus, type OfflineSync } from "tempest-react-sdk";

interface Nota {
    id: string;
    body: string;
}

export function Status({ notesSync }: { notesSync: OfflineSync<Nota> }) {
    const { tone, pending } = useSyncStatus(notesSync);

    return (
        <>
            <SyncStatusBadge sync={notesSync} />
            <SyncStatusBadge tone={tone} pending={pending} />
        </>
    );
}
```

`tone`: `"idle"` | `"syncing"` | `"pending"` | `"offline"` | `"error"`. `iconOnly` hides the label; `labels` overrides the per-tone text.

## `UpdatePrompt`

**When to use:** announce a new app version (service worker) and let the user reload. Pairs with `useServiceWorkerUpdate`.

```tsx
import { UpdatePrompt, useServiceWorkerUpdate } from "tempest-react-sdk";

export function AvisoDeAtualizacao() {
    const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });

    return <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />;
}
```

Renders nothing when `open={false}`. `onDismiss` (optional) shows the dismiss button; `position` `"top"`/`"bottom"`.

## General A11y

- `Alert`/`Banner` with the `warning`/`danger` variant use `role="alert"` (announced immediately).
- The `Toast` container is `aria-live="polite"` + `aria-atomic="true"`.
- `Spinner`/`Progress.indeterminate` add `aria-busy="true"`.
- `Skeleton` is decorative — it doesn't announce (`aria-hidden`).
- `Stat.value` with tabular-nums aligns numeric values in columns.

## Recap

- **Never leave an async action without feedback**: `Spinner`/`Skeleton` during,
  `Toast`/`Alert` on completion.
- Messages by scope: `Alert` (inline/contextual), `Banner` (global/top), `Toast`
  (transient).
- `EmptyState` = success with no data; `ErrorState` = failure with retry. Don't
  swap one for the other.
- `Toast` only for dismissible feedback; actionable errors stay in
  `Alert`/`ErrorState`.

Related pages:

- [Data entry](./inputs.md) — `error` on form fields, complementary to a section
  `Alert`.
- [Data](./data.md) — `Table`/`DataTable` that pair with `Skeleton` (loading)
  and `EmptyState`/`ErrorState`.
- [Overlays](./overlay.md) — `ConfirmDialog` for destructive actions that need
  confirmation before the `Toast`.
- [Layout](./layout.md) — `Grid` to lay out multiple `Stat`s; `Center` for a
  full-screen `Spinner`.
