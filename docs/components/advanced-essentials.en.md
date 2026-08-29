# Advanced: essentials

Toggles, label, expandable regions, interaction-triggered overlays and the command palette. The slice almost every screen reaches for.

## `Toggle`

<!-- gallery:form-primitives -->
[![Checkbox · Radio · Switch in the gallery](../assets/gallery/form-primitives.webp)](../gallery.md)

*Section `form-primitives` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

A two-state button — like a checkbox styled as a button. Controlled (`pressed` + `onPressedChange`) or uncontrolled (`defaultPressed`).

```tsx
import { Toggle } from "tempest-react-sdk";

<Toggle
  defaultPressed
  variant="outline"
  size="md"
  onPressedChange={(pressed) => console.log(pressed)}
>
  Bold
</Toggle>;
```

| Prop              | Type                         | Default     | Description                                      |
| ----------------- | ---------------------------- | ----------- | ------------------------------------------------ |
| `pressed`         | `boolean`                    | —           | Controlled state. When provided it is controlled |
| `defaultPressed`  | `boolean`                    | `false`     | Initial state for the uncontrolled variant       |
| `onPressedChange` | `(pressed: boolean) => void` | —           | Fired with the next state when activated         |
| `size`            | `"sm" \| "md" \| "lg"`       | `"md"`      | Visual size                                      |
| `variant`         | `"default" \| "outline"`     | `"default"` | Visual style                                     |

Remaining `<button>` props are forwarded.

!!! info "A11y"
    Renders a native `<button type="button">` exposing its state through `aria-pressed` and `data-state="on"|"off"`.

## `ToggleGroup` (+ `ToggleGroupItem`)

<!-- gallery:feedback-extra -->
[![Alert · Timeline · BottomSheet in the gallery](../assets/gallery/feedback-extra.webp)](../gallery.md)

*Section `feedback-extra` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

A set of toggles sharing selection state via context. `single` mode (`string` value) or `multiple` mode (`string[]` value).

```tsx
import { ToggleGroup, ToggleGroupItem } from "tempest-react-sdk";

<ToggleGroup type="single" defaultValue="left" onValueChange={(value) => console.log(value)}>
  <ToggleGroupItem value="left">Left</ToggleGroupItem>
  <ToggleGroupItem value="center">Center</ToggleGroupItem>
  <ToggleGroupItem value="right">Right</ToggleGroupItem>
</ToggleGroup>;
```

`ToggleGroup`:

| Prop            | Type                                  | Default    | Description                                              |
| --------------- | ------------------------------------- | ---------- | -------------------------------------------------------- |
| `type`          | `"single" \| "multiple"`              | `"single"` | `single` keeps one value; `multiple` keeps a set         |
| `value`         | `string \| string[]`                  | —          | Controlled value (`string` for single, `string[]` multi) |
| `defaultValue`  | `string \| string[]`                  | —          | Uncontrolled initial value                               |
| `onValueChange` | `(value: string \| string[]) => void` | —          | Fired with the next value                                |
| `children`      | `ReactNode`                           | —          | `ToggleGroupItem` children                               |

`ToggleGroupItem`:

| Prop       | Type        | Default | Description                        |
| ---------- | ----------- | ------- | ---------------------------------- |
| `value`    | `string`    | —       | Stable value identifying this item |
| `disabled` | `boolean`   | —       | Disables the item                  |
| `children` | `ReactNode` | —       | Item content                       |

!!! note "Single mode"
    In `single` mode, `onValueChange` receives `""` (empty string) when nothing is selected.

## `Label`

<!-- gallery:inputs-extra -->
[![Inputs avançados (Date · Pin · Slider) in the gallery](../assets/gallery/inputs-extra.webp)](../gallery.md)

*Section `inputs-extra` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

A form `<label>`. Associate it with a control via `htmlFor`. When `required`, a decorative asterisk (`aria-hidden`) is appended.

```tsx
import { Label } from "tempest-react-sdk";

<Label htmlFor="email" required>
  Email
</Label>;
```

| Prop       | Type      | Default | Description                                                  |
| ---------- | --------- | ------- | ------------------------------------------------------------ |
| `required` | `boolean` | `false` | Appends a danger-colored asterisk marking the field required |

Remaining `<label>` props (incl. `htmlFor`) are forwarded.

## `Collapsible`

<!-- gallery:disclosure -->
[![Accordion · Collapsible · Scroll in the gallery](../assets/gallery/disclosure.webp)](../gallery.md)

*Section `disclosure` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

A single expand/collapse region — a lighter alternative to `Accordion` for one block. Controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).

```tsx
import { Collapsible } from "tempest-react-sdk";

<Collapsible trigger="View details" defaultOpen={false}>
  <p>Content revealed when expanded.</p>
</Collapsible>;
```

