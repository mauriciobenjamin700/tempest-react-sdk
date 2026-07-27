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
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"`     | Which axis scrolls                  |
| `scrollLabel` | `string`                               | `"Área rolável"` | Accessible name for the scroll region |

Remaining `<div>` props are forwarded.

!!! info "While it overflows, it becomes a focusable group"
    An area whose content is plain text holds nothing focusable. Without a tab stop of its own, a keyboard user can see the scrollbar and has no way to move it — focus never lands anywhere the arrow keys would scroll. So the area takes `tabIndex={0}` + `role="group"` + `aria-label` **only while the content actually overflows**, and loses it again once it fits. An area that does not scroll never adds a tab stop. A caller-supplied `role` or `tabIndex` still wins.

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

### `Scheduler`

An agenda: events placed on a time grid across consecutive days. The `Calendar` above is a date *picker* — it answers "which day?". This answers "what is on those days, and when", which needs a different structure: a vertical time axis, events sized by duration, and overlapping events side by side.

```tsx
import { Scheduler, type SchedulerEvent } from "tempest-react-sdk";

const events: SchedulerEvent[] = [
  { id: "1", title: "Daily", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 9, 15) },
  { id: "2", title: "Client", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 10, 30) },
  { id: "3", title: "Holiday", start: new Date(2026, 6, 29), end: new Date(2026, 6, 30), allDay: true },
];

<Scheduler
  events={events}
  days={7}
  startHour={7}
  endHour={21}
  onEventClick={(event) => open(event.id)}
  onSlotClick={(start) => createAt(start)}
/>;
```

| Prop              | Type                                    | Default   | Description                                        |
| ----------------- | --------------------------------------- | --------- | -------------------------------------------------- |
| `events`          | `SchedulerEvent[]`                      | —         | Events; instants read in local time                |
| `anchor`          | `Date`                                  | today     | Any day within the range to show                   |
| `days`            | `number`                                | `7`       | Consecutive days — `1` is a day view               |
| `startHour`       | `number`                                | `8`       | First visible hour                                 |
| `endHour`         | `number`                                | `20`      | Last visible hour                                  |
| `snapMinutes`     | `number`                                | `30`      | Granularity of a click on empty space              |
| `onEventClick`    | `(event: SchedulerEvent) => void`       | —         | An event was activated                             |
| `onSlotClick`     | `(start: Date) => void`                 | —         | Empty space clicked, already snapped               |
| `renderEvent`     | `(event: SchedulerEvent) => ReactNode`  | —         | Event contents                                     |
| `locale`          | `string`                                | `"pt-BR"` | Day and hour labels                                |
| `showCurrentTime` | `boolean`                               | `true`    | The current-time line                              |
| `now`             | `Date`                                  | clock     | Fixed "now" — use it in tests and demos            |

An event is `{ id, title, start, end, allDay?, data? }`.

!!! info "Overlap is what almost every implementation gets wrong"
    Overlapping events are grouped into **clusters of mutual overlap** — a chain where
    each event overlaps at least one other — and **everyone in a cluster shares one
    column count**. That is what makes the widths line up; assigning columns pairwise
    produces the ragged layout where two events claim half the width each and a third
    silently covers one of them.

    A column is **reused the moment it frees**: `9–10`, `9–10`, `10–11` takes two
    columns, not three. And touching is not overlapping — `9–10` followed by `10–11`
    both stay full width.

    The layout is pure and lives in `scheduler-layout.ts`, with its own tests.

!!! warning "Local time, and DST does not duplicate a day"
    `start`/`end` are instants read in the browser's time zone. The day range is built
    by **incrementing the calendar day**, not by adding 24 h of milliseconds: across a
    DST boundary a day is 23 or 25 hours long, and millisecond arithmetic would produce
    a duplicated or skipped date.

!!! check "An event crossing midnight appears in both columns"
    A 23:00–01:00 booking is split into two segments, each clipped to its own day's
    visible window. Without that it either vanishes or is drawn outside its column.

