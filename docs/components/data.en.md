# Data

**Data** components present collections — many entities of the same type — in a
readable, navigable way. The choice depends on _how many_ items there are and
_how_ the user moves through them: compare fields side by side (`Table`), scroll
thousands of rows without choking (`VirtualList`), expand/collapse content
sections (`Accordion`), or follow a sequence of events over time (`Timeline`).

Reach for this page when you need to **list/compare** records. For a single
record use a [`Card`](./identity.md); for data entry, [inputs](./inputs.md).

## `Table<T>`

> **When to use**: compare structured records field by field in columns — orders, users, transactions. Typed by `T`, with per-column responsive priority and optional stack on mobile.

```tsx
const columns: TableColumn<Order>[] = [
  { key: "id", header: "ID", align: "right", priority: "always" },
  { key: "customer", header: "Customer", priority: "always" },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total, "BRL"),
    priority: "always",
  },
  {
    key: "created_at",
    header: "Date",
    render: (row) => formatDate(row.created_at),
    priority: "tablet",
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    priority: "desktop",
  },
  {
    key: "actions",
    header: "",
    render: (row) => (
      <Button size="sm" onClick={() => edit(row.id)}>
        Edit
      </Button>
    ),
    priority: "desktop",
  },
];

<Table
  columns={columns}
  data={orders}
  rowKey={(row) => row.id}
  onRowClick={(row) => navigate(`/orders/${row.id}`)}
  stackOnMobile
  emptyMessage="No orders found."
/>;
```

| Prop            | Type                                           | Default                         |
| --------------- | ---------------------------------------------- | ------------------------------- |
| `columns`       | `TableColumn<T>[]`                             | —                               |
| `data`          | `T[]`                                          | —                               |
| `rowKey`        | `(row: T, index: number) => string \| number`  | —                               |
| `onRowClick`    | `(row: T) => void`                             | —                               |
| `emptyMessage`  | `ReactNode` (shown when `data` is empty)       | `"Nenhum registro encontrado."` |
| `stackOnMobile` | `boolean` (rows become label/value cards < md) | `false`                         |

`TableColumn<T>`:

| Field       | Type                                   | Notes                                             |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| `key`       | `string`                               | Identifier + default key (reads `row[key]`)       |
| `header`    | `ReactNode`                            | Column header; becomes `data-label` in stack mode |
| `render`    | `(row: T, index: number) => ReactNode` | Default = `row[key]`                              |
| `align`     | `"left" \| "right" \| "center"`        | Default `"left"`                                  |
| `priority`  | `"always" \| "tablet" \| "desktop"`    | `tablet`: hidden < md. `desktop`: hidden < lg.    |
| `width`     | `string \| number`                     | CSS width (`120px`, `20%`, `auto`)                |
| `className` | `string`                               | Extra class applied to that column's cells        |

!!! warning "There is no `loading` prop"
    `Table` does not render skeleton rows on its own. For a loading state, render your own skeleton conditionally _before_ the table, or pass placeholder rows in `data`. `emptyMessage` only covers the "valid query, zero results" case.

!!! info "Default `emptyMessage` is Portuguese"
    `emptyMessage` defaults to `"Nenhum registro encontrado."`. Pass an explicit English string in EN-locale apps.

**Responsive**:

- `priority="tablet"` → columns hidden at viewport `< md` (768px).
- `priority="desktop"` → hidden at `< lg` (1024px).
- `stackOnMobile` → at `< sm` (640px), each row becomes a label/value card.

## `VirtualList`

> **When to use**: scroll very long lists (500+ items) of **fixed-height** rows without flooding the DOM — chats, logs, infinite feeds.

Renders only the visible window + a small overscan buffer. Each row needs a fixed height (`itemHeight`); the container needs a height (`height`).

```tsx
<VirtualList
  items={messages}
  itemHeight={64}
  height={480}
  overscan={5}
  getKey={(message) => message.id}
  renderItem={(message) => <MessageRow message={message} />}
/>
```

