# Data

Presenting lists and collections: tables, virtualized lists, accordions,
timelines.

## `Table<T>`

A typed table with declarative `columns` + responsive priority + optional stack
on mobile.

```tsx
const columns: TableColumn<Order>[] = [
  { key: "id", label: "ID", align: "right", priority: "always" },
  { key: "customer", label: "Customer", priority: "always" },
  {
    key: "total",
    label: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total, "BRL"),
    priority: "always",
  },
  {
    key: "created_at",
    label: "Date",
    render: (row) => formatDate(row.created_at),
    priority: "tablet",
  },
  {
    key: "status",
    label: "Status",
    render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    priority: "desktop",
  },
  {
    key: "actions",
    label: "",
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
  rows={orders}
  rowKey={(row) => row.id}
  onRowClick={(row) => navigate(`/orders/${row.id}`)}
  stackOnMobile
  loading={loading}
  emptyState={<EmptyState title="No orders" />}
/>;
```

| Prop | Type | Default |
| --- | --- | --- |
| `columns` | `TableColumn<T>[]` | — |
| `rows` | `T[]` | — |
| `rowKey` | `(row: T) => string \| number` | — |
| `onRowClick` | `(row: T) => void` | — |
| `loading` | `boolean` (shows skeleton rows) | `false` |
| `emptyState` | `ReactNode` | — |
| `stackOnMobile` | `boolean` (rows become label/value cards below the `sm` bp) | `false` |

`TableColumn<T>`:

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` | Identifier + default key for `keyof T` |
| `label` | `ReactNode` | Header |
| `render` | `(row: T) => ReactNode` | Default = `row[key as keyof T]` |
| `align` | `"left" \| "center" \| "right"` | Default `"left"` |
| `priority` | `"always" \| "tablet" \| "desktop"` | `tablet`: hidden < md. `desktop`: hidden < lg. |
| `width` | `string` | CSS width (`120px`, `20%`, `auto`) |

**Responsive**:

- `priority="tablet"` → columns hidden at viewport `< md` (768px).
- `priority="desktop"` → hidden at `< lg` (1024px).
- `stackOnMobile` → at `< sm` (640px), each row becomes a label/value card.

## `VirtualList`

Renders thousands of items without flooding the DOM. Supports dynamic height via
`ResizeObserver`.

```tsx
<VirtualList
  items={messages}
  estimatedItemHeight={64}
  overscan={5}
  renderItem={(message) => <MessageRow key={message.id} message={message} />}
/>
```

| Prop | Type | Default |
| --- | --- | --- |
| `items` | `T[]` | — |
| `renderItem` | `(item: T, index: number) => ReactNode` | — |
| `estimatedItemHeight` | `number` (px) | `48` |
| `overscan` | `number` (items above/below) | `3` |
| `gap` | `number` (px between items) | `0` |

**When to use**: lists with 500+ items. Below that the perf gain is negligible
and you lose native search (Ctrl+F).

## `Accordion`

Single/multiple mode, controlled/uncontrolled.

```tsx
<Accordion
  mode="single"
  items={[
    { key: "1", title: "How do I cancel my subscription?", content: <p>...</p> },
    { key: "2", title: "What payment methods?", content: <p>...</p> },
  ]}
/>;

<Accordion mode="multiple" value={open} onChange={setOpen} items={faqItems} />;
```

| Prop | Type | Default |
| --- | --- | --- |
| `items` | `AccordionItem[]` | — |
| `mode` | `"single" \| "multiple"` | `"single"` |
| `value` | `string \| string[]` (controlled) | — |
| `defaultValue` | `string \| string[]` | — |
| `onChange` | `(value) => void` | — |

`AccordionItem = { key, title, content, disabled? }`.

**A11y**: headers are `<button aria-expanded>`, content is `aria-hidden` when
closed.

## `Timeline`

A vertical feed with colored markers.

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

| Prop | Type | Default |
| --- | --- | --- |
| `items` | `TimelineItem[]` | — |
| `connector` | `boolean` (line between markers) | `true` |

`TimelineItem = { id, title, description?, meta?, icon?, marker?: "primary" \| "success" \| "warning" \| "danger" \| "neutral" }`.

## General A11y

- Table: uses `<th scope="col">` (already included). `onRowClick` applies `role="button"` + `tabIndex={0}`.
- VirtualList: non-visible items are not rendered — native search (Ctrl+F) only finds items in the viewport.
- Accordion: ↑↓ arrows switch the focused item, Home/End jump to the first/last.
- Timeline: semantic order via `<ol>`; each item is an `<li>`.
