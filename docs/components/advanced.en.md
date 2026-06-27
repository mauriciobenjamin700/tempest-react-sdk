# Overlays & advanced

Components at parity with shadcn/ui: toggles, label, expandable regions, context menus, command palette, scroll areas, resizable panes, calendar, navigation menus, and a stateful data table. All imported from `tempest-react-sdk`.

## Essentials

### `Toggle`

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

### `ToggleGroup` (+ `ToggleGroupItem`)

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

### `Label`

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

### `Collapsible`

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

### `ContextMenu`

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

### `HoverCard`

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

### `Command` (⌘K palette)

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

## Layout & UX

### `ScrollArea`

A styled scroll container that overflows on the chosen axis and renders a thin scrollbar (WebKit). Forwards `className`, `style`, and `ref` to the `<div>`.

```tsx
import { ScrollArea } from "tempest-react-sdk";

<ScrollArea maxHeight={240} orientation="vertical">
  <ul>
    {items.map((item) => (
      <li key={item.id}>{item.name}</li>
    ))}
  </ul>
</ScrollArea>;
```

| Prop          | Type                                   | Default      | Description                         |
| ------------- | -------------------------------------- | ------------ | ----------------------------------- |
| `maxHeight`   | `number \| string`                     | —            | Caps the height; numbers are pixels |
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"` | Which axis scrolls                  |

Remaining `<div>` props are forwarded.

### `Resizable`

A two-pane split layout with a draggable divider. The first pane is sized via `flex-basis` as a percentage; the second fills the rest. Drag with a pointer, or focus the divider and use the arrow keys (2% steps).

```tsx
import { Resizable } from "tempest-react-sdk";

<Resizable direction="horizontal" defaultSize={40} min={20} max={80}>
  <aside>Side panel</aside>
  <main>Main content</main>
</Resizable>;
```

| Prop          | Type                         | Default        | Description                                     |
| ------------- | ---------------------------- | -------------- | ----------------------------------------------- |
| `direction`   | `"horizontal" \| "vertical"` | `"horizontal"` | `horizontal` places the panes side by side      |
| `defaultSize` | `number` (%)                 | `50`           | Initial size of the first pane, as a percentage |
| `min`         | `number` (%)                 | `10`           | Lower clamp for the first pane                  |
| `max`         | `number` (%)                 | `90`           | Upper clamp for the first pane                  |
| `children`    | `[ReactNode, ReactNode]`     | —              | Exactly two panes — `[paneA, paneB]`            |

!!! warning "Exactly two children"
`children` is a `[ReactNode, ReactNode]` tuple. The size is always clamped to `[min, max]`.

### `Calendar`

A standalone month-grid date picker. Header with month/year + prev/next buttons, a weekday row, and a 6×7 grid of day buttons. Selection and visible month can each be controlled or uncontrolled. Uses plain `Date` math — no external date libraries.

```tsx
import { Calendar } from "tempest-react-sdk";
import { useState } from "react";

const [date, setDate] = useState<Date>();

<Calendar value={date} onChange={setDate} weekStartsOn={1} minDate={new Date(2026, 0, 1)} />;
```

| Prop            | Type                    | Default | Description                                       |
| --------------- | ----------------------- | ------- | ------------------------------------------------- |
| `value`         | `Date`                  | —       | Controlled selected date                          |
| `defaultValue`  | `Date`                  | —       | Initial selected date for the uncontrolled case   |
| `onChange`      | `(date: Date) => void`  | —       | Called with the newly selected date               |
| `month`         | `Date`                  | —       | Controlled visible month (any day within it)      |
| `onMonthChange` | `(month: Date) => void` | —       | Called when the visible month changes (prev/next) |
| `minDate`       | `Date`                  | —       | Earliest selectable date (inclusive)              |
| `maxDate`       | `Date`                  | —       | Latest selectable date (inclusive)                |
| `weekStartsOn`  | `0 \| 1`                | `0`     | First column — `0` Sunday, `1` Monday             |

!!! tip "Keyboard"
Arrow keys move focus by day (←/→) or week (↑/↓); Enter/Space selects the focused day.

## Navigation & content

### `NavigationMenu`

Horizontal navigation menu with hover/click/focus dropdown submenus. Top-level items render in `<nav><ul>`; items with `children` open a `role="menu"` panel. Only one panel is open at a time.

```tsx
import { NavigationMenu } from "tempest-react-sdk";

<NavigationMenu
  items={[
    { label: "Home", href: "/" },
    {
      label: "Products",
      children: [
        { label: "Analytics", href: "/analytics" },
        { label: "Billing", onSelect: () => openBilling() },
      ],
    },
  ]}
/>;
```

| Prop    | Type                   | Default | Description                  |
| ------- | ---------------------- | ------- | ---------------------------- |
| `items` | `NavigationMenuItem[]` | —       | Top-level navigation entries |

`NavigationMenuItem` = `{ label: ReactNode; href?: string; onSelect?: () => void; children?: NavigationMenuItem[] }`.