| Prop         | Type                                           | Default |
| ------------ | ---------------------------------------------- | ------- |
| `items`      | `T[]`                                          | —       |
| `itemHeight` | `number` (fixed height per row, px)            | —       |
| `height`     | `number \| string` (container height)          | —       |
| `renderItem` | `(item: T, index: number) => ReactNode`        | —       |
| `overscan`   | `number` (items above/below the viewport)      | `4`     |
| `getKey`     | `(item: T, index: number) => string \| number` | `index` |

!!! warning "Fixed height is required"
    `VirtualList` assumes a constant `itemHeight` to compute the window. For variable-height rows use `@tanstack/react-virtual` or `react-window` — they solve the general case at the cost of more setup.

!!! note "Native search (Ctrl+F) only finds the visible window"
    Items outside the viewport are not in the DOM, so the browser's `Ctrl+F` won't find them. Below ~500 items, prefer normal rendering: the perf gain is negligible and you keep native search.

## `VirtualTable<T>`

> **When to use**: a table of **thousands of rows** in one scrollable grid — a statement, an audit log, a raw export. `Table` renders everything it is given and `DataTable` paginates to keep that count small; neither answers "show me all 40 000 rows at once".

It renders only the visible window, like `VirtualList`, while staying a real `<table>`: the browser aligns the columns, the header sticks, and assistive technology still sees a grid.

```tsx
<VirtualTable
  data={rows}
  columns={[
    { key: "id", header: "#", width: 80, sortable: true },
    { key: "name", header: "Name", width: 240, sortable: true },
    { key: "total", header: "Total", width: 120, align: "right", sortable: true },
  ]}
  rowHeight={40}
  height={480}
  rowKey={(row) => row.id}
  onRowClick={(row) => open(row.id)}
/>
```

| Prop            | Type                                            | Default                         |
| --------------- | ----------------------------------------------- | ------------------------------- |
| `data`          | `T[]`                                           | —                               |
| `columns`       | `VirtualTableColumn<T>[]`                       | —                               |
| `rowHeight`     | `number` (px, **uniform**)                      | —                               |
| `height`        | `number \| string` (viewport height)            | —                               |
| `overscan`      | `number`                                        | `4`                             |
| `rowKey`        | `(row: T, index: number) => string \| number`   | `index`                         |
| `initialSort`   | `{ key: keyof T; direction: "asc" \| "desc" }`  | —                               |
| `onRowClick`    | `(row: T, index: number) => void`               | —                               |
| `scrollToIndex` | `number`                                        | —                               |
| `caption`       | `ReactNode` (accessible name, visually hidden)  | —                               |
| `emptyMessage`  | `ReactNode`                                     | `"Nenhum registro encontrado."` |

Column: `{ key, header, render?, sortable?, align?, width? }`.

!!! info "Why it stays a `<table>`"
    The window is produced by **two spacer rows** — one above the visible slice, one below — instead of absolutely positioning rows. `position: absolute` would collapse table layout: every column width would have to be computed by hand, and the element would stop being a table for assistive technology. With spacer rows the browser keeps doing column layout and screen readers keep announcing a grid.

!!! tip "Real indices, not window indices"
    Because only a slice is in the DOM, `aria-rowcount` on the table and `aria-rowindex` on each row carry the **real** numbers. Without them a screen reader announces "row 3 of 20" while the user is on row 5003 of 40 000 — the detail almost every virtualized table gets wrong.

!!! warning "`rowHeight` must be uniform, and match what the CSS produces"
    It is what maps scroll offset to row index. If the CSS renders a different height than declared, the window comes out shifted. For variable heights use `@tanstack/react-virtual`.

!!! note "Set `width` on every column"
    Rows enter and leave the DOM as you scroll, so letting the browser size columns from whatever is rendered right now makes them jump mid-scroll. The component uses `table-layout: fixed` precisely so that works.

### `VirtualTable` or `DataTable`?

| You need…                                     | Use            |
| --------------------------------------------- | -------------- |
| Search + pagination, tens to hundreds of rows | `DataTable`    |
| A scrollable grid of thousands of rows        | `VirtualTable` |
| Full control of the markup, few rows          | `Table`        |

Both sort with the same comparator (`compareValues`), so "sorted" means the same thing in each — numbers numerically, dates by timestamp, strings via `localeCompare` with `numeric: true`.

