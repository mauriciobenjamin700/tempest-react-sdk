# Status & feedback

Signaling state, success, error, activity. Spinners, skeletons, alerts, KPIs.

## `Alert`

An inline banner. Different from `Banner` (top-of-page) and `Toast` (transient).

```tsx
<Alert variant="success" appearance="soft" title="Saved">
  Your changes were applied successfully.
</Alert>;

<Alert
  variant="danger"
  appearance="outline"
  icon={<AlertCircle />}
  dismissible
  onDismiss={() => setOpen(false)}
>
  Failed to process payment.
</Alert>;
```

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `"neutral" \| "info" \| "success" \| "warning" \| "danger"` | `"info"` |
| `appearance` | `"soft" \| "solid" \| "outline"` | `"soft"` |
| `title` | `ReactNode` | — |
| `icon` | `ReactNode` | — |
| `action` | `ReactNode` | — |
| `dismissible` | `boolean` | `false` |
| `onDismiss` | `() => void` | — |

**A11y**: `role="status"` for info/success, `role="alert"` for warning/danger.

## `Banner`

Persistent, top-of-page. Use it for environment indicators, maintenance,
expiration.

```tsx
<Banner
  variant="warning"
  dismissible
  onDismiss={() => setOpen(false)}
  action={<Button size="sm">Renew</Button>}
>
  Your subscription expires in 3 days.
</Banner>
```

Same variants as Alert.

## `Badge`

Status pill — not removable.

```tsx
<Badge>Default</Badge>
<Badge variant="success">Paid</Badge>
<Badge variant="danger" appearance="solid">Overdue</Badge>
<Badge variant="warning" appearance="outline" shape="square">Pending</Badge>
<Badge variant="info" dot>3</Badge>
```

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `appearance` | `"soft" \| "solid" \| "outline"` | `"soft"` |
| `shape` | `"pill" \| "square"` | `"pill"` |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` |
| `dot` | `boolean` (status indicator + number) | `false` |

## `Tag`

A removable chip. Use it for filter tokens, applied filters, selected entities.

```tsx
<Tag onRemove={() => removeFilter("sp")} variant="primary">São Paulo</Tag>
<Tag size="sm">In stock</Tag>
```

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` |
| `onRemove` | `() => void` | — |
| `removeLabel` | `string` (a11y) | `"Remover"` |

## `Stat`

A KPI card for dashboards.

```tsx
<Stat
  label="Revenue"
  value="R$ 12,345"
  delta="+12.4%"
  hint="vs. last month"
  icon={<TrendingUp />}
/>;

<Stat label="Sessions" value="1.2k" delta="-3%" hint="last 7 days" />;
<Stat label="NPS" value="78" delta="0" trend="flat" />;
```

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `ReactNode` | — |
| `value` | `ReactNode` | — |
| `delta` | `ReactNode` | — |
| `trend` | `"up" \| "down" \| "flat"` | inferred from `+`/`-` in the delta string |
| `hint` | `ReactNode` | — |
| `icon` | `ReactNode` | — |

## `Progress`

Progress bar.

```tsx
<Progress value={uploadProgress} max={100} variant="primary" />;
<Progress value={100} variant="success" />;
<Progress indeterminate variant="primary" />;
```

| Prop | Type | Default |
| --- | --- | --- |
| `value` | `number` | — |
| `max` | `number` | `100` |
| `variant` | `"primary" \| "success" \| "danger"` | `"primary"` |
| `indeterminate` | `boolean` | `false` |

## `Spinner`

A generic loader.

```tsx
<Spinner />;
<Spinner size="lg" />;
<Center minHeight="50vh">
  <Spinner size="xl" />
</Center>;
```

| Prop | Type | Default |
| --- | --- | --- |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"` |

## `Skeleton`

A placeholder with shimmer while data loads.

```tsx
{
  loading ? (
    <Stack gap={2}>
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rect" height={120} />
    </Stack>
  ) : (
    <ActualContent />
  );
}
<Skeleton variant="circle" width={40} height={40} />;
```

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `"rect" \| "text" \| "circle"` | `"rect"` |
| `width` | `number \| string` | `"100%"` |
| `height` | `number \| string` | — |

## `Toast`

Transient notifications. Set up via `ToastProvider` + use via `useToast()`.

```tsx
// app root
<ToastProvider position="top-right" defaultDuration={4000}>
  <App />
</ToastProvider>;

// components
const toast = useToast();
toast.success("Saved");
toast.error("Failed to process payment", { duration: 8000 });
toast.show({ title: "Sync", description: "In progress…", variant: "info" });
```

| `ToastApi` | Signature |
| --- | --- |
| `show` | `(options: ToastOptions) => string` (returns id) |
| `success` | `(description, options?) => string` |
| `error` | `(description, options?) => string` |
| `warning` | `(description, options?) => string` |
| `info` | `(description, options?) => string` |
| `dismiss` | `(id: string) => void` |

`ToastProvider.position`: `"top-right"` (default), `"top-left"`, `"top-center"`,
`"bottom-right"`, `"bottom-left"`, `"bottom-center"`.

**Safe-area aware**.

## `EmptyState`

A centered "nothing here".

```tsx
<EmptyState
  icon={<InboxIcon />}
  title="No orders"
  description="When your customers place orders, they show up here."
  action={<Button leftIcon={<Plus />}>New order</Button>}
/>
```

## `ErrorState`

A failure with a retry button.

```tsx
<ErrorState title="Couldn't load" description={String(error)} onRetry={refetch} />
```

## General A11y

- `Alert`/`Banner` with the `warning`/`danger` variant use `role="alert"` (announced immediately).
- The `Toast` container is `aria-live="polite"` + `aria-atomic="true"`.
- `Spinner`/`Progress.indeterminate` add `aria-busy="true"`.
- `Skeleton` is decorative — it doesn't announce (`aria-hidden`).
- `Stat.value` with tabular-nums aligns numeric values in columns.