!!! note "Closing"
Closes on outside click, Escape, or selecting a leaf entry.

### `Menubar`

Application menubar (File / Edit-style). `role="menubar"`; each menu is a button that opens a dropdown. Arrow Left/Right move between menus (wrapping).

```tsx
import { Menubar } from "tempest-react-sdk";

<Menubar
  menus={[
    {
      label: "File",
      items: [
        { label: "New", shortcut: "⌘N", onSelect: () => create() },
        { separator: true },
        { label: "Quit", onSelect: () => quit() },
      ],
    },
  ]}
/>;
```

| Prop    | Type            | Default | Description                            |
| ------- | --------------- | ------- | -------------------------------------- |
| `menus` | `MenubarMenu[]` | —       | Top-level menus rendered left-to-right |

`MenubarMenu` = `{ label: ReactNode; items: MenubarItem[] }`. `MenubarItem` = `{ label: ReactNode; onSelect?: () => void; disabled?: boolean; shortcut?: string }` or `{ separator: true }`.

### `Carousel`

Horizontal content slider showing one slide at a time. The track translates by the active index. Prev/next arrows (disabled at the ends unless `loop`) and dot indicators. Controlled (`index`) or uncontrolled (`defaultIndex`).

```tsx
import { Carousel } from "tempest-react-sdk";

<Carousel loop showArrows showDots>
  <img src="/1.jpg" alt="" />
  <img src="/2.jpg" alt="" />
  <img src="/3.jpg" alt="" />
</Carousel>;
```

| Prop            | Type                      | Default | Description                                 |
| --------------- | ------------------------- | ------- | ------------------------------------------- |
| `children`      | `ReactNode[]`             | —       | Slides — one rendered at a time             |
| `loop`          | `boolean`                 | `false` | Wrap around at the ends instead of stopping |
| `showArrows`    | `boolean`                 | `true`  | Show prev/next arrow buttons                |
| `showDots`      | `boolean`                 | `true`  | Show dot indicators                         |
| `index`         | `number`                  | —       | Controlled active index                     |
| `defaultIndex`  | `number`                  | `0`     | Initial index for uncontrolled use          |
| `onIndexChange` | `(index: number) => void` | —       | Called whenever the active index changes    |

!!! tip "Keyboard"
Arrow Left/Right on the focused region navigate between slides.

## Data

### `DataTable<T>`

A stateful data table built on top of the headless `Table`. Adds client-side search, click-to-sort columns, and pagination, delegating all markup to the underlying `Table`.

```tsx
import { DataTable, type DataTableColumn } from "tempest-react-sdk";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const columns: DataTableColumn<User>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "email", header: "Email" },
  { key: "role", header: "Role", sortable: true, align: "right" },
];

<DataTable
  data={users}
  columns={columns}
  searchable
  pageSize={10}
  initialSort={{ key: "name", direction: "asc" }}
  rowKey={(row) => row.id}
  emptyMessage="No users found"
/>;
```

| Prop           | Type                                  | Default | Description                                             |
| -------------- | ------------------------------------- | ------- | ------------------------------------------------------- |
| `data`         | `T[]`                                 | —       | Full dataset; sort/filter/pagination happen client-side |
| `columns`      | `DataTableColumn<T>[]`                | —       | Column definitions                                      |
| `pageSize`     | `number`                              | `10`    | Rows per page                                           |
| `searchable`   | `boolean`                             | `false` | Render a search input above the table                   |
| `searchKeys`   | `(keyof T)[]`                         | —       | Keys to search; default = string/number columns         |
| `initialSort`  | `DataTableSort<T>`                    | —       | Initial sort applied before any header interaction      |
| `rowKey`       | `(row: T, index) => string \| number` | index   | Stable key extractor for rows                           |
| `emptyMessage` | `ReactNode`                           | —       | Content shown when no rows match                        |

`DataTableColumn<T>` = `{ key: keyof T; header: ReactNode; render?: (row: T) => ReactNode; sortable?: boolean; align?: TableAlign; priority?: TablePriority; width?: string | number }`. `DataTableSort<T>` = `{ key: keyof T; direction: "asc" | "desc" }`.

!!! info "Behavior"
Clicking a sortable header cycles asc → desc → unsorted. Search matches a case-insensitive substring across `searchKeys` (or every string/number column when omitted). Pagination is hidden when the result fits on a single page.

## Recap

- **Essentials**: `Toggle`/`ToggleGroup` for pressable states, `Label` for forms, `Collapsible` for a single expandable block, `ContextMenu`/`HoverCard` for interaction-triggered overlays, and `Command` for the ⌘K palette.
- **Layout & UX**: `ScrollArea` for styled scrolling, `Resizable` for split panes, and `Calendar` for date selection with no external dependencies.
- **Navigation & content**: `NavigationMenu` and `Menubar` for navigation with dropdowns, `Carousel` for sliders.
- **Data**: `DataTable<T>` wraps the headless `Table` with client-side search, sort, and pagination.
- All share the same controlled/uncontrolled patterns, expose keyboard A11y, and import from `tempest-react-sdk`.
