# Overlay

**Overlay** components interrupt the main flow to focus attention on an isolated task — they appear _on top of_ the page, with a backdrop, and capture focus until dismissed. Reach for them when the user needs to deal with something (edit a record, confirm, pick an option) without losing the background context, yet can't ignore it either.

The three share the same engine (portal to `document.body` + backdrop + Esc + focus trap + scroll lock) and differ only in anchoring and purpose:

- `Modal` — centered, general purpose.
- `Drawer` — anchored to an edge, side panel.
- `BottomSheet` — anchored to the bottom, mobile-first.

!!! info "Everything is portaled"
    All three render into `document.body`, outside the tree of the component that opens them. This avoids ancestor `overflow: hidden` / `z-index` issues, but means parent-scoped styles don't leak into the overlay.

## `Modal`

> **When to use**: a central flow that pauses context — create/edit a record, a short wizard, a form that demands full attention.

Portal + backdrop + Esc + focus trap + scroll lock.

```tsx
const [open, setOpen] = useState(false);

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Edit profile"
  size="md"
  footer={
    <FormActions>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={save}>Save</Button>
    </FormActions>
  }
>
  <ProfileForm />
</Modal>;
```

| Prop                 | Type                                             | Default |
| -------------------- | ------------------------------------------------ | ------- |
| `open`               | `boolean`                                        | —       |
| `onClose`            | `() => void`                                     | —       |
| `title`              | `ReactNode`                                      | —       |
| `size`               | `"sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "3xl"` | `"md"`  |
| `footer`             | `ReactNode`                                      | —       |
| `fullscreen`         | `boolean` (fills 100dvh regardless of size)      | `false` |
| `fullscreenOnMobile` | `boolean` (becomes fullscreen below 640px)       | `false` |
| `dismissOnBackdrop`  | `boolean`                                        | `true`  |
| `dismissOnEsc`       | `boolean`                                        | `true`  |

!!! tip "Safe-area in fullscreen"
    In `fullscreen` the Modal applies `env(safe-area-inset-*)` on all edges, respecting notch and gesture bar. Use `fullscreenOnMobile` so a dense modal becomes full-screen below 640px instead of cramming into a tiny card.

**A11y**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` when `title`
is a string. Focus is trapped inside the dialog and returns to the trigger on
close.

## `Drawer`

> **When to use**: a persistent side panel that complements the background screen — filters, an item's details, secondary navigation. It hugs an edge instead of centering.

Side drawer. `placement: left/right/top/bottom`. Auto-switches to a bottom-sheet
on mobile via `mobilePlacement`.

```tsx
<Drawer
  open={open}
  onClose={() => setOpen(false)}
  placement="right"
  mobilePlacement="bottom" // becomes a bottom sheet on mobile
  title="Filters"
  showHandle // visual drag indicator when it becomes a bottom-sheet
  footer={<Button onClick={apply}>Apply</Button>}
>
  <FilterForm />
</Drawer>
```

| Prop              | Type                                                       | Default   |
| ----------------- | ---------------------------------------------------------- | --------- |
| `open`            | `boolean`                                                  | —         |
| `onClose`         | `() => void`                                               | —         |
| `placement`       | `"left" \| "right" \| "top" \| "bottom"`                   | `"right"` |
| `mobilePlacement` | `"left" \| "right" \| "top" \| "bottom"` (mobile override) | —         |
| `title`           | `ReactNode`                                                | —         |
| `footer`          | `ReactNode`                                                | —         |
| `showHandle`      | `boolean` (bottom-sheet style drag indicator)              | `false`   |
| `hideCloseButton` | `boolean`                                                  | `false`   |
| `closeOnBackdrop` | `boolean`                                                  | `true`    |
| `closeOnEsc`      | `boolean`                                                  | `true`    |

!!! note "Drawer sizes to its content, not a `size` prop"
    Unlike `Modal`, `Drawer` has no `size` prop — its width/height follows the content (and the placement CSS). For a mobile-first full-width, height-capped panel, prefer `BottomSheet` or `mobilePlacement="bottom"`.

## `BottomSheet`

> **When to use**: mobile-first actions or choices that rise from the bottom — a share menu, an item's options, a short picker. It's the native iOS/Android pattern.

A modal anchored to the bottom edge — slide-up via animation. Optimized for
mobile.

```tsx
<BottomSheet open={open} onClose={() => setOpen(false)} title="Share">
  <Stack gap={3}>
    <Button leftIcon={<MessageCircle />}>WhatsApp</Button>
    <Button leftIcon={<Mail />}>Email</Button>
    <Button leftIcon={<Link />}>Copy link</Button>
  </Stack>
