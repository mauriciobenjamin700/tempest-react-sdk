# Layout

A full shell + spacing primitives + responsive utilities.

## What this category is

Layout components don't draw content — they **organize space**. There are three
levels:

1. **Application shell** (`AppShell` + `Page` + `Container`) — the responsive
   frame that holds the navbar, sidebar/bottom-nav, header and content.
2. **Spacing primitives** (`Stack`, `Grid`, `Divider`, `Spacer`, `Center`,
   `AspectRatio`) — declarative flex/grid without writing CSS yourself.
3. **Responsive utilities** (`SafeArea`, `<Show>`/`<Hide>`, `ResponsiveValue`) —
   adapt the layout per breakpoint and respect notches/system bars.

**When to use:** prefer these primitives over ad-hoc `<div style={{ display:
"flex" }}>`. They use the SDK spacing tokens (4px scale), are responsive by
construction, and keep spacing consistent across apps.

!!! tip "Compose from the outside in"
    Think `AppShell` → `Container` → `Page` → `Stack`/`Grid` → content. Each
    layer has a single responsibility; stacking them gives a complete responsive
    layout with no manual media query.

## `AppShell`

<!-- gallery:layout -->
[![Layout (AppShell · Page · Container) in the gallery](../assets/gallery/layout.webp)](../gallery.md)

*Section `layout` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** as the root frame of an app with persistent navigation
(dashboard, admin panel). For a simple landing page, a `Container` is enough.

Composer: navbar + sidebar (desktop) / bottomNav (mobile) + main + responsive
footer.

```tsx
import { useState } from "react";
import {
    AppShell,
    BottomNavigation,
    Navbar,
    Page,
    Sidebar,
    type SidebarItem,
} from "tempest-react-sdk";

const NAV: SidebarItem[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "orders", label: "Orders", badge: 12 },
    { key: "customers", label: "Customers" },
];

export function Shell() {
    const [tab, setTab] = useState("dashboard");

    return (
        <AppShell
            navbar={<Navbar logo={<strong>Tempest</strong>} actions={<button>Sign out</button>} />}
            sidebar={<Sidebar items={NAV} value={tab} onChange={setTab} />}
            bottomNav={<BottomNavigation items={NAV} value={tab} onChange={setTab} />}
            footer={<small>© 2026 Tempest</small>}
            sidebarBreakpoint="md"
        >
            <Page title="Dashboard">Content for the {tab} tab</Page>
        </AppShell>
    );
}
```

Responsive behavior:

- **>= `sidebarBreakpoint`**: navbar + sidebar + main + footer.
- **< `sidebarBreakpoint`**: navbar + main + bottomNav + footer (sidebar hidden).

| Prop                | Type                           | Default |
| ------------------- | ------------------------------ | ------- |
| `navbar`            | `ReactNode`                    | —       |
| `sidebar`           | `ReactNode`                    | —       |
| `bottomNav`         | `ReactNode`                    | —       |
| `footer`            | `ReactNode`                    | —       |
| `sidebarBreakpoint` | `"sm" \| "md" \| "lg" \| "xl"` | `"md"`  |

## `Page`

Page wrapper with a header (`eyebrow` + `title` + `description` + `actions`) +
`toolbar` + `content` + `footer`.

```tsx
import { Button, Page, Pagination, Table } from "tempest-react-sdk";
import { Download, Plus } from "lucide-react";

const ORDERS = [
    { id: "8421", customer: "Ana Souza", total: "$ 1,240.00" },
    { id: "8422", customer: "Bruno Lima", total: "$ 380.00" },
];

export function OrdersPage() {
    return (
        <Page
            eyebrow="Sales"
            title="Orders"
            description="Track your orders in real time"
            actions={
                <>
                    <Button variant="ghost" leftIcon={<Download size={16} />}>
                        Export
                    </Button>
                    <Button leftIcon={<Plus size={16} />}>New</Button>
                </>
            }
            footer={
                <Pagination
                    page={1}
                    totalPages={3}
                    totalItems={ORDERS.length}
                    onPageChange={() => {}}
                />
            }
        >
            <Table
                data={ORDERS}
                rowKey={(order) => order.id}
                columns={[
                    { key: "id", header: "Order" },
                    { key: "customer", header: "Customer" },
                    { key: "total", header: "Total" },
                ]}
            />
        </Page>
    );
}
```

| Prop          | Type        | Default |
| ------------- | ----------- | ------- |
| `title`       | `ReactNode` | —       |
| `eyebrow`     | `ReactNode` | —       |
| `description` | `ReactNode` | —       |
| `actions`     | `ReactNode` | —       |
| `toolbar`     | `ReactNode` | —       |
| `footer`      | `ReactNode` | —       |
| `padded`      | `boolean`   | `true`  |

## `Container`

Max-width wrapper.

```tsx
import { Container, Page } from "tempest-react-sdk";

export function Settings() {
    return (
        <Container size="lg">
            <Page title="Settings">Account preferences</Page>
        </Container>
    );
}
```