!!! note "All-day events get their own lane"
    An event with `allDay` renders in a lane above the grid, spanning the days it
    covers — a vertical position would mean nothing for it. The lane is not rendered
    when there are none.

!!! tip "Clicking empty space creates; clicking an event does not"
    `onSlotClick` only fires when the click landed on the column rather than on an
    event inside it. The instant arrives snapped to `snapMinutes` and clamped to the
    window.

!!! warning "It is not `role=\"grid\"`"
    An ARIA grid requires `row` children, and here the events are **siblings** of the
    day columns inside one CSS grid: a `row` wrapper would stop the columns being grid
    items and the layout would collapse. Each day is a labelled `group` instead — a
    screen reader tabs the event buttons and the group name supplies the day. Verified
    with `axe`.

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

### `Wizard`

Multi-step flow: an indicator, one body at a time, and navigation that respects **per-step validation**. `Stepper` draws the indicator; `Wizard` owns the part every app was rewriting — the active index, the async gate before advancing, disabled/pending buttons and the completion call.

```tsx
import { Button, FormField, Input, Wizard, useZodForm } from "tempest-react-sdk";
import { FormProvider } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Enter a name"),
  email: z.string().email("Invalid email"),
  zip: z.string().min(5, "Incomplete ZIP"),
});

export function SteppedSignup() {
  const form = useZodForm(schema, { defaultValues: { name: "", email: "", zip: "" } });

  return (
    <FormProvider {...form}>
      <Wizard
        onComplete={form.handleSubmit((values) => console.log(values))}
        steps={[
          {
            id: "details",
            label: "Details",
            description: "Who the customer is",
            validate: () => form.trigger(["name", "email"]),
            content: (
              <>
                <FormField name="name" label="Name" required><Input /></FormField>
                <FormField name="email" label="Email" required><Input type="email" /></FormField>
              </>
            ),
          },
          {
            id: "address",
            label: "Address",
            validate: () => form.trigger(["zip"]),
            content: <FormField name="zip" label="ZIP" required><Input /></FormField>,
          },
          {
            id: "review",
            label: "Review",
            content: ({ back }) => (
              <>
                <pre>{JSON.stringify(form.getValues(), null, 2)}</pre>
                <Button variant="ghost" onClick={back}>Fix something</Button>
              </>
            ),
          },
        ]}
      />
    </FormProvider>
  );
}
```

| Prop                 | Type                                          | Default    | Description                                                  |
| -------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `steps`              | `WizardStep[]`                                | —          | The flow's steps.                                            |
| `activeIndex`        | `number`                                      | —          | Controlled index.                                            |
| `defaultActiveIndex` | `number`                                      | `0`        | Initial index (uncontrolled).                                |
| `onStepChange`       | `(index, step) => void`                       | —          | Called on every step change.                                 |
| `onComplete`         | `() => void \| Promise<void>`                 | —          | Called when the last step passes validation.                 |
| `nextLabel`          | `string`                                      | `"Next"`   | Advance button label.                                        |
| `backLabel`          | `string`                                      | `"Back"`   | Back button label.                                           |
| `finishLabel`        | `string`                                      | `"Finish"` | Label on the last step.                                      |
| `optionalLabel`      | `string`                                      | `"(optional)"` | Suffix for an optional step in the indicator — override to localize. |
| `clickableSteps`     | `boolean`                                     | `false`    | Allows jumping by clicking the indicator.                    |
| `renderActions`      | `(controls: WizardControls) => ReactNode`     | —          | Replaces the default button row.                             |

`WizardStep = { id, label, description?, content, validate?, optional? }` — `content` accepts a `ReactNode` **or** a function receiving the controls.

`WizardControls = { activeIndex, step, validating, isFirst, isLast, next, back, goTo }`.

