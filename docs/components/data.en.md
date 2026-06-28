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

## Recap

| Component     | Use for                                    | Typical volume   |
| ------------- | ------------------------------------------ | ---------------- |
| `Table<T>`    | Compare records in columns                 | tens to hundreds |
| `VirtualList` | Scroll long fixed-height lists             | 500+ items       |
| `ListTile`    | A list row (icon + title + action)         | any              |
| `Accordion`   | On-demand expandable sections (FAQ, steps) | a few sections   |
| `Timeline`    | A sequence of events over time             | any              |

Key accessibility points:

- `Table` uses `<th scope="col">` (already included); `onRowClick` applies `role="button"` + `tabIndex={0}`.
- `VirtualList`: items outside the viewport are not rendered — `Ctrl+F` only finds the visible window.
- `Accordion`: ↑↓ switch the focused item, Home/End jump to the first/last.
- `Timeline`: semantic order via `<ol>`; each item is an `<li>`.

Related: [identity](./identity.md) (`Card flush` to host the `Table`) · [feedback](./feedback.md) (`Badge` inside cells) · [actions](./actions.md) (row buttons).
