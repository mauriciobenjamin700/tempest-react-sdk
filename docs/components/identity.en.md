# Identity & micro

**Identity** components represent _who_ or _what_ in the UI: the person behind an account (`Avatar`), a grouped, recognizable block of content (`Card`), and the semantic typography of a keyboard shortcut (`Kbd`). They're small, high-frequency pieces — they show up in lists, headers, feeds — so their consistency defines the app's "face".

Reach for this page when you need to **show** an entity or group content, not when you need an action ([actions](./actions.md)) or pure layout ([layout](./layout.md)).

## `Avatar`

> **When to use**: visually represent a user/entity in lists, comments, headers — with a photo when available and colored initials as fallback.

A user's photo with an automatic fallback to colored initials when there is no `src` or the image fails to load. Initials are derived from `name` (not from `alt`).

```tsx
<Avatar src={user.photo} name={user.name} alt={user.name} />;
<Avatar size="lg" status="online" name="Ann" />;
<Avatar name="John Smith" />; // fallback generates the initials "JS"
<Avatar name="John" status="busy" size="sm" />;
```

| Prop      | Type                                    | Default |
| --------- | --------------------------------------- | ------- |
| `src`     | `string`                                | —       |
| `alt`     | `string` (image alt text)               | —       |
| `name`    | `string` (drives the fallback initials) | `""`    |
| `size`    | `"xs" \| "sm" \| "md" \| "lg" \| "xl"`  | `"md"`  |
| `status`  | `"online" \| "offline" \| "busy"`       | —       |
| `onClick` | `() => void`                            | —       |

!!! warning "Initials come from `name`, not `alt`"
    The initials fallback is computed from `name`. If you pass only `alt`, the avatar shows `?` when the image fails. For a multi-word name it uses the first letter of the first and last term (`"John Smith"` → `"JS"`).

!!! tip "Always provide `alt` when there's a `src`"
    When `src` is set, `alt` is what screen readers announce. Describe the person (the name), not the media — avoid `"photo of…"`.

## `Card`

> **When to use**: group related content into a block with visual elevation — a list item, a dashboard panel, a container for a table.

A container with header slots (`title` + `actions`) and a `footer`.

```tsx
<Card title="Order #12345" actions={<Button variant="ghost">Edit</Button>}>
    Card content.
</Card>;

<Card elevation="raised" interactive onClick={() => navigate("/x")}>
    Clickable card with a hover effect.
</Card>;

<Card flush footer={<Pagination ... />}>
    <Table ... />
</Card>;
```

| Prop          | Type                                                | Default     |
| ------------- | --------------------------------------------------- | ----------- |
| `title`       | `ReactNode`                                         | —           |
| `actions`     | `ReactNode` (right slot of the header)              | —           |
| `footer`      | `ReactNode`                                         | —           |
| `elevation`   | `"flat" \| "default" \| "raised" \| "elevated"`     | `"default"` |
| `interactive` | `boolean` (cursor pointer + hover ring)             | `false`     |
| `flush`       | `boolean` (zero internal padding — to host a Table) | `false`     |

!!! tip "Use `flush` to host tables and lists"
    Cards have internal padding by default. When placing a `Table` or a list that already has its own margins, turn on `flush` so the content reaches the card edges without doubled padding.

!!! note "`interactive` makes the whole card a button"
    With `interactive`, the card gets `role="button"`, `tabIndex={0}`, and keyboard handling (Enter/Space). Avoid putting other clickable elements inside an interactive card — nested clicks compete for the same gesture and confuse keyboard navigation.

## `Kbd`

> **When to use**: display a key or combination (shortcuts, command-palette hints) with the look of a physical key.

A `<kbd>` styled for keyboard shortcuts.

```tsx
<p>Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> to open the command palette.</p>
<Kbd size="lg">⌘</Kbd>
```

| Prop   | Type                   | Default |
| ------ | ---------------------- | ------- |
| `size` | `"sm" \| "md" \| "lg"` | `"md"`  |

!!! tip "One `<Kbd>` per key"
    For combinations, repeat the component instead of merging it all into plain text: `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`. Each `<Kbd>` renders a semantic `<kbd>` element that screen readers announce individually.

## Recap

| Component | Use for                                      |
| --------- | -------------------------------------------- |
| `Avatar`  | Represent a user (photo or initials)         |
| `Card`    | Group related content into an elevated block |
| `Kbd`     | Display keys / keyboard shortcuts            |

Key accessibility points:

- `Avatar.alt` describes the user (the name), not the media; initials come from `name`.
- `Card` with `interactive` applies `role="button"` + keyboard (Enter/Space) — don't nest other clickables.
- `Kbd`: repeat one per key in combinations.

Related: [actions](./actions.md) (`Button` inside `Card.actions`) · [data](./data.md) (`Card flush` hosting a `Table`) · [layout](./layout.md) (arranging cards in a grid/stack).
