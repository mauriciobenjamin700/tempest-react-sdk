# Actions

Buttons, tooltips, menus, confirmation overlays.

## `Button`

Primary button with variants, sizes, and a loading state.

```tsx
import { Button } from "tempest-react-sdk";
import { Plus, Trash } from "lucide-react";

<Button>Save</Button>;
<Button variant="danger" leftIcon={<Trash size={16} />}>
  Delete
</Button>;
<Button variant="outline" loading>
  Loading…
</Button>;
<Button variant="link" rightIcon={<ArrowRight size={14} />}>
  See more
</Button>;
<Button iconOnly aria-label="Add">
  <Plus size={16} />
</Button>;
<Button fullWidth pill>
  CTA
</Button>;
```

| Prop        | Type                                                                                            | Default     |
| ----------- | ----------------------------------------------------------------------------------------------- | ----------- |
| `variant`   | `"primary" \| "secondary" \| "success" \| "danger" \| "soft" \| "outline" \| "ghost" \| "link"` | `"primary"` |
| `size`      | `"xs" \| "sm" \| "md" \| "lg" \| "xl"`                                                          | `"md"`      |
| `loading`   | `boolean`                                                                                       | `false`     |
| `fullWidth` | `boolean`                                                                                       | `false`     |
| `iconOnly`  | `boolean` (square, requires `aria-label`)                                                       | `false`     |
| `pill`      | `boolean` (pill border-radius)                                                                  | `false`     |
| `leftIcon`  | `ReactNode`                                                                                     | —           |
| `rightIcon` | `ReactNode`                                                                                     | —           |

**A11y**: `loading` disables the button + `aria-busy="true"`. `iconOnly` requires
`aria-label`.

## `Tooltip`

A portaled hover tooltip.

```tsx
<Tooltip content="Delete permanently" placement="bottom" delay={300}>
  <Button variant="danger" iconOnly aria-label="Delete">
    <Trash />
  </Button>
</Tooltip>
```

| Prop        | Type                                     | Default |
| ----------- | ---------------------------------------- | ------- |
| `content`   | `ReactNode`                              | —       |
| `placement` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` |
| `delay`     | `number` (ms)                            | `200`   |

**A11y**: uses `role="tooltip"` + `aria-describedby` on the trigger.

## `DropdownMenu`

A dropdown menu of actions. Keyboard nav (↑↓ Home End Esc).

```tsx
<DropdownMenu
  trigger={<Button variant="ghost">More actions</Button>}
  entries={[
    { type: "label", label: "Account" },
    { type: "item", label: "Edit profile", onSelect: () => navigate("/profile") },
    { type: "separator" },
    { type: "item", label: "Sign out", onSelect: logout, danger: true },
  ]}
/>
```

| Entry type    | Fields                                                            |
| ------------- | ----------------------------------------------------------------- |
| `"item"`      | `label`, `icon?`, `onSelect`, `disabled?`, `danger?`, `keepOpen?` |
| `"label"`     | `label`                                                           |
| `"separator"` | (none)                                                            |

**A11y**: `role="menu"` + `role="menuitem"`, focus trapping while open.

## `Popover`

A generic floating panel (anchor + outside-click + Esc dismiss).

```tsx
<Popover
  open={open}
  onOpenChange={setOpen}
  placement="bottom-start"
  trigger={<Button>Filters</Button>}
>
  <Stack gap={3}>
    <Checkbox label="Active only" />
    <Checkbox label="Paid" />
    <Button onClick={() => setOpen(false)}>Apply</Button>
  </Stack>
</Popover>
```

| Prop           | Type                                                                                                   | Default        |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| `open`         | `boolean`                                                                                              | — (controlled) |
| `onOpenChange` | `(open: boolean) => void`                                                                              | —              |
| `placement`    | `"top" \| "top-start" \| "top-end" \| "bottom" \| "bottom-start" \| "bottom-end" \| "left" \| "right"` | `"bottom"`     |
| `trigger`      | `ReactElement` (cloned with handlers)                                                                  | —              |

**A11y**: outside-click dismissal, `Escape` closes, optional focus trap.

## `ConfirmDialog`

A pre-built destructive prompt (Modal + 2 buttons).

```tsx
<ConfirmDialog
  open={open}
  title="Delete user"
  description={`This action is permanent. Delete ${user.name}?`}
  confirmLabel="Yes, delete"
  cancelLabel="Cancel"
  tone="danger"
  onConfirm={async () => {
    await deleteUser(user.id);
    setOpen(false);
  }}
  onCancel={() => setOpen(false)}
/>
```

| Prop           | Type                                                        | Default       |
| -------------- | ----------------------------------------------------------- | ------------- |
| `open`         | `boolean`                                                   | —             |
| `title`        | `ReactNode`                                                 | —             |
| `description`  | `ReactNode`                                                 | —             |
| `confirmLabel` | `string`                                                    | `"Confirmar"` |
| `cancelLabel`  | `string`                                                    | `"Cancelar"`  |
| `tone`         | `"default" \| "danger"`                                     | `"default"`   |
| `onConfirm`    | `() => void \| Promise<void>` (the button can show loading) | —             |
| `onCancel`     | `() => void`                                                | —             |

## General A11y

- Destructive actions should use `variant="danger"` or `tone="danger"`.
- `Button.loading` is the standard for async submits — it blocks double-clicks.
- Tooltips should not contain critical information (touch users don't see hover).
- DropdownMenu items with `keepOpen: true` don't close after a click — useful for checkboxes/filters.