| `size`   | Max-width |
| -------- | --------- |
| `"sm"`   | `640px`   |
| `"md"`   | `768px`   |
| `"lg"`   | `1024px`  |
| `"xl"`   | `1280px`  |
| `"full"` | `100%`    |

## `Stack`

<!-- gallery:advanced -->
[![Stepper · Progress · VirtualList in the gallery](../assets/gallery/advanced.webp)](../gallery.md)

*Section `advanced` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** the default primitive for stacking elements in one dimension
(column or row) with uniform spacing. For a 2D grid use `Grid`.

Vertical or horizontal flex with `gap`, `align`, `justify`, `wrap`. Accepts
`ResponsiveValue` for `direction` and `gap`.

```tsx
import { Card, Stack } from "tempest-react-sdk";

export function Stacked() {
    return (
        <>
            <Stack direction="vertical" gap={4}>
                <Card>One</Card>
                <Card>Two</Card>
            </Stack>

            <Stack
                direction={{ mobile: "vertical", desktop: "horizontal" }}
                gap={{ mobile: 2, desktop: 4 }}
            >
                <Card>Mobile stacks, desktop side-by-side</Card>
            </Stack>
        </>
    );
}
```

| Prop        | Type                                                | Default      |
| ----------- | --------------------------------------------------- | ------------ |
| `direction` | `"vertical" \| "horizontal"` (or `ResponsiveValue`) | `"vertical"` |
| `gap`       | `number \| string` (or `ResponsiveValue`)           | `2` (8px)    |
| `align`     | `"start" \| "center" \| "end" \| "stretch"`         | —            |
| `justify`   | `"start" \| "center" \| "end" \| "between"`         | —            |
| `wrap`      | `boolean`                                           | `false`      |

A numeric `gap` maps to the 4px scale (`2 → 8px`, `4 → 16px`).

## `Grid`

CSS Grid wrapper.

```tsx
import { Card, Grid, Stat } from "tempest-react-sdk";

const METRICS = [
    { id: "revenue", label: "Revenue", value: "$ 84,200" },
    { id: "orders", label: "Orders", value: "1,204" },
    { id: "ticket", label: "Average ticket", value: "$ 69.93" },
];

export function Overview() {
    return (
        <>
            <Grid columns={3} gap={4}>
                <Card>1</Card>
                <Card>2</Card>
                <Card>3</Card>
            </Grid>

            <Grid columns={{ mobile: 1, tablet: 2, desktop: 4 }} gap={3}>
                {METRICS.map((metric) => (
                    <Stat key={metric.id} label={metric.label} value={metric.value} />
                ))}
            </Grid>

            <Grid columns="2fr 1fr" gap={6}>
                <article>Content</article>
                <aside>Sidebar</aside>
            </Grid>
        </>
    );
}
```

| Prop      | Type                                      | Default |
| --------- | ----------------------------------------- | ------- |
| `columns` | `number \| string` (or `ResponsiveValue`) | `2`     |
| `gap`     | `number \| string`                        | `4`     |

A numeric `columns` → `repeat(N, minmax(0, 1fr))`. A string passes straight to
`grid-template-columns`.

!!! tip "Responsive columns with no media query"
    `columns={{ mobile: 1, tablet: 2, desktop: 4 }}` is the idiomatic way to
    make a grid that becomes a list on mobile and opens columns on desktop. The
    keys are **`mobile` · `tablet` · `desktop`** — `ResponsiveValue` does not use
    the breakpoint names (`sm`/`md`/`lg`) that `sidebarBreakpoint` and
    `<Show above>` take. The `minmax(0, 1fr)` avoids the classic overflow of
    cells with wide content (long text, `<pre>`).

## `Divider`

Horizontal/vertical separator with an optional label.

```tsx
import { Divider } from "tempest-react-sdk";

export function Separators() {
    return (
        <>
            <Divider />
            <Divider variant="dashed" />
            <Divider orientation="vertical" />
            <Divider label="OR" align="center" />
        </>
    );
}
```

| Prop          | Type                                   | Default        |
| ------------- | -------------------------------------- | -------------- |
| `orientation` | `"horizontal" \| "vertical"`           | `"horizontal"` |
| `variant`     | `"solid" \| "dashed" \| "dotted"`      | `"solid"`      |
| `label`       | `ReactNode` (horizontal only)          | —              |
| `align`       | `"start" \| "center" \| "end"` (label) | `"center"`     |

## `Spacer`

Flex push.

```tsx
import { Button, Spacer, Stack } from "tempest-react-sdk";

export function FormActionsRow() {
    return (
        <Stack direction="horizontal">
            <Button variant="ghost">Cancel</Button>
            <Spacer />
            <Button variant="primary">Save</Button>
        </Stack>
    );
}
```

| Prop   | Type                   | Default  |
| ------ | ---------------------- | -------- |
| `axis` | `"both" \| "x" \| "y"` | `"both"` |

## `Center`

Centers children horizontally/vertically/both.

```tsx
import { Center, Spinner } from "tempest-react-sdk";

export function Loading() {
    return (
        <Center axis="both" minHeight="100vh">
            <Spinner />
        </Center>
    );
}
```

