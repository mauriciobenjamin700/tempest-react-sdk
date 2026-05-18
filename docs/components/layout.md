# Layout

Shell completo + primitivos de espaçamento + utilitários responsivos.

## `AppShell`

Composer: navbar + sidebar (desktop) / bottomNav (mobile) + main + footer responsivo.

```tsx
<AppShell
    navbar={<Navbar logo={<Brand />} actions={<UserMenu />} />}
    sidebar={<Sidebar items={...} value={tab} onChange={setTab} />}
    bottomNav={<BottomNavigation items={...} value={tab} onChange={setTab} />}
    footer={<Footer />}
    sidebarBreakpoint="md"
>
    <Page title="Dashboard">
        {content}
    </Page>
</AppShell>;
```

Comportamento responsivo:

- **>= `sidebarBreakpoint`**: navbar + sidebar + main + footer.
- **< `sidebarBreakpoint`**: navbar + main + bottomNav + footer (sidebar ocultado).

| Prop                | Tipo                           | Default |
| ------------------- | ------------------------------ | ------- |
| `navbar`            | `ReactNode`                    | —       |
| `sidebar`           | `ReactNode`                    | —       |
| `bottomNav`         | `ReactNode`                    | —       |
| `footer`            | `ReactNode`                    | —       |
| `sidebarBreakpoint` | `"sm" \| "md" \| "lg" \| "xl"` | `"md"`  |

## `Page`

Page wrapper com header (`eyebrow` + `title` + `description` + `actions`) + `toolbar` + `content` + `footer`.

```tsx
<Page
    eyebrow="Vendas"
    title="Pedidos"
    description="Acompanhe seus pedidos em tempo real"
    actions={
        <>
            <Button variant="ghost" leftIcon={<Download />}>Exportar</Button>
            <Button leftIcon={<Plus />}>Novo</Button>
        </>
    }
    toolbar={<OrderFilters />}
    footer={<Pagination ... />}
>
    <Table {...} />
</Page>;
```

| Prop          | Tipo        | Default |
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
<Container size="lg">
  <Page title="Settings">...</Page>
</Container>
```

| `size`   | Max-width |
| -------- | --------- |
| `"sm"`   | `640px`   |
| `"md"`   | `768px`   |
| `"lg"`   | `1024px`  |
| `"xl"`   | `1280px`  |
| `"full"` | `100%`    |

## `Stack`

Flex vertical ou horizontal com `gap`, `align`, `justify`, `wrap`. Aceita `ResponsiveValue` em `direction` e `gap`.

```tsx
<Stack direction="vertical" gap={4}>
  <Card>One</Card>
  <Card>Two</Card>
</Stack>;

<Stack direction={{ base: "vertical", md: "horizontal" }} gap={{ base: 2, md: 4 }}>
  <Card>Mobile stacks, desktop side-by-side</Card>
</Stack>;
```

| Prop        | Tipo                                                | Default      |
| ----------- | --------------------------------------------------- | ------------ |
| `direction` | `"vertical" \| "horizontal"` (ou `ResponsiveValue`) | `"vertical"` |
| `gap`       | `number \| string` (ou `ResponsiveValue`)           | `2` (8px)    |
| `align`     | `"start" \| "center" \| "end" \| "stretch"`         | —            |
| `justify`   | `"start" \| "center" \| "end" \| "between"`         | —            |
| `wrap`      | `boolean`                                           | `false`      |

`gap` numérico mapeia para escala 4px (`2 → 8px`, `4 → 16px`).

## `Grid`

CSS Grid wrapper.

```tsx
<Grid columns={3} gap={4}>
  <Card>1</Card>
  <Card>2</Card>
  <Card>3</Card>
</Grid>;

<Grid columns={{ base: 1, sm: 2, lg: 4 }} gap={3}>
  {items.map((it) => (
    <Stat key={it.id} {...it} />
  ))}
</Grid>;

<Grid columns="2fr 1fr" gap={6}>
  <Article />
  <Sidebar />
