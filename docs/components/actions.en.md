# Actions

**Action** components are where the user triggers something: click, pick from a list, confirm. They carry intent — a click changes data, navigates, or starts a flow. That's why this category groups both the direct trigger (`Button`) and the elements around an action: contextual hint (`Tooltip`), a set of secondary actions (`DropdownMenu`), an anchored panel (`Popover`), and the safeguard before something destructive (`ConfirmDialog`).

Reach for this page when you need the user to **do** something. For data entry (text, selection, dates) see [inputs](./inputs.md); to present collections, see [data](./data.md).

## `Button`

<!-- gallery:buttons -->
[![Buttons in the gallery](../assets/gallery/buttons.webp)](../gallery.md)

*Section `buttons` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

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

## `FloatingActionButton`

<!-- gallery:material -->
[![Material (ListTile · FAB · Rail) in the gallery](../assets/gallery/material.webp)](../gallery.md)

*Section `material` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use**: the primary, persistent action of a screen (create, compose, add) that should always be reachable, floating over the content. Round when icon-only, or extended (pill) when given a `label`.

By default it is fixed to the bottom-right corner; pass `position="none"` to place it inline (e.g. inside a `NavigationRail`). Spreads all native `<button>` props (`onClick`, `disabled`, etc.).

```tsx
import { FloatingActionButton } from "tempest-react-sdk";
import { Plus } from "lucide-react";

<FloatingActionButton icon={<Plus />} aria-label="New" position="none" onClick={create} />;
<FloatingActionButton icon={<Plus />} label="New order" onClick={create} />;
```

| Prop       | Type                                        | Default          |
| ---------- | ------------------------------------------- | ---------------- |
| `icon`     | `ReactNode`                                 | —                |
| `label`    | `ReactNode` (present → extended FAB)         | —                |
| `position` | `"bottom-right" \| "bottom-left" \| "none"` | `"bottom-right"` |
| `size`     | `"sm" \| "md" \| "lg"`                      | `"md"`           |
| `variant`  | `"primary" \| "surface"`                    | `"primary"`      |
| ...        | All `HTMLButtonElement` attributes          | —                |

!!! warning "An icon-only FAB needs `aria-label`"
    Without a visible `label`, the round FAB has no accessible name. Always pass `aria-label` describing the action (`aria-label="New"`); when a `label` is present, it already serves as the name.

## `Tooltip`

<!-- gallery:navigation -->
[![AppBar · Tabs · Tooltip · Drawer in the gallery](../assets/gallery/navigation.webp)](../gallery.md)

*Section `navigation` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use**: give extra context to a control whose meaning isn't obvious — typically `iconOnly` buttons. Never for critical information.

A portaled hover tooltip. Shows on hover **and** on keyboard focus.

```tsx
import { Button, Tooltip } from "tempest-react-sdk";
import { Trash } from "lucide-react";

export function ExcluirComDica() {
    return (
        <Tooltip content="Delete permanently" placement="bottom" openDelay={300}>
            <Button variant="danger" iconOnly aria-label="Delete">
                <Trash size={16} />
            </Button>
        </Tooltip>
    );
}
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

<!-- gallery:overlays -->
[![Popover · Dropdown · HoverCard in the gallery](../assets/gallery/overlays.webp)](../gallery.md)

*Section `overlays` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use**: group secondary actions behind a single trigger ("More actions", a profile menu) when they don't fit the main bar.

A dropdown menu of actions. Keyboard nav (↑↓ Home End Esc). Each entry needs a stable `id` (used as the React key).

```tsx
import { Button, DropdownMenu } from "tempest-react-sdk";

export function MaisAcoes({
    navigate,
    logout,
}: {
    navigate: (to: string) => void;
    logout: () => void;
}) {
    return (
        <DropdownMenu
            trigger={<Button variant="ghost">More actions</Button>}
            items={[
                { type: "label", id: "h", label: "Account" },
                {
                    type: "item",
                    id: "edit",
                    label: "Edit profile",
                    onSelect: () => navigate("/profile"),
                },
                { type: "separator", id: "s1" },
                { type: "item", id: "logout", label: "Sign out", onSelect: logout, danger: true },
            ]}
        />
    );
}
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
import { useState } from "react";
import { Button, Checkbox, Popover, Stack } from "tempest-react-sdk";

