# Actions

**Action** components are where the user triggers something: click, pick from a list, confirm. They carry intent — a click changes data, navigates, or starts a flow. That's why this category groups both the direct trigger (`Button`) and the elements around an action: contextual hint (`Tooltip`), a set of secondary actions (`DropdownMenu`), an anchored panel (`Popover`), and the safeguard before something destructive (`ConfirmDialog`).

Reach for this page when you need the user to **do** something. For data entry (text, selection, dates) see [inputs](./inputs.md); to present collections, see [data](./data.md).

## `Button`

> **When to use**: the primary or secondary action of any screen — submit a form, open a modal, navigate. The default action trigger.

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

!!! warning "iconOnly needs an accessible label"
    `iconOnly` removes the visible text, so screen readers have nothing to announce. Always pass `aria-label` describing the action (`aria-label="Delete"`). Without it the button is a mute icon to assistive tech.

!!! tip "loading blocks double-clicks"
    `loading` disables the button and sets `aria-busy="true"` — it's the standard for async submits. Turn it on the moment you fire the request to avoid duplicate requests from repeated clicks.

## `Tooltip`

> **When to use**: give extra context to a control whose meaning isn't obvious — typically `iconOnly` buttons. Never for critical information.

A portaled hover tooltip. Shows on hover **and** on keyboard focus.

```tsx
<Tooltip content="Delete permanently" placement="bottom" openDelay={300}>
  <Button variant="danger" iconOnly aria-label="Delete">
    <Trash />
  </Button>
</Tooltip>
```

| Prop        | Type                                     | Default |
| ----------- | ---------------------------------------- | ------- |
| `content`   | `ReactNode`                              | —       |
| `placement` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` |
| `openDelay` | `number` (ms before showing)             | `150`   |
| `disabled`  | `boolean` (turn off, trigger unchanged)  | `false` |

!!! warning "Don't hide essential information in a tooltip"
    Touch users have no hover — they'll never see the content. A tooltip is reinforcement, not the only source of information needed to complete the task.

## `DropdownMenu`

> **When to use**: group secondary actions behind a single trigger ("More actions", a profile menu) when they don't fit the main bar.

A dropdown menu of actions. Keyboard nav (↑↓ Home End Esc). Each entry needs a stable `id` (used as the React key).

```tsx
<DropdownMenu
  trigger={<Button variant="ghost">More actions</Button>}
  items={[
    { type: "label", id: "h", label: "Account" },
    { type: "item", id: "edit", label: "Edit profile", onSelect: () => navigate("/profile") },
    { type: "separator", id: "s1" },
    { type: "item", id: "logout", label: "Sign out", onSelect: logout, danger: true },
  ]}
/>
```

| Entry type    | Fields                                                     |
| ------------- | ---------------------------------------------------------- |
| `"item"`      | `id`, `label`, `icon?`, `onSelect`, `disabled?`, `danger?` |
| `"label"`     | `id`, `label`                                              |
| `"separator"` | `id`                                                       |

Component props: `trigger` (`ReactElement`), `items` (`DropdownMenuEntry[]`), `placement` (`"bottom-start" \| "bottom-end" \| "top-start" \| "top-end"`, default `"bottom-start"`).

!!! note "Closes after selecting"
    Selecting an item fires `onSelect` and closes the menu. For a panel that stays open with multiple choices (checkboxes, filters), use `Popover` instead of `DropdownMenu`.

## `Popover`

> **When to use**: a floating panel with arbitrary content (filters, a mini-form, a preview) anchored to a trigger — when you need more than a list of actions.

A generic floating panel (anchor + outside-click + Esc dismiss). Works controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).

```tsx
<Popover
  open={open}
  onOpenChange={setOpen}
  placement="bottom"
  trigger={<Button>Filters</Button>}
>
  <Stack gap={3}>
    <Checkbox label="Active only" />
    <Checkbox label="Paid" />
    <Button onClick={() => setOpen(false)}>Apply</Button>
  </Stack>
</Popover>
```

| Prop                  | Type                                     | Default        |
| --------------------- | ---------------------------------------- | -------------- |
| `trigger`             | `ReactElement` (cloned with handlers)    | —              |
| `open`                | `boolean`                                | — (controlled) |
| `onOpenChange`        | `(open: boolean) => void`                | —              |
| `defaultOpen`         | `boolean` (uncontrolled usage)           | `false`        |
| `placement`           | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"`     |
| `closeOnEsc`          | `boolean`                                | `true`         |
| `closeOnOutsideClick` | `boolean`                                | `true`         |

!!! note "No collision detection"
    `Popover` doesn't reposition automatically when it hits the viewport edge. If you need automatic flip/shift, prefer `DropdownMenu` (simple list) or integrate Floating UI in your app.

## `ConfirmDialog`

> **When to use**: the last barrier before an irreversible or costly action (delete, overwrite, cancel). Always with `variant="danger"` when destructive.

A pre-built destructive prompt on top of [`Modal`](./overlay.md) (text + 2 buttons).

```tsx
<ConfirmDialog
  open={open}
  title="Delete user"
  description={`This action is permanent. Delete ${user.name}?`}
  confirmLabel="Yes, delete"
  cancelLabel="Cancel"
  variant="danger"
  loading={deleting}
  onConfirm={async () => {
    await deleteUser(user.id);
    setOpen(false);
  }}
  onCancel={() => setOpen(false)}
/>
```

| Prop           | Type                                            | Default       |
| -------------- | ----------------------------------------------- | ------------- |
| `open`         | `boolean`                                       | —             |
| `title`        | `ReactNode`                                     | —             |
| `description`  | `ReactNode`                                     | —             |
| `confirmLabel` | `string`                                        | `"Confirmar"` |
| `cancelLabel`  | `string`                                        | `"Cancelar"`  |
| `variant`      | `"primary" \| "danger"`                         | `"primary"`   |
| `loading`      | `boolean` (shows spinner + disables both)       | `false`       |
| `onConfirm`    | `() => void \| Promise<void>`                   | —             |
| `onCancel`     | `() => void`                                    | —             |

!!! tip "Control loading during the request"
    `onConfirm` accepts a promise, but `ConfirmDialog` doesn't manage the loading state itself — pass `loading={deleting}` driven by your own state to lock both buttons while the async action runs.

!!! info "Default labels are Portuguese"
    `confirmLabel`/`cancelLabel` default to `"Confirmar"`/`"Cancelar"`. Pass explicit English strings in EN-locale apps.

## Recap

| Component       | Use for                                         | Trigger     |
| --------------- | ----------------------------------------------- | ----------- |
| `Button`        | Fire the primary/secondary action               | click       |
| `Tooltip`       | Non-critical context on a control               | hover/focus |
| `DropdownMenu`  | A list of secondary actions (closes on pick)    | click       |
| `Popover`       | A floating panel with arbitrary content         | click       |
| `ConfirmDialog` | Confirm a destructive action before running it  | —           |

Key accessibility points:

- Destructive actions should use `variant="danger"`.
- `Button.loading` is the standard for async submits — it blocks double-clicks.
- Tooltips should not contain critical information (touch users don't see hover).
- `iconOnly` **requires** `aria-label`.

Related: [overlay](./overlay.md) (`ConfirmDialog` is built on `Modal`) · [inputs](./inputs.md) (data entry) · [feedback](./feedback.md) (toasts/alerts after the action).