## `ListTile`

> **When to use**: the canonical Material list row — an item with a leading slot (icon/avatar), a title with an optional subtitle, and a trailing slot (icon, switch, meta). Ideal for settings lists, contacts, or menus.

Renders as a static `<div>` by default; given an `onClick` it becomes a full-width, keyboard-accessible `<button>`.

```tsx
import { useState } from "react";
import { ListTile, Switch } from "tempest-react-sdk";
import { Bell } from "lucide-react";

function NotificationsRow() {
  const [enabled, setEnabled] = useState(true);

  return (
    <ListTile
      leading={<Bell size={20} />}
      title="Notifications"
      subtitle="Receive push alerts"
      trailing={
        <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      }
    />
  );
}
```

| Prop       | Type                                   | Default |
| ---------- | -------------------------------------- | ------- |
| `title`    | `ReactNode`                            | —       |
| `leading`  | `ReactNode` (left slot)                | —       |
| `subtitle` | `ReactNode` (secondary line)           | —       |
| `trailing` | `ReactNode` (right slot)               | —       |
| `onClick`  | `() => void` (turns the tile a button) | —       |
| `selected` | `boolean` (highlights the active row)  | `false` |
| `disabled` | `boolean` (dimmed, non-interactive)    | `false` |

!!! note "Button only when `onClick` is set"
    Without `onClick`, `ListTile` is a purely visual `<div>`. With `onClick`, it becomes a `<button>` with `aria-pressed` (when `selected`) and honors `disabled` — don't wrap it in another clickable element.

## `Accordion`

> **When to use**: condense sectionable content the user expands on demand — FAQs, long stepped forms, settings panels.

Single mode (default) or `multiple`. Controlled via `value` + `onChange`, or uncontrolled via `defaultValue`.

```tsx
<Accordion
  items={[
    { id: "1", title: "How do I cancel my subscription?", children: <p>...</p> },
    { id: "2", title: "What payment methods?", children: <p>...</p> },
  ]}
/>;

<Accordion multiple value={openIds} onChange={setOpenIds} items={faqItems} />;
```

| Prop           | Type                                 | Default |
| -------------- | ------------------------------------ | ------- |
| `items`        | `AccordionItem[]`                    | —       |
| `multiple`     | `boolean` (allow several open)       | `false` |
| `value`        | `string[]` (open ids, controlled)    | —       |
| `defaultValue` | `string[]` (initially open ids)      | `[]`    |
| `onChange`     | `(openIds: string[]) => void`        | —       |

`AccordionItem = { id, title, children, disabled? }`.

!!! note "Accessibility is built in"
    Headers are `<button aria-expanded>` and content gets `aria-hidden` when closed. ↑↓ arrows switch the focused item; Home/End jump to the first/last.

## `Timeline`

> **When to use**: show a sequence of events over time — order tracking, audit log, activity feed. Each entry has an optional colored marker, title, description and meta.

A vertical feed with colored markers. Renders as a semantic `<ol>` (each item is an `<li>`).

```tsx
<Timeline
  items={[
    { id: "1", title: "Order created", meta: "10:24", marker: "primary" },
    { id: "2", title: "Payment approved", meta: "10:25", marker: "success" },
    {
      id: "3",
      title: "Out for delivery",
      description: "Driver: John",
      meta: "11:00",
      marker: "warning",
    },
    { id: "4", title: "Delivered", meta: "12:30", marker: "success" },
  ]}
/>
```

| Prop        | Type                             | Default |
| ----------- | -------------------------------- | ------- |
| `items`     | `TimelineItem[]`                 | —       |
| `connector` | `boolean` (line between markers) | `true`  |

`TimelineItem = { id, title, description?, meta?, icon?, marker?: "primary" \| "success" \| "warning" \| "danger" \| "neutral" }`.

## `TreeView`

> **When to use it**: **hierarchical** data — a category tree, permissions per module, folders, an org chart. When the data is a flat list, `Table` or `ListTile` fit better.

Implements `role="tree"` with **roving tabindex**: exactly one row is tabbable and the arrow keys move focus inside the widget. That is what stops a 500-node tree from adding 500 stops to the page's tab order.

