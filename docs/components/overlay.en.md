# Overlay

Modals, drawers, bottom sheets. All portaled to `document.body`.

## `Modal`

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

| Prop | Type | Default |
| --- | --- | --- |
| `open` | `boolean` | — |
| `onClose` | `() => void` | — |
| `title` | `ReactNode` | — |
| `size` | `"sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "3xl"` | `"md"` |
| `footer` | `ReactNode` | — |
| `fullscreen` | `boolean` (fills 100dvh regardless of size) | `false` |
| `fullscreenOnMobile` | `boolean` (becomes fullscreen below 640px) | `false` |
| `dismissOnBackdrop` | `boolean` | `true` |
| `dismissOnEsc` | `boolean` | `true` |

**Safe-area**: in `fullscreen` it applies `env(safe-area-inset-*)` on all edges.

**A11y**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` when `title`
is a string.

## `Drawer`

Side drawer. `placement: left/right/top/bottom`. Auto-switches to a bottom-sheet
on mobile via `mobilePlacement`.

```tsx
<Drawer
  open={open}
  onClose={() => setOpen(false)}
  placement="right"
  mobilePlacement="bottom" // becomes a bottom sheet on mobile
  size="md"
  title="Filters"
  showHandle // visual drag indicator when placement="bottom"
>
  <FilterForm />
</Drawer>
```

| Prop | Type | Default |
| --- | --- | --- |
| `open` | `boolean` | — |
| `onClose` | `() => void` | — |
| `placement` | `"left" \| "right" \| "top" \| "bottom"` | `"right"` |
| `mobilePlacement` | `"left" \| "right" \| "top" \| "bottom"` (mobile override) | — |
| `size` | `"sm" \| "md" \| "lg" \| "xl"` | `"md"` |
| `title` | `ReactNode` | — |
| `showHandle` | `boolean` (drag indicator on the opposite edge) | `false` |

## `BottomSheet`

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

| Prop | Type | Default |
| --- | --- | --- |
| `open` | `boolean` | — |
| `onClose` | `() => void` | — |
| `title` | `ReactNode` | — |
| `showHandle` | `boolean` | `true` |
| `dismissOnBackdrop` | `boolean` | `true` |
| `dismissOnEsc` | `boolean` | `true` |

**Safe-area**: automatic padding-bottom.

**Difference vs `Drawer`**: BottomSheet is always slide-up + max-height 90dvh + a
drag handle. Use Drawer when you need a variable placement.

## General A11y

- **Focus trap**: Tab cycles only inside the dialog. Restores focus to the trigger on close.
- **Scroll lock**: `body.overflow = "hidden"` while open.
- **Esc** closes (override via `dismissOnEsc={false}`).
- **`aria-modal="true"`** tells screen readers the rest of the page is blocked.
- **Inert behavior**: backdrop clicks close it (override via `dismissOnBackdrop={false}` for critical forms).

## Usage patterns

- **Modal** — central flows that pause context (creating/editing records).
- **Drawer** — persistent side panels (filters, details).
- **BottomSheet** — mobile-first actions/choices (share, options).
- **ConfirmDialog** ([./actions.md](./actions.md)) — a specific destructive confirmation.
