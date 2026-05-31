# Identity & micro

Avatars, cards, kbd shortcuts.

## `Avatar`

A user's photo/initials.

```tsx
<Avatar src={user.photo} alt={user.name} />;
<Avatar size="lg" status="online" />;
<Avatar alt="John Smith" />; // fallback generates the initials "JS"
<Avatar alt="John" status="busy" size="sm" />;
```

| Prop | Type | Default |
| --- | --- | --- |
| `src` | `string` | — |
| `alt` | `string` (used to generate initials when `src` fails) | — |
| `size` | `"sm" \| "md" \| "lg"` (or a `number` in px) | `"md"` |
| `status` | `"online" \| "offline" \| "busy" \| "away"` | — |
| `shape` | `"circle" \| "square"` | `"circle"` |

**A11y**: `alt` is required when `src` is set.

## `Card`

A container with slots.

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

| Prop | Type | Default |
| --- | --- | --- |
| `title` | `ReactNode` | — |
| `actions` | `ReactNode` (right slot of the header) | — |
| `footer` | `ReactNode` | — |
| `elevation` | `"flat" \| "default" \| "raised" \| "elevated"` | `"default"` |
| `interactive` | `boolean` (cursor pointer + hover ring) | `false` |
| `flush` | `boolean` (zero internal padding — to host a Table) | `false` |

## `Kbd`

A `<kbd>` styled for keyboard shortcuts.

```tsx
<p>Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> to open the command palette.</p>
<Kbd size="lg">⌘</Kbd>
```

| Prop | Type | Default |
| --- | --- | --- |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` |

**A11y**: renders a semantic `<kbd>` — screen readers announce it correctly.

## General A11y

- Avatar: `alt` should describe the user (the name), not the photo ("photo of…").
- Card.interactive: applies `role="button"` + `tabIndex={0}` + keyboard handling (Enter/Space).
- Kbd: for combos, repeat the `<Kbd>` instead of plain text (`<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`).