```tsx
import { TreeView, type TreeNode } from "tempest-react-sdk";

const permissions: TreeNode[] = [
  {
    id: "sales",
    label: "Sales",
    children: [
      { id: "sales.read", label: "View" },
      { id: "sales.write", label: "Edit" },
      { id: "sales.delete", label: "Delete", disabled: true },
    ],
  },
  { id: "settings", label: "Settings", children: [] },
  { id: "about", label: "About" },
];

export function RolePermissions() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <TreeView
      label="Permissions"
      nodes={permissions}
      defaultExpandedIds={["sales"]}
      selectedId={selected}
      onSelect={(node) => setSelected(node.id)}
    />
  );
}
```

| Prop                 | Type                        | Default | What it does                                                       |
| -------------------- | --------------------------- | ------- | ------------------------------------------------------------------ |
| `nodes`              | `TreeNode[]`                | —       | Root nodes.                                                        |
| `expandedIds`        | `string[]`                  | —       | Controlled expansion.                                              |
| `defaultExpandedIds` | `string[]`                  | `[]`    | Initial expansion (uncontrolled).                                  |
| `onExpandedChange`   | `(ids: string[]) => void`   | —       | Called on every expand/collapse.                                   |
| `selectedId`         | `string \| null`            | —       | Controlled selection.                                              |
| `defaultSelectedId`  | `string \| null`            | `null`  | Initial selection.                                                 |
| `onSelect`           | `(node: TreeNode) => void`  | —       | Called on select (click, `Enter` or `Space`).                        |
| `toggleOnSelect`     | `boolean`                   | `true`  | Selecting a branch also expands/collapses it.                      |
| `label`              | `string`                    | —       | Accessible name for the tree.                                      |

`TreeNode = { id, label, children?, icon?, disabled? }`.

**Keyboard**: `↓`/`↑` move · `→` expands (or descends into the first child) · `←` collapses (or walks to the parent) · `Home`/`End` first/last visible row · `Enter`/`Space` select.

!!! tip "`children: []` is an empty branch, not a leaf"
    The distinction matters: an empty folder should still show the chevron and announce `aria-expanded`. A leaf is a **missing** `children`.

!!! note "`toggleOnSelect={false}` when the branch is a valid choice"
    The default (`true`) mimics a file explorer: clicking the folder opens the folder. Pass `false` when the branch itself is selectable — a category that is also a destination, say.

!!! info "The chevron is not a button"
    It is decoration (`aria-hidden`): the row already carries `aria-expanded`, so a second focusable control there would only add screen-reader noise while duplicating an action the keyboard map has. Clicking it works (with the event stopped, so it toggles without selecting).

## `Sparkline`

> **When to use it**: show the **shape** of a series next to the number it explains — a table cell, a metric card, a list row. It is not a chart replacement: if the reader needs to read values off an axis, use [`LineChart`](../charts.md).

A sparkline is plain SVG on the root entry, **no recharts**. A trend column in a table should not oblige an app to install a whole charting library.

```tsx
import { formatCurrency, Sparkline, Table } from "tempest-react-sdk";

const products = [
  { name: "Pro plan", revenue: 48200, series: [12, 18, 15, 24, 22, 31, 29] },
  { name: "Base plan", revenue: 19400, series: [22, 19, 20, 17, 14, 13, 11] },
];

export function TrendByProduct() {
  return (
    <Table
      data={products}
      columns={[
        { key: "name", header: "Product" },
        {
          key: "series",
          header: "7 days",
          render: (row) => (
            <Sparkline data={row.series} label={`${row.name} trend`} />
          ),
        },
        { key: "revenue", header: "Revenue", render: (r) => formatCurrency(r.revenue) },
      ]}
      rowKey={(row) => row.name}
    />
  );
}
```

### Variants

```tsx
<Sparkline data={series} />                        {/* line (default) */}
<Sparkline data={series} variant="area" />         {/* line + washed fill */}
<Sparkline data={series} variant="bar" />          {/* one bar per point */}
```