!!! warning "Only the active step is mounted"
    Uncommitted input in a step you leave is **lost** unless the state lives outside (react-hook-form's `FormProvider`, a store, a parent `useState`) — which is where it belongs anyway, since the last step usually submits everything at once.

!!! tip "An async `validate` comes with a pending state"
    While the promise runs, the advance button is in `loading` and Back is disabled. A `validate` that **throws** counts as "not allowed": a gate wired to a network check should not strand the user on a half-advanced flow when the request fails.

!!! note "`clickableSteps` is `false` on purpose"
    A wizard exists because **order matters**. With `clickableSteps`, jumping back is free (going back never blocks), but jumping forward validates **every step crossed** — the first gate that fails stops the jump right there.

### `Kanban`

> **When to use it**: a board of columns whose cards move between stages — backlog, sales pipeline, work orders by status.

Reorders within a column and moves across columns, by pointer **or** keyboard. The drag machine is `useSortable` — the board reimplements none of it.

```tsx
import { applyKanbanMove, Kanban, type KanbanColumn } from "tempest-react-sdk";
import { useState } from "react";

export function BacklogBoard() {
  const [columns, setColumns] = useState<KanbanColumn[]>([
    { id: "todo", title: "To do", cards: [{ id: "1", content: "Fix login" }] },
    { id: "doing", title: "Doing", cards: [] },
    { id: "done", title: "Done", cards: [], locked: true },
  ]);

  return (
    <Kanban
      label="Backlog"
      columns={columns}
      onMove={(move) => setColumns((current) => applyKanbanMove(current, move))}
    />
  );
}
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `columns` | `KanbanColumn[]` | — | Columns with their cards, in display order. |
| `onMove` | `(move: KanbanMove) => void` | — | Called **once** per committed move. You apply it. |
| `renderCard` | `(card, column) => ReactNode` | the card content | Customizes the card body. |
| `label` | `string` | `"Quadro"` | Accessible name of the board. |
| `emptyLabel` | `ReactNode` | `"Nenhum card"` | Text for an empty column. |
| `cardRoleDescription` | `string` | keyboard hint | Announced per card — override to localize. |
| `disabled` | `boolean` | `false` | Blocks all dragging. |

`KanbanColumn = { id, title, cards, locked? }` · `KanbanCard = { id, content }` · `KanbanMove = { cardId, fromColumn, toColumn, toIndex }`.

`applyKanbanMove(columns, move)` is the reducer that applies a move returning new arrays — exported because every consumer needs the same one, and it is where the off-by-one lives.

!!! info "A `locked` column refuses drops but still lets cards leave"
    That is a "Done" column which takes no new work, but whose cards can still be pulled back.

!!! warning "A keyboard move can only target a position that holds a card"
    The move walks the index space of existing cards, so **dropping into an empty column works by pointer but not by keyboard**. That is a limitation of the current implementation, not a design choice: until column-switch keys land, the way around is to move into a column that already has a card and then reorder.

!!! info "ARIA: one `listbox` per column, not one per board"
    Each column that has cards is a `listbox` named by its title, containing only `option`s. A single board-wide listbox does not survive the markup a board needs — `listbox` requires `option`/`group` children and the column header in between breaks that ownership. An **empty** column is not marked as a listbox (zero `option`s fails `aria-required-children`), and the header is a `div`, not a `<header>`: outside a sectioning element every `<header>` becomes a `banner` landmark — with three columns, three duplicate banners.

## Recap

- **Essentials**: `Toggle`/`ToggleGroup` for pressable states, `Label` for forms, `Collapsible` for a single expandable block, `ContextMenu`/`HoverCard` for interaction-triggered overlays, and `Command` for the ⌘K palette.
- **Layout & UX**: `ScrollArea` for styled scrolling, `Resizable` for split panes, and `Calendar` for date selection with no external dependencies.
- **Navigation & content**: `NavigationMenu` and `Menubar` for navigation with dropdowns, `Carousel` for sliders.
- **Data**: `DataTable<T>` wraps the headless `Table` with client-side search, sort, and pagination.
- All share the same controlled/uncontrolled patterns, expose keyboard A11y, and import from `tempest-react-sdk`.
