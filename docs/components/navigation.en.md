# Navigation

Top bars, side navs, bottom nav, tabs, breadcrumbs, pagination, segmented
control.

## What this category is

Components that help the user **orient and move** through the app. They split by
scope:

- **Primary navigation** (between app sections): `Navbar` (top), `Sidebar`
  (desktop side), `BottomNavigation` (mobile bottom) — typically the three slots
  of an `AppShell`.
- **Local navigation** (within a screen): `Tabs`, `SegmentedControl`, `Stepper`.
- **Orientation and traversal**: `Breadcrumbs` (where am I) and `Pagination`
  (next/previous in lists).

**When to use:** pick by scope — don't use `Tabs` to navigate between top-level
routes (that's `Navbar`/`Sidebar`), nor `Navbar` to switch views of the same
screen (that's `Tabs`/`SegmentedControl`).

!!! tip "Responsive Sidebar + BottomNavigation pattern"
    The idiomatic combo: `Sidebar` inside `<Show above="md">` on desktop and
    `BottomNavigation` inside `<Hide above="md">` on mobile, both sharing the
    same `value`/`onChange`. `AppShell` already does this swap automatically when
    you pass both slots.

## `Navbar`

**When to use:** a persistent top bar with brand + global actions (search,
avatar, notifications). It's the highest-level navigation.

Top app bar. Three slots (`logo` / `nav` / `actions`). Sticky by default.

```tsx
<Navbar
  logo={<img src="/logo.svg" alt="App" />}
  nav={
    <>
      <NavLink to="/orders">Orders</NavLink>
      <NavLink to="/products">Products</NavLink>
    </>
  }
  actions={
    <>
      <Button variant="ghost" iconOnly aria-label="Search">
        <Search />
      </Button>
      <Avatar src={user.photo} />
    </>
  }
/>
```

| Prop       | Type                                      | Default     |
| ---------- | ----------------------------------------- | ----------- |
| `logo`     | `ReactNode`                               | —           |
| `nav`      | `ReactNode`                               | —           |
| `actions`  | `ReactNode`                               | —           |
| `sticky`   | `boolean`                                 | `true`      |
| `tone`     | `"surface" \| "primary" \| "transparent"` | `"surface"` |
| `bordered` | `boolean`                                 | `true`      |

**Safe-area**: applies `padding-top: max(space-3, env(safe-area-inset-top))`
automatically.

## `Sidebar`

Desktop side nav. `items: SidebarItem[]`, `header`/`footer` slots, a `collapsed`
mode (icons only).

```tsx
const [tab, setTab] = useState("home");
const [collapsed, setCollapsed] = useState(false);

<Sidebar
  header={<Brand collapsed={collapsed} />}
  items={[
    { key: "home", label: "Home", icon: <Home /> },
    { key: "orders", label: "Orders", icon: <Package />, badge: 3 },
    { key: "settings", label: "Settings", icon: <Cog /> },
  ]}
  value={tab}
  onChange={setTab}
  footer={<Button onClick={() => setCollapsed(!collapsed)}>Collapse</Button>}
  collapsed={collapsed}
  width={240}
  collapsedWidth={64}
/>;
```

| Prop             | Type                           | Default |
| ---------------- | ------------------------------ | ------- |
| `header`         | `ReactNode`                    | —       |
| `items`          | `SidebarItem[]`                | —       |
| `value`          | `string`                       | —       |
| `onChange`       | `(key: string) => void`        | —       |
| `footer`         | `ReactNode`                    | —       |
| `collapsed`      | `boolean`                      | `false` |
| `width`          | `number \| string` (px or CSS) | `240`   |
| `collapsedWidth` | `number \| string`             | `64`    |

Type `SidebarItem = { key, label, icon?, badge?, disabled?, href? }`.

**Mobile**: hide it with `<Show above="md">` and expose it via `<Drawer>` in the
hamburger menu.

## `BottomNavigation`

A bottom-fixed tab bar for mobile. 3-5 items.

```tsx
<Show below="md">
  <BottomNavigation
    items={[
      { key: "home", label: "Home", icon: <Home /> },
      { key: "search", label: "Search", icon: <Search /> },
      { key: "cart", label: "Cart", icon: <Cart />, badge: cartCount },
      { key: "profile", label: "Profile", icon: <User /> },
    ]}
    value={tab}
    onChange={setTab}
  />
</Show>
```

| Prop         | Type                           | Default |
| ------------ | ------------------------------ | ------- |
| `items`      | `BottomNavigationItem[]` (3–5) | —       |
| `value`      | `string`                       | —       |
| `onChange`   | `(key: string) => void`        | —       |
| `showLabels` | `boolean`                      | `true`  |

Type `BottomNavigationItem = { key, label, icon?, badge?, disabled? }`.

**Safe-area**: applies `padding-bottom: env(safe-area-inset-bottom)`
automatically.

## `Tabs`

**When to use:** switch between content panels **within a single screen**
(overview / details / logs). Don't use it to navigate between routes.

Controlled/uncontrolled tabs. Fade-edge mask on horizontal overflow. Visual
variants via `variant` (`"underline"` default or `"pill"`).

```tsx
<Tabs
  value={tab}
  onChange={setTab}
  items={[
    { key: "overview", label: "Overview", content: <Overview /> },
    { key: "details", label: "Details", content: <Details /> },
    { key: "logs", label: "Logs", content: <Logs /> },
  ]}
/>
```

| Prop           | Type                    | Default |
| -------------- | ----------------------- | ------- |
| `items`        | `TabItem[]`             | —       |
| `value`        | `string` (controlled)   | —       |
| `defaultValue` | `string` (uncontrolled) | —       |
| `onChange`     | `(key: string) => void` | —       |

## `Stepper`

**When to use:** show progress through a linear multi-step flow (checkout,
onboarding, wizard). It's a progress indicator, not a selector — drive `current`
from your flow logic.

A linear wizard with numbered steps. `orientation` accepts `"horizontal"`
(default) or `"vertical"`.

```tsx
<Stepper
  current={step}
  steps={[
    { key: "info", label: "Information" },
    { key: "payment", label: "Payment" },
    { key: "review", label: "Review" },
  ]}
/>
```

## `Breadcrumbs`

**When to use:** signal position in a deep hierarchy (Home › Orders › #12345)
and allow jumping back to previous levels. Skippable in 1-2 level apps.

Hierarchical navigation.

```tsx
<Breadcrumbs
  items={[{ label: "Home", href: "/" }, { label: "Orders", href: "/orders" }, { label: "#12345" }]}
/>
```

**A11y**: the last item is marked with `aria-current="page"`.

## `Pagination`

**When to use:** walk large lists in discrete pages (search results, tables).
For continuous feeds prefer infinite scroll (`VirtualList` + `usePoll`/Query).

Numeric with siblings + an optional page-size selector.

!!! note "`page` is 1-indexed, `total` is the item count"
    `total` is the number **of items** (not pages) — the component derives the
    pages from `pageSize`. Remember to reset `page` to `1` when the filter
    changes, otherwise you may land on a page that no longer exists.

```tsx
<Pagination
  page={page}
  pageSize={size}
  total={data?.total ?? 0}
  onPageChange={setPage}
  onPageSizeChange={setSize}
  siblings={1}
/>
```

| Prop               | Type                     | Default |
| ------------------ | ------------------------ | ------- |
| `page`             | `number` (1-indexed)     | —       |
| `pageSize`         | `number`                 | —       |
| `total`            | `number` (item count)    | —       |
| `onPageChange`     | `(page: number) => void` | —       |
| `onPageSizeChange` | `(size: number) => void` | —       |
| `siblings`         | `number` (neighbors)     | `1`     |

## `SegmentedControl`

**When to use:** toggle between 2-5 mutually exclusive views of the same screen
(list/grid/map). It's more compact than `Tabs` and has no built-in content
panels — you swap the view manually via `value`.

An iOS-style pill bar (2-5 options).

```tsx
<SegmentedControl
  value={view}
  onChange={setView}
  options={[
    { value: "list", label: "List", icon: <List /> },
    { value: "grid", label: "Grid", icon: <Grid /> },
    { value: "map", label: "Map", icon: <Map /> },
  ]}
  size="md"
  fullWidth
/>
```

| Prop        | Type                       | Default |
| ----------- | -------------------------- | ------- |
| `options`   | `SegmentedControlOption[]` | —       |
| `value`     | `string`                   | —       |
| `onChange`  | `(value: string) => void`  | —       |
| `size`      | `"sm" \| "md" \| "lg"`     | `"md"`  |
| `fullWidth` | `boolean`                  | `false` |

**A11y**: `role="radiogroup"` + `role="radio"` with `aria-checked`.

## General A11y

- Navbar: uses `<nav>` (already included); mark active items with `aria-current="page"`.
- Sidebar/BottomNavigation: keyboard accessible — Tab cycles between items.
- Tabs: ←→ arrows switch tabs when focused.
- Breadcrumbs: the separator (`/`) is decorative (aria-hidden).

!!! warning "Mark the active item with `aria-current`"
    Navbar/Sidebar/BottomNavigation need the current-route item to carry
    `aria-current="page"` — without it, screen readers don't announce where the
    user is. `Breadcrumbs` already does this on the last item automatically.

## Recap

- Pick by **scope**: `Navbar`/`Sidebar`/`BottomNavigation` to navigate between
  sections; `Tabs`/`SegmentedControl`/`Stepper` to move within a screen.
- The trio `Navbar` + `Sidebar` + `BottomNavigation` are the `AppShell` slots —
  let it orchestrate the desktop/mobile swap.
- `Pagination` for paged lists; `Breadcrumbs` for deep hierarchies.
- Always mark the active item with `aria-current="page"` in primary navigation.

Related pages:

- [Layout](./layout.md) — `AppShell` composing `Navbar`/`Sidebar`/
  `BottomNavigation` + `Page`.
- [Overlays](./overlay.md) — `Drawer` to expose the `Sidebar` in the mobile
  hamburger menu.
- [Data](./data.md) — `Table`/`DataTable` that use `Pagination` in the footer.
- [Routing](../routing.md) — `defineRoutes`/`<AppRouter>`/`<RouteGuard>` that
  wire navigation to routes.