</Grid>;
```

| Prop      | Tipo                                      | Default |
| --------- | ----------------------------------------- | ------- |
| `columns` | `number \| string` (ou `ResponsiveValue`) | `2`     |
| `gap`     | `number \| string`                        | `4`     |

`columns` numérico → `repeat(N, minmax(0, 1fr))`. String passa direto pra `grid-template-columns`.

## `Divider`

Separador horizontal/vertical com label opcional.

```tsx
<Divider />;
<Divider variant="dashed" />;
<Divider orientation="vertical" />;
<Divider align="center">OU</Divider>;
```

| Prop          | Tipo                                   | Default        |
| ------------- | -------------------------------------- | -------------- |
| `orientation` | `"horizontal" \| "vertical"`           | `"horizontal"` |
| `variant`     | `"solid" \| "dashed" \| "dotted"`      | `"solid"`      |
| `align`       | `"start" \| "center" \| "end"` (label) | `"center"`     |

## `Spacer`

Flex push.

```tsx
<Stack direction="horizontal">
  <Button>Cancelar</Button>
  <Spacer />
  <Button variant="primary">Salvar</Button>
</Stack>
```

| Prop   | Tipo                   | Default  |
| ------ | ---------------------- | -------- |
| `axis` | `"both" \| "x" \| "y"` | `"both"` |

## `Center`

Centraliza children horizontal/vertical/ambos.

```tsx
<Center axis="both" minHeight="100vh">
  <Spinner />
</Center>
```

| Prop        | Tipo                                   | Default  |
| ----------- | -------------------------------------- | -------- |
| `axis`      | `"both" \| "horizontal" \| "vertical"` | `"both"` |
| `minHeight` | `number \| string`                     | —        |
| `fullWidth` | `boolean`                              | `true`   |

## `AspectRatio`

Preserva proporção pra media.

```tsx
<AspectRatio ratio={16 / 9}>
  <img src="/cover.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
</AspectRatio>;

<AspectRatio ratio={1}>
  <video src="/clip.mp4" autoPlay loop muted />
</AspectRatio>;
```

| Prop    | Tipo     | Default  |
| ------- | -------- | -------- |
| `ratio` | `number` | `16 / 9` |

Usa CSS `aspect-ratio` nativo. Compatível com todos navegadores modernos.

## `SafeArea`

Padding por edge usando `env(safe-area-inset-*)`.

```tsx
<SafeArea edges={["top", "bottom"]}>
  <App />
</SafeArea>
```

| Prop     | Tipo                                            | Default                           |
| -------- | ----------------------------------------------- | --------------------------------- |
| `edges`  | `("top" \| "right" \| "bottom" \| "left")[]`    | `["top","right","bottom","left"]` |
| `inline` | `boolean` (`display: contents` em vez de block) | `false`                           |

Componentes que já cuidam de safe-area automaticamente: `Navbar` (top), `BottomNavigation`/`BottomSheet` (bottom), `Modal.fullscreen` (todos), `Toast` (top+bottom).

## `<Show>` / `<Hide>`

Conditional render baseado em breakpoint. SSR-safe — primeiro render usa `xs` (mobile first), re-renderiza ao client.

```tsx
<Show above="md"><DesktopNav /></Show>
<Hide above="md"><MobileNav /></Hide>
<Show below="lg"><Banner>Promo</Banner></Show>
<Show only={["sm", "md"]}><TabletOnlyHint /></Show>
```

| Prop    | Tipo                              |
| ------- | --------------------------------- |
| `above` | `Breakpoint` (xs/sm/md/lg/xl/2xl) |
| `below` | `Breakpoint`                      |
| `only`  | `Breakpoint \| Breakpoint[]`      |

`only` sobrescreve `above`/`below` quando setado.

## Responsive values

`Stack.direction`, `Grid.columns`, `Form.layout` aceitam `ResponsiveValue<T>`:

```ts
type ResponsiveValue<T> = T | { base?: T; sm?: T; md?: T; lg?: T; xl?: T; "2xl"?: T };
```

Falls back para o último valor definido por breakpoint cascading.

## A11y geral

- `Page.title` é `<h1>` — apenas um por página para hierarquia correta.
- `AppShell` envolve em `<main>` semântico.
- `<Show>`/`<Hide>` renderizam `null` no servidor + ajustam no client (no SEO impact, primeira tinta pode flickerizar).