| Prop             | Type                              | Default                     | What it does                                                    |
| ---------------- | --------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `data`           | `readonly number[]`               | —                           | The series, in order. Non-finite entries are dropped.            |
| `variant`        | `"line" \| "area" \| "bar"`       | `"line"`                    | Which mark to draw.                                              |
| `width`          | `number`                          | `88`                        | Drawing width in px.                                             |
| `height`         | `number`                          | `24`                        | Drawing height in px.                                            |
| `color`          | `string`                          | `var(--tempest-chart-1)`    | Any CSS colour.                                                  |
| `showEnd`        | `boolean`                         | `true` (except in `"bar"`)  | Marks the last point with a dot.                                 |
| `min` / `max`    | `number`                          | the series extremes         | Pins the value axis — this is what makes several rows comparable. |
| `valueFormatter` | `(value: number) => string`       | `String`                    | How to render a value in the accessible description.             |
| `label`          | `string`                          | generated description       | Accessible name.                                                 |

### Comparing rows requires a shared axis

By default each sparkline normalises against its own extremes. In a table column that is a trap: a row going from 2 to 4 and one going from 200 to 400 draw **exactly the same shape**.

```tsx
const ceiling = Math.max(...products.flatMap((p) => p.series));

<Sparkline data={row.series} min={0} max={ceiling} />;
```

!!! warning "Without `min`/`max` the shape is relative — never comparable"
    Pass both when sparklines are stacked. It is the most common mistake with this component, and it raises no warning at all: the charts look fine and lie.

### Accessibility

The component carries `role="img"` and an `aria-label` that **describes the series in words**: point count, direction, extremes and both ends.

```text
"7 pontos, subindo. Início 12, fim 29. Mínimo 12, máximo 31."
```

A sparkline has no axis and no legend to fall back on — without that sentence it is an unnamed image, and a screen reader reaches it and reads nothing. Pass `label` when the surrounding text already says what is plotted.

!!! tip "The shape is context, never the only path to the value"
    Always place the sparkline **next to the number** it annotates. It answers "is it going up?", not "by how much?".

!!! info "A series with holes does not blank the chart"
    A `NaN` inside a `d` attribute silently voids the whole path — the chart vanishes with no error. Non-finite values are filtered out before projection.

!!! note "A flat series is centred"
    A series with no variation is drawn in the middle of the box, not pinned to an edge. That is the honest reading of "it did not move", and it avoids dividing by a zero-height domain.

## Recap

| Component     | Use for                                    | Typical volume   |
| ------------- | ------------------------------------------ | ---------------- |
| `Table<T>`    | Compare records in columns                 | tens to hundreds |
| `VirtualList` | Scroll long fixed-height lists             | 500+ items       |
| `VirtualTable<T>` | Scrollable grid of rows in columns     | thousands of rows |
| `ListTile`    | A list row (icon + title + action)         | any              |
| `Accordion`   | On-demand expandable sections (FAQ, steps) | a few sections   |
| `Timeline`    | A sequence of events over time             | any              |
| `TreeView`    | Navigable hierarchy (categories, permissions) | tens to hundreds |
| `Sparkline`   | The shape of a series next to the number it explains | 5 to ~100 points |

Key accessibility points:

- `Table` uses `<th scope="col">` (already included); `onRowClick` applies `role="button"` + `tabIndex={0}`.
- `VirtualList`: items outside the viewport are not rendered — `Ctrl+F` only finds the visible window.
- `VirtualTable`: stays a real `<table>` (spacer rows instead of absolute positioning), with `aria-rowcount`/`aria-rowindex` carrying real indices rather than window indices; sortable headers expose `aria-sort`.
- `Accordion`: ↑↓ switch the focused item, Home/End jump to the first/last.
- `Timeline`: semantic order via `<ol>`; each item is an `<li>`.
- `Sparkline`: `role="img"` with a sentence describing direction, both ends and the extremes — with no axis or legend, it is the only reading available without sight.
- `TreeView`: `role="tree"` + roving tabindex (a single tab stop); `aria-level` reports depth and disabled nodes are skipped while navigating.

Related: [identity](./identity.md) (`Card flush` to host the `Table`) · [feedback](./feedback.md) (`Badge` inside cells) · [actions](./actions.md) (row buttons).