export function Filtros() {
    const [open, setOpen] = useState(false);

    return (
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
    );
}
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

<!-- gallery:modal -->
[![Modal & Toast in the gallery](../assets/gallery/modal.webp)](../gallery.md)

*Section `modal` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use**: the last barrier before an irreversible or costly action (delete, overwrite, cancel). Always with `variant="danger"` when destructive.

A pre-built destructive prompt on top of [`Modal`](./overlay.md) (text + 2 buttons).

```tsx
import { useState } from "react";
import { ConfirmDialog } from "tempest-react-sdk";

export function ExcluirUsuario({
    user,
    deleteUser,
}: {
    user: { id: string; name: string };
    deleteUser: (id: string) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    return (
        <ConfirmDialog
            open={open}
            title="Delete user"
            description={`This cannot be undone. Delete ${user.name}?`}
            confirmLabel="Yes, delete"
            cancelLabel="Cancel"
            variant="danger"
            loading={deleting}
            onConfirm={async () => {
                setDeleting(true);
                await deleteUser(user.id);
                setDeleting(false);
                setOpen(false);
            }}
            onCancel={() => setOpen(false)}
        />
    );
}
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

## `InstallButton`

<!-- gallery:pwa -->
[![PWA: Install · Push in the gallery](../assets/gallery/pwa.webp)](../gallery.md)

*Section `pwa` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

PWA install button wired to the `beforeinstallprompt` event ([`useBeforeInstallPrompt`](../hooks.md)). **Renders `null`** when the app can't be installed — no prompt captured yet, already installed, or running standalone — so you can drop it in without guarding visibility. Inherits every [`Button`](#button) prop.

```tsx
import { InstallButton } from "tempest-react-sdk";
import { Download } from "lucide-react";

<InstallButton variant="primary" leftIcon={<Download size={18} />} />;
```

| Prop       | Type                                                       | Default          |
| ---------- | ---------------------------------------------------------- | ---------------- |
| `label`    | `ReactNode`                                                | `"Instalar app"` |
| `onResult` | `(o: "accepted" \| "dismissed" \| "unsupported") => void`  | —                |
| …          | all `Button` props (`variant`, `size`, `leftIcon`)         | —                |

## `InstallBanner`

Dismissible bottom banner inviting the user to install the PWA. Shows only when a prompt was captured and the app is **not** already standalone; on platforms that never fire `beforeinstallprompt` (iOS Safari) it stays hidden — surface manual instructions elsewhere. `storageKey` remembers the dismissal across reloads.

```tsx
import { InstallBanner } from "tempest-react-sdk";

export function Instalar() {
    return (
        <InstallBanner
            title="Install the app"
            description="Offline access and a home-screen shortcut."
            storageKey="meu-app:install-dismissed"
        />
    );
}
```

| Prop           | Type        | Default           |
| -------------- | ----------- | ----------------- |
| `title`        | `ReactNode` | `"Instale o app"` |
| `description`  | `ReactNode` | —                 |
| `installLabel` | `string`    | `"Instalar"`      |
| `dismissLabel` | `string`    | `"Dispensar"`     |
| `icon`         | `ReactNode` | —                 |
| `storageKey`   | `string`    | — (session)       |
| `onResult`     | `(o) => void` | —               |

## Recap

| Component       | Use for                                         | Trigger     |
| --------------- | ----------------------------------------------- | ----------- |
| `Button`        | Fire the primary/secondary action               | click       |
| `FloatingActionButton` | Floating, persistent primary action      | click       |
| `InstallButton` | Install the PWA (hides when not applicable)     | click       |
| `InstallBanner` | Dismissible invite to install the PWA           | click       |
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
