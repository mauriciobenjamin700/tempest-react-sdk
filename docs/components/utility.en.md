# Utility & headless

Small, focused components: some render bits of UI (`Money`, `RelativeTime`, `CopyButton`), others are **headless** — they drive behavior/logic without dictating the visuals (`Portal`, `ClickOutside`, `For`). All imported from `tempest-react-sdk`.

## Display

### `CopyButton`

Button that copies a string to the clipboard and shows a transient "copied" state.

```tsx
import { CopyButton } from "tempest-react-sdk";

<CopyButton value="npm i tempest-react-sdk" />;

<CopyButton value={token} timeout={3000} onCopied={() => toast("Token copied")}>
  Copy token
</CopyButton>;
```

| Prop       | Type          | Default             | Notes                                                            |
| ---------- | ------------- | ------------------- | ---------------------------------------------------------------- |
| `value`    | `string`      | —                   | Text written to the clipboard.                                   |
| `timeout`  | `number` (ms) | `2000`              | How long the "copied" state stays active.                        |
| `children` | `ReactNode`   | `"Copy"`/`"Copied"` | Fixed label in both states; without `children` the text toggles. |
| `onCopied` | `() => void`  | —                   | Called after a successful write.                                 |

Extends `ButtonHTMLAttributes`. Clipboard failures are silenced; the timer is cleared on unmount.

### `RelativeTime`

Renders a date as a relative string ("5 min ago") inside a semantic `<time>` element with a machine-readable `dateTime`.

```tsx
import { RelativeTime } from "tempest-react-sdk";

<RelativeTime date={post.createdAt} />; // pt-BR
<RelativeTime date={post.createdAt} locale="en" />;
```

| Prop     | Type                       | Default | Notes                     |
| -------- | -------------------------- | ------- | ------------------------- |
| `date`   | `Date \| string \| number` | —       | Instant to render.        |
| `locale` | `"pt" \| "en"`             | `"pt"`  | `"pt"` maps to `"pt-BR"`. |

Extends `HTMLAttributes<HTMLTimeElement>`.

### `Money`

Renders a monetary amount given **in cents** as a localized currency string inside a `<span>`.

```tsx
import { Money } from "tempest-react-sdk";

<Money cents={1990} />; // "R$ 19,90"
<Money cents={500} currency="USD" locale="en-US" />; // "$5.00"
```

| Prop       | Type     | Default   | Notes                                |
| ---------- | -------- | --------- | ------------------------------------ |
| `cents`    | `number` | —         | Amount in the smallest unit (cents). |
| `currency` | `string` | `"BRL"`   | ISO 4217 code.                       |
| `locale`   | `string` | `"pt-BR"` | BCP 47 locale used for formatting.   |

Extends `HTMLAttributes<HTMLSpanElement>`. Internally divides `cents` by 100 and uses `Intl.NumberFormat`.

### `TruncateText`

Clamps text to a fixed number of lines via CSS line-clamp, with an ellipsis on overflow.

```tsx
import { TruncateText } from "tempest-react-sdk";

<TruncateText lines={2}>{longDescription}</TruncateText>;
```

| Prop       | Type        | Default | Notes                                            |
| ---------- | ----------- | ------- | ------------------------------------------------ |
| `lines`    | `number`    | `1`     | Lines before clamping (`--tempest-clamp-lines`). |
| `children` | `ReactNode` | —       | Content to clamp.                                |

Extends `HTMLAttributes<HTMLDivElement>`.

### `VisuallyHidden`

Content hidden visually but available to screen readers — the `sr-only` pattern.

```tsx
import { VisuallyHidden } from "tempest-react-sdk";

<button>
  <Icon />
  <VisuallyHidden>Close</VisuallyHidden>
</button>;
```

| Prop | Type                          | Default  | Notes                        |
| ---- | ----------------------------- | -------- | ---------------------------- |
| `as` | `keyof JSX.IntrinsicElements` | `"span"` | Intrinsic element to render. |

Extends `HTMLAttributes<HTMLElement>`.

---

## Headless / logical

No CSS of their own: they encapsulate behavior and let you supply the markup.

### `Portal`

Renders its children into a different part of the DOM tree via a React portal — ideal for overlays that must escape `overflow`/stacking contexts.

```tsx
import { Portal } from "tempest-react-sdk";

<Portal>
  <div className="toast">Saved!</div>
</Portal>;

<Portal container={drawerRoot}>{menu}</Portal>;
```

| Prop        | Type              | Default         | Notes                                |
| ----------- | ----------------- | --------------- | ------------------------------------ |
| `children`  | `ReactNode`       | —               | Content rendered through the portal. |
| `container` | `Element \| null` | `document.body` | Target DOM node.                     |

!!! info "SSR-safe"
Renders `null` on the server and on the first client render; mounts the portal only after hydration.

### `ClickOutside`

Wraps its children in a `<div>` and fires `onOutside` when a `mousedown`/`touchstart` happens outside the subtree. Handy for dismissing popovers and menus.

```tsx
import { ClickOutside } from "tempest-react-sdk";

<ClickOutside onOutside={() => setOpen(false)}>
  <Menu />
</ClickOutside>;
```

| Prop        | Type                                        | Default | Notes                          |
| ----------- | ------------------------------------------- | ------- | ------------------------------ |
| `onOutside` | `(event: MouseEvent \| TouchEvent) => void` | —       | Called on outside interaction. |
| `children`  | `ReactNode`                                 | —       | Content inside the boundary.   |

Extends `HTMLAttributes<HTMLDivElement>` (props flow to the wrapper `<div>`).