| Prop           | Type                      | Default | Description                                      |
| -------------- | ------------------------- | ------- | ------------------------------------------------ |
| `open`         | `boolean`                 | —       | Controlled state. When provided it is controlled |
| `defaultOpen`  | `boolean`                 | `false` | Initial state for the uncontrolled variant       |
| `onOpenChange` | `(open: boolean) => void` | —       | Fired with the next state when the trigger fires |
| `trigger`      | `ReactNode`               | —       | Content rendered inside the trigger button       |
| `children`     | `ReactNode`               | —       | Collapsible content, hidden while closed         |

!!! info "A11y"
    The trigger is a `<button aria-expanded aria-controls>` wired to a `role="region"` sharing the same id; the region is `hidden` while closed.

## `ContextMenu`

<!-- gallery:overlays -->
[![Popover · Dropdown · HoverCard in the gallery](../assets/gallery/overlays.webp)](../gallery.md)

*Section `overlays` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Right-click context menu. Opens at the cursor on `onContextMenu` (default browser menu suppressed), rendered through a `Portal`. Closes on outside click, Escape, or selection.

```tsx
import { ContextMenu } from "tempest-react-sdk";

<ContextMenu
  items={[
    { label: "Edit", onSelect: () => edit() },
    { label: "Duplicate", onSelect: () => duplicate() },
    { separator: true },
    { label: "Delete", danger: true, onSelect: () => remove() },
  ]}
>
  <div>Right-click here</div>
</ContextMenu>;
```

| Prop        | Type                | Default | Description                                           |
| ----------- | ------------------- | ------- | ----------------------------------------------------- |
| `items`     | `ContextMenuItem[]` | —       | Menu entries — selectable items and separators        |
| `children`  | `ReactNode`         | —       | Trigger area; right-clicking anywhere within opens it |
| `className` | `string`            | —       | Extra class names forwarded to the menu element       |

`ContextMenuItem` = `{ label: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }` or `{ separator: true }`.

!!! tip "Keyboard"
    Arrow Up/Down move focus across selectable items; Enter activates the focused item.

## `HoverCard`

Content preview shown when the trigger is hovered or focused. Opens after `openDelay`, closes after `closeDelay`.

```tsx
import { HoverCard } from "tempest-react-sdk";

<HoverCard trigger={<a href="/u/maria">@maria</a>} placement="bottom">
  <div>
    <strong>Maria Silva</strong>
    <p>Software engineer · 2.3k followers</p>
  </div>
</HoverCard>;
```

| Prop         | Type                                     | Default    | Description                                        |
| ------------ | ---------------------------------------- | ---------- | -------------------------------------------------- |
| `trigger`    | `ReactNode`                              | —          | Element the user hovers/focuses to reveal the card |
| `children`   | `ReactNode`                              | —          | Card content                                       |
| `openDelay`  | `number` (ms)                            | `300`      | Delay before opening on `mouseenter`/`focus`       |
| `closeDelay` | `number` (ms)                            | `150`      | Delay before closing on `mouseleave`/`blur`        |
| `placement`  | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"` | Where the card is anchored relative to the trigger |

!!! info "A11y"
    The card is a labelled `role="dialog"` region; the trigger stays keyboard focusable.

## `Command` (⌘K palette)

A ⌘K-style command palette: an overlay dialog with an input that substring-filters items (label + keywords), groups results, and supports keyboard navigation (↑/↓, Enter, Escape). Traps focus while open.

```tsx
import { Command } from "tempest-react-sdk";
import { useState } from "react";

const [open, setOpen] = useState(false);

<Command
  open={open}
  onOpenChange={setOpen}
  placeholder="Type a command…"
  items={[
    { id: "new", label: "New document", group: "File", onSelect: () => create() },
    { id: "open", label: "Open…", group: "File", keywords: ["recent"], onSelect: () => openFile() },
    { id: "theme", label: "Toggle theme", group: "Preferences", onSelect: () => toggleTheme() },
  ]}
/>;
```

| Prop           | Type                      | Default             | Description                                         |
| -------------- | ------------------------- | ------------------- | --------------------------------------------------- |
| `open`         | `boolean`                 | —                   | Whether the palette is visible                      |
| `onOpenChange` | `(open: boolean) => void` | —                   | Next open state (Escape, selection, backdrop click) |
| `items`        | `CommandItem[]`           | —                   | Candidate items to filter and display               |
| `placeholder`  | `string`                  | `"Type a command…"` | Placeholder for the search input                    |
| `emptyMessage` | `ReactNode`               | `"No results"`      | Rendered when no item matches the query             |
| `className`    | `string`                  | —                   | Forwarded to the dialog element                     |

`CommandItem` = `{ id: string; label: string; group?: string; keywords?: string[]; onSelect: () => void; icon?: ReactNode }`.

!!! tip "Global trigger"
    Pair with `useKeyboardShortcut("mod+k", () => setOpen(true))` to open via ⌘K / Ctrl+K.

## Recap

- **Essentials**: `Toggle`/`ToggleGroup` for pressable states, `Label` for forms, `Collapsible` for a single expandable block, `ContextMenu`/`HoverCard` for interaction-triggered overlays, and `Command` for the ⌘K palette.
- All share the same controlled/uncontrolled patterns, expose keyboard A11y, and import from `tempest-react-sdk`.
