# Navegação

Top bars, side navs, bottom nav, tabs, breadcrumbs, paginação, segmented control.

## `Navbar`

App bar superior. Três slots (`logo` / `nav` / `actions`). Sticky por padrão.

```tsx
<Navbar
  logo={<img src="/logo.svg" alt="App" />}
  nav={
    <>
      <NavLink to="/orders">Pedidos</NavLink>
      <NavLink to="/products">Produtos</NavLink>
    </>
  }
  actions={
    <>
      <Button variant="ghost" iconOnly aria-label="Buscar">
        <Search />
      </Button>
      <Avatar src={user.photo} />
    </>
  }
/>
```

| Prop       | Tipo                                      | Default     |
| ---------- | ----------------------------------------- | ----------- |
| `logo`     | `ReactNode`                               | —           |
| `nav`      | `ReactNode`                               | —           |
| `actions`  | `ReactNode`                               | —           |
| `sticky`   | `boolean`                                 | `true`      |
| `tone`     | `"surface" \| "primary" \| "transparent"` | `"surface"` |
| `bordered` | `boolean`                                 | `true`      |

**Safe-area**: aplica `padding-top: max(space-3, env(safe-area-inset-top))` automático.

## `Sidebar`

Side nav desktop. `items: SidebarItem[]`, slots `header`/`footer`, modo `collapsed` (apenas ícones).

```tsx
const [tab, setTab] = useState("home");
const [collapsed, setCollapsed] = useState(false);

<Sidebar
  header={<Brand collapsed={collapsed} />}
  items={[
    { key: "home", label: "Início", icon: <Home /> },
    { key: "orders", label: "Pedidos", icon: <Package />, badge: 3 },
    { key: "settings", label: "Ajustes", icon: <Cog /> },
  ]}
  value={tab}
  onChange={setTab}
  footer={<Button onClick={() => setCollapsed(!collapsed)}>Colapsar</Button>}
  collapsed={collapsed}
  width={240}
  collapsedWidth={64}
/>;
```

| Prop             | Tipo                           | Default |
| ---------------- | ------------------------------ | ------- |
| `header`         | `ReactNode`                    | —       |
| `items`          | `SidebarItem[]`                | —       |
| `value`          | `string`                       | —       |
| `onChange`       | `(key: string) => void`        | —       |
| `footer`         | `ReactNode`                    | —       |
| `collapsed`      | `boolean`                      | `false` |
| `width`          | `number \| string` (px ou CSS) | `240`   |
| `collapsedWidth` | `number \| string`             | `64`    |

Tipo `SidebarItem = { key, label, icon?, badge?, disabled?, href? }`.

**Mobile**: esconda com `<Show above="md">` e exponha via `<Drawer>` no menu hambúrguer.

## `BottomNavigation`

Tab bar fixa no rodapé pra mobile. 3-5 items.

```tsx
<Show below="md">
  <BottomNavigation
    items={[
      { key: "home", label: "Início", icon: <Home /> },
      { key: "search", label: "Buscar", icon: <Search /> },
      { key: "cart", label: "Carrinho", icon: <Cart />, badge: cartCount },
      { key: "profile", label: "Perfil", icon: <User /> },
    ]}
    value={tab}
    onChange={setTab}
  />
</Show>
```

| Prop         | Tipo                           | Default |
| ------------ | ------------------------------ | ------- |
| `items`      | `BottomNavigationItem[]` (3–5) | —       |
| `value`      | `string`                       | —       |
| `onChange`   | `(key: string) => void`        | —       |
| `showLabels` | `boolean`                      | `true`  |

Tipo `BottomNavigationItem = { key, label, icon?, badge?, disabled? }`.

**Safe-area**: aplica `padding-bottom: env(safe-area-inset-bottom)` automático.

## `Tabs`

Tabs controlled/uncontrolled. Fade-edge mask em overflow horizontal.

```tsx
<Tabs
  value={tab}
  onChange={setTab}
  items={[
    { key: "overview", label: "Visão geral", content: <Overview /> },
    { key: "details", label: "Detalhes", content: <Details /> },
    { key: "logs", label: "Logs", content: <Logs /> },
  ]}
/>
```

| Prop           | Tipo                    | Default |
| -------------- | ----------------------- | ------- |
| `items`        | `TabItem[]`             | —       |
| `value`        | `string` (controlled)   | —       |
| `defaultValue` | `string` (uncontrolled) | —       |
| `onChange`     | `(key: string) => void` | —       |

## `Stepper`

Wizard linear com steps numerados.

```tsx
<Stepper
  current={step}
  steps={[
    { key: "info", label: "Informações" },
    { key: "payment", label: "Pagamento" },
    { key: "review", label: "Revisão" },
  ]}
/>
```

## `Breadcrumbs`

Navegação hierárquica.

```tsx
<Breadcrumbs
  items={[{ label: "Home", href: "/" }, { label: "Pedidos", href: "/orders" }, { label: "#12345" }]}
/>
```

**A11y**: último item é marcado com `aria-current="page"`.

## `Pagination`

Numeric com siblings + page-size opcional.

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

| Prop               | Tipo                     | Default |
| ------------------ | ------------------------ | ------- |
| `page`             | `number` (1-indexed)     | —       |
| `pageSize`         | `number`                 | —       |
| `total`            | `number` (item count)    | —       |
| `onPageChange`     | `(page: number) => void` | —       |
| `onPageSizeChange` | `(size: number) => void` | —       |
| `siblings`         | `number` (vizinhos)      | `1`     |

## `SegmentedControl`

iOS-style pill bar (2-5 opções).

```tsx
<SegmentedControl
  value={view}
  onChange={setView}
  options={[
    { value: "list", label: "Lista", icon: <List /> },
    { value: "grid", label: "Grade", icon: <Grid /> },
    { value: "map", label: "Mapa", icon: <Map /> },
  ]}
  size="md"
  fullWidth
/>
```

| Prop        | Tipo                       | Default |
| ----------- | -------------------------- | ------- |
| `options`   | `SegmentedControlOption[]` | —       |
| `value`     | `string`                   | —       |
| `onChange`  | `(value: string) => void`  | —       |
| `size`      | `"sm" \| "md" \| "lg"`     | `"md"`  |
| `fullWidth` | `boolean`                  | `false` |

**A11y**: `role="radiogroup"` + `role="radio"` com `aria-checked`.

## A11y geral

- Navbar: use `<nav>` (já incluso); marque ativos com `aria-current="page"`.
- Sidebar/BottomNavigation: keyboard accessible — Tab cycle entre items.
- Tabs: setas ←→ trocam tab quando focada.
- Breadcrumbs: separador (`/`) é decorativo (aria-hidden).