### `ConditionalWrapper`

Wraps its children with `wrapper` only when `condition` is `true` — avoids duplicating the subtree just to add an optional wrapper (link, tooltip, boundary).

```tsx
import { ConditionalWrapper } from "tempest-react-sdk";

<ConditionalWrapper condition={Boolean(href)} wrapper={(children) => <a href={href}>{children}</a>}>
  <CardBody />
</ConditionalWrapper>;
```

| Prop        | Type                                 | Default | Notes                               |
| ----------- | ------------------------------------ | ------- | ----------------------------------- |
| `condition` | `boolean`                            | —       | When `true`, applies the `wrapper`. |
| `wrapper`   | `(children: ReactNode) => ReactNode` | —       | Wrapping function.                  |
| `children`  | `ReactNode`                          | —       | Content that may be wrapped.        |

### `For`

Typed, JSX-friendly list renderer with a fallback for the empty collection. The item type is inferred from `each`.

```tsx
import { For } from "tempest-react-sdk";

<For each={users} fallback={<p>No users</p>}>
  {(user, index) => (
    <li key={user.id}>
      {index + 1}. {user.name}
    </li>
  )}
</For>;
```

| Prop       | Type                                    | Default | Notes                          |
| ---------- | --------------------------------------- | ------- | ------------------------------ |
| `each`     | `readonly T[]`                          | —       | Collection to iterate.         |
| `children` | `(item: T, index: number) => ReactNode` | —       | Render per item.               |
| `fallback` | `ReactNode`                             | `null`  | Rendered when `each` is empty. |

### `ErrorText`

A form-field error message as `<p role="alert">`. Renders `null` when there are no children — place it unconditionally below a field and it only appears when an error is present.

```tsx
import { ErrorText } from "tempest-react-sdk";

<input aria-invalid={Boolean(error)} />
<ErrorText>{error}</ErrorText>;
```

| Prop       | Type        | Default | Notes                                           |
| ---------- | ----------- | ------- | ----------------------------------------------- |
| `children` | `ReactNode` | —       | Message; `null`/`""`/`false` → renders nothing. |

Extends `HTMLAttributes<HTMLParagraphElement>`. Styled with the `--tempest-danger` token.

---

## Media / content

### `Image`

`<img>` with native lazy loading and a one-shot fallback.

```tsx
import { Image } from "tempest-react-sdk";

<Image src={user.avatarUrl} fallback="/avatar-placeholder.png" alt={user.name} />;
```

| Prop       | Type      | Default | Notes                                        |
| ---------- | --------- | ------- | -------------------------------------------- |
| `src`      | `string`  | —       | Primary source.                              |
| `fallback` | `string`  | —       | Source swapped in once if the primary fails. |
| `alt`      | `string`  | —       | Alternative text (required).                 |
| `lazy`     | `boolean` | `true`  | `true` → `loading="lazy"`; `false` → eager.  |

Extends `ImgHTMLAttributes` (without `src`). The fallback is guarded so it cannot loop the `onError` handler.

### `DataList`

Generic, typed list rendering a `<ul>` with one `<li>` per item, with an empty slot.

```tsx
import { DataList } from "tempest-react-sdk";

<DataList
  items={notifications}
  keyExtractor={(n) => n.id}
  renderItem={(n) => <NotificationRow notification={n} />}
  empty={<p>Nothing new</p>}
/>;
```

| Prop           | Type                                           | Default | Notes                           |
| -------------- | ---------------------------------------------- | ------- | ------------------------------- |
| `items`        | `readonly T[]`                                 | —       | Collection to render.           |
| `renderItem`   | `(item: T, index: number) => ReactNode`        | —       | Contents of each `<li>`.        |
| `keyExtractor` | `(item: T, index: number) => string \| number` | index   | Stable key per item.            |
| `empty`        | `ReactNode`                                    | —       | Rendered when `items` is empty. |

Extends `HTMLAttributes<HTMLUListElement>`.

### `DescriptionList`

Semantic `<dl>` of term/description pairs, with token-based key/value styling.

```tsx
import { DescriptionList } from "tempest-react-sdk";

<DescriptionList
  items={[
    { term: "Order", description: "#1042" },
    { term: "Status", description: <Badge variant="success">Paid</Badge> },
    { term: "Total", description: <Money cents={1990} /> },
  ]}
/>;
```

| Prop    | Type                    | Default | Notes                |
| ------- | ----------------------- | ------- | -------------------- |
| `items` | `DescriptionListItem[]` | —       | `<dt>`/`<dd>` pairs. |

`DescriptionListItem = { term: ReactNode; description: ReactNode }`. Extends `HTMLAttributes<HTMLDListElement>`.

---

## Recap

- **Display**: `CopyButton` (clipboard + transient state), `RelativeTime` (relative `<time>`), `Money` (cents → currency), `TruncateText` (line-clamp), `VisuallyHidden` (sr-only).
- **Headless/logical**: `Portal` (SSR-safe), `ClickOutside`, `ConditionalWrapper`, `For` (typed list with fallback), `ErrorText` (field error `role="alert"`).
- **Media/content**: `Image` (lazy + fallback), `DataList` (generic `<ul>`), `DescriptionList` (`<dl>` term/value).
- "Display" and "content" components use `--tempest-*` tokens; the headless ones ship no CSS — you supply the markup.

## See also

- [Utilities](../utilities.md) — `Money`/`RelativeTime` are the component flavors of formatting helpers.
- [Data](./data.md) — `Table`/`VirtualList` for larger collections.
