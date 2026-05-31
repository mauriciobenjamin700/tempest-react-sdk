# Navigation

Top bars, side navs, bottom nav, tabs, breadcrumbs, pagination, segmented
control.

## `Navbar`

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

Controlled/uncontrolled tabs. Fade-edge mask on horizontal overflow.

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

A linear wizard with numbered steps.

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

Hierarchical navigation.

```tsx
<Breadcrumbs
  items={[{ label: "Home", href: "/" }, { label: "Orders", href: "/orders" }, { label: "#12345" }]}
/>
```

**A11y**: the last item is marked with `aria-current="page"`.

## `Pagination`

Numeric with siblings + an optional page-size selector.

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