</BottomSheet>
```

| Prop                | Type         | Default |
| ------------------- | ------------ | ------- |
| `open`              | `boolean`    | —       |
| `onClose`           | `() => void` | —       |
| `title`             | `ReactNode`  | —       |
| `showHandle`        | `boolean`    | `true`  |
| `dismissOnBackdrop` | `boolean`    | `true`  |
| `dismissOnEsc`      | `boolean`    | `true`  |

!!! tip "Automatic safe-area"
    `BottomSheet` adds `padding-bottom` respecting `env(safe-area-inset-bottom)`, so controls aren't hidden behind the gesture bar on modern iPhones/Androids.

**Difference vs `Drawer`**: BottomSheet is always slide-up + max-height 90dvh + a
drag handle. Use `Drawer` when you need a variable placement (side/top) or
different behavior between desktop and mobile.

!!! warning "Be careful turning off `closeOnBackdrop`/`dismissOnBackdrop`"
    Disabling backdrop or Esc dismissal traps the user in the overlay until the task is done. Do this only for truly critical forms (data loss) — otherwise always offer a clear exit, or keyboard navigation becomes a trap.

## `ModalsManager`

> **When to use**: when you want to open modals and confirmations
> **imperatively** — straight from a handler, without wiring a `<Modal open={...}>`
> controlled by local state everywhere. Ideal for delete confirmations and
> one-off dialogs.

`<ModalsProvider>` mounts once near the root and manages a stack of modals;
`useModals()` exposes the imperative API over the existing `Modal` and
`ConfirmDialog` components.

```tsx
import { ModalsProvider, useModals, Button } from "tempest-react-sdk";

// app root
<ModalsProvider>
  <App />
</ModalsProvider>;

// in any component below the provider
function DeleteButton({ id }: { id: string }) {
  const modals = useModals();
  return (
    <Button
      variant="danger"
      onClick={() =>
        modals.confirm({
          title: "Delete item",
          message: "This action cannot be undone. Continue?",
          confirmLabel: "Delete",
          danger: true,
          onConfirm: async () => {
            await fetch(`/api/items/${id}`, { method: "DELETE" });
          },
        })
      }
    >
      Delete
    </Button>
  );
}
```

| `useModals()` | Signature                                  | What it does                            |
| ------------- | ------------------------------------------ | --------------------------------------- |
| `open`        | `(options: OpenModalOptions) => string`    | Pushes a content modal; returns the id. |
| `confirm`     | `(options: ConfirmModalOptions) => string` | Pushes a `ConfirmDialog`; returns the id. |
| `close`       | `(id: string) => void`                     | Removes the modal with that id.         |
| `closeAll`    | `() => void`                               | Removes every modal from the stack.     |

!!! info "Built on the existing components"
    `open` renders a `Modal` and `confirm` renders a `ConfirmDialog` — you inherit
    focus trap, scroll lock, Esc and backdrop with zero setup. `onConfirm` can be
    `async`: the dialog shows `loading` until the promise resolves and closes
    itself when it's done.

!!! warning "Needs `<ModalsProvider>` above"
    `useModals()` throws if called outside a `<ModalsProvider>`. Mount the provider
    once near the app root.

## General A11y

- **Focus trap**: Tab cycles only inside the dialog. Restores focus to the trigger on close.
- **Scroll lock**: `body.overflow = "hidden"` while open.
- **Esc** closes (`Modal`/`BottomSheet`: `dismissOnEsc={false}`; `Drawer`: `closeOnEsc={false}`).
- **`aria-modal="true"`** tells screen readers the rest of the page is blocked.
- **Backdrop**: clicks close it (`Modal`/`BottomSheet`: `dismissOnBackdrop={false}`; `Drawer`: `closeOnBackdrop={false}`).

## Recap

| Component     | Anchoring       | Purpose                          | Dismiss props                      |
| ------------- | --------------- | -------------------------------- | ---------------------------------- |
| `Modal`       | centered        | central flows (create/edit)      | `dismissOnBackdrop`/`dismissOnEsc` |
| `Drawer`      | edge (variable) | persistent side panels           | `closeOnBackdrop`/`closeOnEsc`     |
| `BottomSheet` | bottom edge     | mobile-first actions (share)     | `dismissOnBackdrop`/`dismissOnEsc` |
| `ModalsManager` | stack (imperative) | open modals/confirmations from code | `useModals().close`/`closeAll`   |

For a pre-built destructive confirmation, use `ConfirmDialog` ([actions](./actions.md)), built on top of `Modal`. To open modals imperatively (no local state), use `<ModalsProvider>` + `useModals()`.

Related: [actions](./actions.md) (`ConfirmDialog`, buttons in the `footer`) · [inputs](./inputs.md) (forms inside the overlay) · [navigation](./navigation.md) (`Drawer` as secondary nav).
