# Dados

Apresentação de listas e coleções: tabelas, listas virtualizadas, accordions, timelines.

## `Table<T>`

Tabela tipada com `columns` declarativas + responsive priority + opcional stack em mobile.

```tsx
const columns: TableColumn<Order>[] = [
  { key: "id", label: "ID", align: "right", priority: "always" },
  { key: "customer", label: "Cliente", priority: "always" },
  {
    key: "total",
    label: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total, "BRL"),
    priority: "always",
  },
  {
    key: "created_at",
    label: "Data",
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
        Editar
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
  emptyState={<EmptyState title="Nenhum pedido" />}
/>;
```

| Prop            | Tipo                                                       | Default |
| --------------- | ---------------------------------------------------------- | ------- |
| `columns`       | `TableColumn<T>[]`                                         | —       |
| `rows`          | `T[]`                                                      | —       |
| `rowKey`        | `(row: T) => string \| number`                             | —       |
| `onRowClick`    | `(row: T) => void`                                         | —       |
| `loading`       | `boolean` (mostra skeleton rows)                           | `false` |
| `emptyState`    | `ReactNode`                                                | —       |
| `stackOnMobile` | `boolean` (rows viram cards label/value abaixo do `sm` bp) | `false` |

`TableColumn<T>`:

| Campo      | Tipo                                | Notas                                                      |
| ---------- | ----------------------------------- | ---------------------------------------------------------- |
| `key`      | `string`                            | Identificador + key padrão pra `keyof T`                   |
| `label`    | `ReactNode`                         | Cabeçalho                                                  |
| `render`   | `(row: T) => ReactNode`             | Default = `row[key as keyof T]`                            |
| `align`    | `"left" \| "center" \| "right"`     | Default `"left"`                                           |
| `priority` | `"always" \| "tablet" \| "desktop"` | `tablet`: escondida em < md. `desktop`: escondida em < lg. |
| `width`    | `string`                            | CSS width (`120px`, `20%`, `auto`)                         |

**Responsive**:

- `priority="tablet"` → colunas escondidas em viewport `< md` (768px).
- `priority="desktop"` → escondidas em `< lg` (1024px).
- `stackOnMobile` → no `< sm` (640px), cada row vira um card label/value.

## `VirtualList`

Renderiza milhares de items sem inundar o DOM. Suporta height dinâmico via `ResizeObserver`.

```tsx
<VirtualList
  items={messages}
  estimatedItemHeight={64}
  overscan={5}
  renderItem={(message) => <MessageRow key={message.id} message={message} />}
/>
```

| Prop                  | Tipo                                    | Default |
| --------------------- | --------------------------------------- | ------- |
| `items`               | `T[]`                                   | —       |
| `renderItem`          | `(item: T, index: number) => ReactNode` | —       |
| `estimatedItemHeight` | `number` (px)                           | `48`    |
| `overscan`            | `number` (items above/below)            | `3`     |
| `gap`                 | `number` (px entre items)               | `0`     |

**Quando usar**: listas com 500+ items. Abaixo disso o ganho de perf é negligível e perde-se busca nativa (Ctrl+F).

## `Accordion`

Single/multiple mode, controlled/uncontrolled.

```tsx
<Accordion
  mode="single"
  items={[
    { key: "1", title: "Como cancelo minha assinatura?", content: <p>...</p> },
    { key: "2", title: "Quais formas de pagamento?", content: <p>...</p> },
  ]}
/>;

<Accordion mode="multiple" value={open} onChange={setOpen} items={faqItems} />;
```

| Prop           | Tipo                              | Default    |
| -------------- | --------------------------------- | ---------- |
| `items`        | `AccordionItem[]`                 | —          |
| `mode`         | `"single" \| "multiple"`          | `"single"` |
| `value`        | `string \| string[]` (controlled) | —          |
| `defaultValue` | `string \| string[]`              | —          |
| `onChange`     | `(value) => void`                 | —          |

`AccordionItem = { key, title, content, disabled? }`.

**A11y**: cabeçalhos são `<button aria-expanded>`, conteúdo `aria-hidden` quando fechado.

## `Timeline`

Feed vertical com markers coloridos.

```tsx
<Timeline
  items={[
    { id: "1", title: "Pedido criado", meta: "10:24", marker: "primary" },
    { id: "2", title: "Pagamento aprovado", meta: "10:25", marker: "success" },
    {
      id: "3",
      title: "Saiu pra entrega",
      description: "Motorista: João",
      meta: "11:00",
      marker: "warning",
    },
    { id: "4", title: "Entregue", meta: "12:30", marker: "success" },
  ]}
/>
```

| Prop        | Tipo                            | Default |
| ----------- | ------------------------------- | ------- |
| `items`     | `TimelineItem[]`                | —       |
| `connector` | `boolean` (linha entre markers) | `true`  |

`TimelineItem = { id, title, description?, meta?, icon?, marker?: "primary" \| "success" \| "warning" \| "danger" \| "neutral" }`.

## A11y geral

- Table: use `<th scope="col">` (já incluso). `onRowClick` aplica `role="button"` + `tabIndex={0}`.
- VirtualList: items não visíveis não são renderizados — busca nativa (Ctrl+F) só encontra items na viewport.
- Accordion: setas ↑↓ trocam item focado, Home/End pulam pro primeiro/último.
- Timeline: ordem semântica via `<ol>`; cada item é `<li>`.