| Prop        | Type                                   | Default  |
| ----------- | -------------------------------------- | -------- |
| `axis`      | `"both" \| "horizontal" \| "vertical"` | `"both"` |
| `minHeight` | `number \| string`                     | —        |
| `fullWidth` | `boolean`                              | `true`   |

## `AspectRatio`

<!-- gallery:display-media -->
[![Avatar · Image · Carousel in the gallery](../assets/gallery/display-media.webp)](../gallery.md)

*Section `display-media` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Preserves the ratio for media.

```tsx
import { AspectRatio } from "tempest-react-sdk";

export function Media() {
    return (
        <>
            <AspectRatio ratio={16 / 9}>
                <img
                    src="/cover.jpg"
                    alt="Album cover"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
            </AspectRatio>

            <AspectRatio ratio={1}>
                <video src="/clip.mp4" autoPlay loop muted />
            </AspectRatio>
        </>
    );
}
```

| Prop    | Type     | Default  |
| ------- | -------- | -------- |
| `ratio` | `number` | `16 / 9` |

Uses the native CSS `aspect-ratio`. Compatible with all modern browsers.

## `SafeArea`

Per-edge padding using `env(safe-area-inset-*)`.

```tsx
import { SafeArea } from "tempest-react-sdk";

export function Root() {
    return (
        <SafeArea edges={["top", "bottom"]}>
            <main>Content that stays clear of the notch</main>
        </SafeArea>
    );
}
```

| Prop     | Type                                             | Default                           |
| -------- | ------------------------------------------------ | --------------------------------- |
| `edges`  | `("top" \| "right" \| "bottom" \| "left")[]`     | `["top","right","bottom","left"]` |
| `inline` | `boolean` (`display: contents` instead of block) | `false`                           |

Components that already handle safe-area automatically: `Navbar` (top),
`BottomNavigation`/`BottomSheet` (bottom), `Modal.fullscreen` (all), `Toast`
(top+bottom).

!!! warning "Don't stack `SafeArea` on components that already handle it"
    If you already use `Navbar`/`BottomNavigation`/`Toast`, don't wrap them in
    `SafeArea` again — the padding doubles and creates a visible gap. Use
    `SafeArea` only on custom surfaces (your own sheet or overlay).

## `<Show>` / `<Hide>`

**When to use:** swap an entire tree by breakpoint (desktop vs. mobile nav, for
example). To merely hide via CSS without unmounting, prefer responsive CSS —
`<Show>`/`<Hide>` unmount the component from the DOM.

Conditional render based on breakpoint. SSR-safe — the first render uses `xs`
(mobile first), then re-renders on the client.

```tsx
import { Banner, Hide, Show } from "tempest-react-sdk";

export function ByBreakpoint() {
    return (
        <>
            <Show above="md">
                <nav>Desktop navigation</nav>
            </Show>
            <Hide above="md">
                <nav>Mobile navigation</nav>
            </Hide>
            <Show below="lg">
                <Banner>Launch promo</Banner>
            </Show>
            <Show only={["sm", "md"]}>
                <p>Hint shown on tablets only</p>
            </Show>
        </>
    );
}
```

| Prop    | Type                              |
| ------- | --------------------------------- |
| `above` | `Breakpoint` (xs/sm/md/lg/xl/2xl) |
| `below` | `Breakpoint`                      |
| `only`  | `Breakpoint \| Breakpoint[]`      |

`only` overrides `above`/`below` when set.

## Responsive values

`Stack.direction`, `Grid.columns`, `Form.layout` accept `ResponsiveValue<T>`:

```ts
type ResponsiveValue<T> = T | { mobile?: T; tablet?: T; desktop?: T };
```

Falls back to the last value defined per cascading breakpoint.

## General A11y

- `Page.title` is `<h1>` — only one per page for correct hierarchy.
- `AppShell` wraps in a semantic `<main>`.
- `<Show>`/`<Hide>` render `null` on the server + adjust on the client (no SEO impact, the first paint may flicker).

## Recap

- Compose from the outside in: `AppShell` → `Container` → `Page` →
  `Stack`/`Grid` → content.
- Use the primitives (`Stack`/`Grid`/`Spacer`/`Center`) instead of ad-hoc CSS
  flex/grid — they use the spacing tokens (4px scale) and are responsive by
  construction.
- `direction`/`columns`/`layout` accept `ResponsiveValue` → responsive layout
  without writing a media query.
- `SafeArea` only on custom surfaces; `Navbar`/`BottomNavigation`/`Toast`/
  `Modal.fullscreen` already handle the notch.

Related pages:

- [Navigation](./navigation.md) — `Navbar`, `Sidebar`, `BottomNavigation` that
  fill the `AppShell` slots.
- [Data entry](./inputs.md) — `Form`/`FormSection`/`FormRow`/`FormActions` to
  structure fields inside a `Page`.
- [Data](./data.md) — `Table`/`DataTable`/`Pagination` that live in a `Page`'s
  content.
- [App Providers](../app-providers.md) and [Routing](../routing.md) — the glue
  that wraps the `AppShell`.
