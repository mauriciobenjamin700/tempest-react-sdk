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

### `Markdown`

> **When to use**: rendering text that came from people — a comment, a ticket description, release notes, a message body.

A Markdown subset: headings, paragraphs, lists (nested and ordered), blockquote, fenced code (through [`CodeBlock`](utility.md#codeblock)), thematic break, GFM pipe tables with alignment, and the usual inline set (`**strong**`, `*em*`, `` `code` ``, `~~del~~`, links, images, autolinks, hard breaks).

```tsx
import { Markdown } from "tempest-react-sdk";

<Markdown source={comment.body} linkProps={{ target: "_blank", rel: "noreferrer" }} />;
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `source` | `string` | — | The Markdown. |
| `headingOffset` | `number` | `2` | Level the document's `#` becomes. |
| `highlightCode` | `boolean` | `true` | Fenced code through `CodeBlock` (copy, line numbers). |
| `showLineNumbers` | `boolean` | `false` | Line numbers in fenced code. |
| `linkProps` | `AnchorHTMLAttributes` | — | Extra props on **every** link. |

!!! danger "The safety is structural, not a promise about escaping"
    `dangerouslySetInnerHTML` **does not exist** in this component. The parser produces a node tree and the renderer turns it into React elements — and a React child can only be text. So `<script>alert(1)</script>` in a comment renders as the characters somebody typed, and so does `<img src=x onerror=...>`.

    This is not "sanitized HTML": **it is text**. Which is why there is no sanitizer here and no allowed-tags list — there is no path for markup to enter.

!!! danger "URLs go through a scheme allowlist, not a blocklist"
    Links accept `http`, `https`, `mailto`, `tel`, `sms` and relative. Images accept the same plus **raster** `data:image/` (png/jpeg/gif/webp/avif) — `data:image/svg+xml` is deliberately out: an SVG is a document, it carries `<script>` and event handlers.

    `[click](javascript:alert(1))` renders **"click"** as text: the link goes, the words stay. A blocklist would have to enumerate `javascript:`, `JaVaScRiPt:`, `java\tscript:`, `\u0001javascript:` — and would miss the one nobody thought of. An allowlist carries no such debt.

!!! warning "It is a subset, and that is the chosen ceiling"
    No embedded HTML, footnotes, definition lists, reference links (`[a][b]`) or task lists. If your case needs full CommonMark with plugins, reach for `react-markdown` + `remark` directly — that is 40 KB and a plugin chain the whole SDK does not pay for. The scope here is what a user comment uses.

!!! info "`#` becomes `h2` by default"
    A comment rendered inside a page whose `h1` is the page title must not emit a second `h1`. `headingOffset` shifts the whole scale, and the component never goes past `h6`, so the document outline stays valid.

!!! check "A wide table scrolls in its own box, and the box is reachable"
    The tab stop appears **only while** the overflow is real — a scroll area with nothing focusable inside is unreachable by keyboard, and adding the stop unconditionally would pollute the tab order with one entry per table.

### `Masonry`

> **When to use**: cards of **uneven height** with no order between them — a notes wall, a photo gallery, dashboard cards.

Measures the cards and deals each one into the shortest column, so the bottom edge is as even as the content allows.

```tsx
import { Masonry, Card } from "tempest-react-sdk";

<Masonry items={notes} itemKey={(note) => note.id} columns={{ 0: 1, 640: 2, 1024: 3 }}>
  {(note) => <Card title={note.title}>{note.body}</Card>}
</Masonry>;
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `items` | `T[]` | — | What to lay out. |
| `children` | `(item: T, index: number) => ReactNode` | — | Renders one card. |
| `columns` | `number \| Record<number, number>` | `{ 0: 1, 640: 2, 1024: 3 }` | A fixed number, or a **width → columns** map. |
| `itemKey` | `(item: T, index: number) => string \| number` | index | Stable key per item. |
| `gap` | `string` | `--tempest-space-4` | Space between cards. |

!!! info "Why this is not one line of CSS"
    CSS `columns` **breaks a card** across the column boundary, and `grid-auto-flow: dense` keeps every row at the height of its tallest cell — which is exactly the ragged bottom edge people reach for masonry to avoid. Both are one line of CSS and neither does this job.

!!! warning "Reading order goes down the column, not across the row"
    Card 2 sits **below** card 1, not beside it. Which is why this layout is for **independent** items: a list where item 2 must follow item 1 wants a grid, not this. If order matters to your content, do not use masonry — not here, not in plain CSS.

!!! check "The breakpoint map is about the container, not the viewport"
    A masonry inside a drawer or a two-column page is narrower than the window, and a media query would give it three columns at 300px wide. A `ResizeObserver` is what makes `{ 0: 1, 640: 2 }` mean "of this container", which is the only useful reading.

!!! info "Shortest column, not round-robin"
    `index % columns` is the obvious approach and produces ragged columns the moment items differ in height — which is the only reason to use masonry at all.

!!! tip "An image that loads later is re-measured"
    Every card is observed individually: a height measured at mount is wrong in exactly the case of an image still downloading. The first paint weights every card as 1 (so it is never blank) and the measured pass re-deals.

### `Tour`

> **When to use**: introducing a screen — first-run onboarding, a feature that moved, a flow nobody finds on their own.

Dims the page, highlights one element at a time and explains it. The highlighted element **stays clickable**.

```tsx
import { Tour } from "tempest-react-sdk";
import { useState } from "react";

export function Orders() {
  const [open, setOpen] = useState(!storage.get("tour-orders-v1"));

  return (
    <>
      {/* … the screen … */}
      <Tour
        open={open}
        steps={[
          { target: "#new-order", title: "Start here", body: "Every order begins with this button." },
          { target: "[data-tour='filters']", body: "And filter by period here.", placement: "right" },
        ]}
        onClose={() => setOpen(false)}
        onFinish={() => storage.set("tour-orders-v1", true)}
      />
    </>
  );
}
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `steps` | `TourStep[]` | — | The stops, in order. |
| `open` | `boolean` | — | Controlled by the app. |
| `onClose` | `() => void` | — | `Esc`, the close button, "skip", or a click on the dim. |
| `onFinish` | `() => void` | — | After the last step, before `onClose`. |
| `index` / `onIndexChange` | `number` / `(i) => void` | internal | The app drives the current step, if it wants to. |
| `spotlightPadding` | `number` | `4` | Space kept clear around the highlighted element. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels. |

`TourStep = { target?, title?, body, placement? }` · `placement` ∈ `"top" | "bottom" | "left" | "right" | "center"`.

!!! check "The highlighted element stays clickable — and that is what makes a coachmark useful"
    The dim is **four rectangles** around the target, not one overlay with a `box-shadow` hole. Because a shadow is **not hit-testable**: a hole made that way would block nothing — the rest of the page would stay clickable and the target would not. Four rectangles are the other way round, which is what "press this button" needs.

!!! info "The target is a **selector**, not a ref"
    So a tour can be declared as data — in a config file, from the backend, next to the copy — without every screen threading refs up to whoever renders the tour.

!!! warning "A step whose target is missing shows centred, it does not vanish"
    That is the real case: a feature hidden by permission, a button that only exists with data. Dropping the step would hide its message silently, and skipping to the next could skip the whole tour.

!!! check "Keyboard: arrows walk, `Esc` leaves, focus goes to the card"
    The card is `role="dialog"` + `aria-modal`, named by its title and described by its body, with a focus trap (`useFocusTrap`) and a visible "Step 2 of 5". `Esc` is handled **on the card**, not on `window`: a tour opened over a modal does not close both.

!!! info "The card flips when it does not fit — and centres when nothing fits"
    It tries the preferred side, then the **opposite** one (which keeps the reading relationship with the target; jumping to a side would move the card across the screen for no visible reason), then the others. A card half off-screen is worse than a card in the middle — and that happens for real when the target is taller than the viewport.

!!! tip "Persisting 'already seen' is the app's business"
    The component takes `open` and emits `onClose`/`onFinish`. Writing the flag is one line in the app (`storage.set`) and would be a wrong default here — the key is versioned, scoped per user, and sometimes lives on the backend.

### `Transfer`

> **When to use**: picking a **subset** of a catalogue — a profile's permissions, cities on a route, members of a group, columns of a report.

Two panes, four move controls, a search box on each side. Controlled by the **ids on the right**; both panes are derived.

```tsx
import { Transfer, type TransferItem } from "tempest-react-sdk";
import { useState } from "react";

const PERMISSIONS: TransferItem[] = [
  { id: "orders.read", label: "Read orders" },
  { id: "orders.create", label: "Create orders" },
  { id: "audit.read", label: "Read audit log", disabled: true },
];

export function ProfilePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);

  return (
    <Transfer
      items={PERMISSIONS}
      value={permissions}
      onChange={setPermissions}
      sourceTitle="Available"
      targetTitle="On the profile"
    />
  );
}
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `items` | `TransferItem[]` | — | The whole catalogue. Both panes come from it. |
| `value` | `string[]` | — | Ids on the right. **Controlled.** |
| `onChange` | `(value: string[]) => void` | — | Next value, always in catalogue order. |
| `sourceTitle` / `targetTitle` | `ReactNode` | `"Disponíveis"` / `"Selecionados"` | Each pane's heading. |
| `searchable` | `boolean` | `true` past 8 items | A search box on each pane. |
| `renderItem` | `(item, side) => ReactNode` | `item.label` | Custom row body. |
| `height` | `string` | `"16rem"` | Height of each pane's scroll area. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels and announcements. |
| `disabled` | `boolean` | `false` | Blocks every move. |

`TransferItem = { id, label, searchText?, disabled?, data? }`

!!! info "Only the right-hand ids are state — the panes are derived"
    Storing two lists looks simpler and **drifts** the first time the catalogue changes underneath: a permission removed on the server lingers in whichever pane held it, and an id present on both sides is a bug nobody can see. With a single `value`, `items` is in charge: anything that left the catalogue simply disappears from both panes.

!!! check "The move-all button respects the filter"
    Filtering by `sao` and clicking "move all" moves **what you are looking at**, not the whole pane. Moving the rows the filter hid is the kind of surprise that makes people stop trusting the button — and it was a real bug, caught by a test before the merge.

!!! check "Search folds accents, both ways"
    `sao` finds "São Paulo" and so does `são`. For a PT-BR audience that is not a refinement: a plain `includes` would miss half the searches.

!!! warning "A `disabled` row does not move by any path"
    The check lives in `applyMove`, not in each of the four buttons — it is a mandatory permission, a locked seat. Which is why `»` moves "everything movable", not "everything".

!!! info "Checks are cleared after a move"
    Otherwise the next click on the opposite button sends it all back, and the component looks like it is undoing itself.

!!! info "The controls sit in the middle by grid order, but come last in the DOM"
    A keyboard reaching the buttons before it has seen what they move would have to go back; a screen reader would read "move checked to the right" with no idea what is checked. Each pane is a `region` named by its heading, and each move is announced in a `role="status"`.

### `FilterBar`

> **When to use**: filtering an admin list — orders by status and period, users by role, invoices by due date.

Chips for the applied filters, plus a small editor to add another. Filters are combined with **AND**, flat.

```tsx
import {
  FilterBar,
  filtersFromSearchParams,
  filtersToSearchParams,
  type Filter,
  type FilterField,
} from "tempest-react-sdk";

const FIELDS: FilterField[] = [
  { name: "title", label: "Title", type: "text" },
  { name: "total", label: "Total", type: "number" },
  { name: "createdAt", label: "Created", type: "date" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "paid", label: "Paid" },
      { value: "sent", label: "Sent" },
    ],
  },
];

export function Orders() {
  // The set comes from the URL, so a shared link opens with the same filters.
  const [filters, setFilters] = useState<Filter[]>(() =>
    filtersFromSearchParams(new URLSearchParams(location.search), FIELDS),
  );

  const { data } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => api.get(`/orders?${filtersToSearchParams(filters)}`),
  });

  return <FilterBar fields={FIELDS} value={filters} onChange={setFilters} />;
}
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `fields` | `FilterField[]` | — | Fields that can be filtered. |
| `value` | `Filter[]` | — | Applied filters. **Controlled.** |
| `onChange` | `(filters: Filter[]) => void` | — | Next set, combined with AND. |
| `actions` | `ReactNode` | — | Next to the controls — "save this view", a counter. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels and descriptions. |

`FilterField = { name, label, type, options?, operators?, placeholder? }` · `type` ∈ `"text" | "number" | "date" | "select" | "boolean"`
`Filter = { field, operator, value? }` · `operator` ∈ `eq · ne · contains · gt · gte · lt · lte · between · in · empty · notEmpty`

**Exported helpers**: `filtersToSearchParams`, `filtersFromSearchParams`, `describeFilter`, `operatorsFor`.

!!! warning "Flat **AND**, not a tree with OR — and that is the chosen ceiling"
    Nested groups (`(a OR b) AND c`) are a different component: they need a tree UI with a per-node operator and a different serialization. Trying to be both produces a builder that is clumsy at the 95% case — "status is paid, created after March, title contains nota". If you need nested OR, what you want is a real query builder, and it does not fit behind this API.

!!! check "The filter set fits in the URL — and comes back from it"
    `filtersToSearchParams` writes `status=eq:paid&total=between:10|90`; `filtersFromSearchParams` reads it back, and there is a **round-trip** test. A filter set that cannot survive a reload is one people re-enter every time they open a link somebody sent them.

!!! danger "Whatever does not parse is **dropped**, not guessed at"
    A hand-edited URL is the normal way this input arrives. An operator the field does not offer (`total=contains:1`), an unknown field, a `between` with one end — all discarded. Rendering a chip the backend cannot evaluate would show a list that does not match what the chip claims.

!!! check "The chip reads in words, and it is the same text a screen reader hears"
    "Status is Paid" — with the option's **label**, not its key (`paid`). The remove button uses the same sentence in its `aria-label` ("Remove filter: Status is Paid"), because a chip that says one thing to a sighted user and another to a screen reader is two different truths.

!!! info "The input follows the **field**, not the operator"
    A date field gets a date picker even under `between` (two of them). Typing a date into a text box is the fastest way to produce a filter the backend cannot parse.

!!! tip "An incomplete filter only disables Apply"
    It is not an error to shout about — it is a half-filled form. Changing the operator clears the value, because a value carried across operators produces filters nobody meant to write.

### `Chat`

> **When to use**: a message thread — support, internal chat, document comments, a service history.

Groups by author and by day, marks the current user's side, shows delivery state and who is typing, and brings the composer along when you pass `onSend`.

```tsx
import { Chat, Avatar, type ChatMessage } from "tempest-react-sdk";
import { useState } from "react";

export function Support({ me }: { me: { id: string } }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /** Optimistic insert: the message shows up before the server confirms. */
  const send = async (text: string) => {
    const id = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id, body: text, authorId: me.id, sentAt: Date.now(), status: "sending" },
    ]);
    await api.post("/messages", { body: { id, text } });
    setMessages((current) =>
      current.map((m) => (m.id === id ? { ...m, status: "sent" } : m)),
    );
  };

  return (
    <Chat
      messages={messages}
      currentUserId={me.id}
      onSend={send}
      onRetry={(m) => resend(m.id)}
      renderAvatar={(m) => <Avatar name={m.authorName ?? m.authorId} size="sm" />}
    />
  );
}
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `messages` | `ChatMessage[]` | — | The thread, **oldest first**. Never reordered. |
| `currentUserId` | `string` | — | Author treated as "own": side, colour, delivery ticks. |
| `onSend` | `(text: string) => void \| Promise<void>` | — | Renders the composer. Receives the trimmed text. |
| `onRetry` | `(message: ChatMessage) => void` | — | Enables the retry control on a `"failed"` message. |
| `onSendError` | `(error: unknown) => void` | — | Called when `onSend` rejects. The draft stays in the field. |
| `typing` | `string[]` | `[]` | Who is typing. One, two or a count is phrased for you. |
| `renderAvatar` | `(message) => ReactNode` | — | Avatar for the **first** message of each run. |
| `header` | `ReactNode` | — | Bar above the thread, inside the panel. |
| `groupWindowMs` | `number` | `300000` | Gap that still keeps messages in one run. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels ("Today", "You", "Sending"…). |
| `emptyState` | `ReactNode` | `<EmptyState/>` | Empty thread. |
| `composerDisabled` | `boolean` | `false` | No permission, archived thread, offline. |

`ChatMessage = { id, body, authorId, authorName?, sentAt, status?, data? }` · `status` ∈ `"sending" | "sent" | "read" | "failed"`.

The component is **presentational and controlled**, like the rest of the SDK: it takes a list and emits intent. Where messages come from (REST, the SDK's `createWebSocket`, an SSE stream) and how the optimistic insert is done stay with the app, because those differ per backend.

!!! tip "It only jumps to the bottom if you were already at the bottom"
    A thread that always scrolls to the newest message yanks whoever is reading history, every time anyone types. So the jump happens only when the reader was already down there (with 48px of slack for a partially visible last row) — the rule every chat app converges on. Verified in the browser: reading history at the top, three messages arrived and the position did not move.

!!! info "A run breaks on author, on day **and** on a gap"
    Repeating the avatar and the name on every line of a five-message burst turns a conversation into a list of receipts. But a reply an hour later is a new beat even when nobody else spoke — joining it to the earlier burst would put one timestamp on messages an hour apart. `groupWindowMs` is that limit.

!!! warning "Failure state is not decoration"
    Without `"failed"` + `onRetry`, the user re-types what is already on screen. The failed bubble keeps its **text readable** (border and meta in red, not the whole background) precisely because re-reading the message is what somebody does before deciding to resend.

!!! info "The thread is `role=\"log\"` with `aria-live=\"polite\"`, and keyboard-reachable"
    A new message is announced without stealing focus. The container has `tabIndex={0}` because a scroll area with nothing focusable inside is unreachable by keyboard — the same problem the [scroll fix](./data.md) solved for `Table`. Delivery state is text (`VisuallyHidden`), not just a glyph: "✓✓" is not read out.

!!! tip "It doubles as a comment thread"
    Same component **without** `currentUserId` and without `typing`: everyone on one side, a name per run. That is why "who am I" is a prop rather than an `own` field on every message — in a document comment thread nobody wants to annotate 200 messages.

#### `ChatComposer`

Exported separately for a custom layout (a composer pinned to the footer of a route, say). A textarea that grows with its content, `Enter` sends, `Shift+Enter` breaks the line.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `onSend` | `(text: string) => void \| Promise<void>` | — | Receives the trimmed text. Clears the field only if it does not reject. |
| `onError` | `(error: unknown) => void` | — | Error from `onSend`. The draft is preserved either way. |
| `actions` | `ReactNode` | — | Before the send button — attach, emoji. |
| `maxRows` | `number` | `6` | Largest height, in lines. |
| `sendLabel` | `string` | locale | Button label. |

!!! warning "It is **uncontrolled**, on purpose"
    A chat draft changes on every keystroke, and lifting that into app state re-renders the whole thread per character — the one place where "controlled by default" costs something visible. Apps that need the draft (a persisted composer, a slash-command menu) read it from `onChange` or drive it through the ref (`focus()`, `setValue()`).

!!! danger "IME: `Enter` while composing does not send"
    While composing Japanese or Korean, `Enter` confirms the candidate word. Sending there posts half a word and eats the confirmation — hence the `isComposing` check.

### `AIChat`

> **When to use it**: a conversation with a **model** — a copilot inside your app, a support assistant, conversational search. This is the shape ChatGPT, Claude and DeepSeek converged on.

Role-based turns (`user` / `assistant` / `system`), Markdown answers with code blocks, reasoning in its own block, a streaming caret, per-turn actions (copy, regenerate, edit, 👍/👎) and a composer that **turns into a stop button** while the answer is arriving.

!!! info "`AIChat` and [`Chat`](#chat) are different components, not variants"
    A human thread is addressed by **author** and cares about delivery state. A model transcript is addressed by **role**, has no delivery state at all, and needs three things a human thread never does: partial output, reasoning separate from the answer, and re-asking. Folding both into one `variant` would mix two data models into the same `props` and leave `authorId`/delivery ticks dead on the LLM path.

Start with the minimum — a list and an `onSend`:

```tsx
import { AIChat, type AIChatMessage } from "tempest-react-sdk";
import { useState } from "react";

export function Copilot() {
  const [turns, setTurns] = useState<AIChatMessage[]>([]);

  const ask = async (text: string) => {
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    const answer = await fetch("/api/ask", {
      method: "POST",
      body: JSON.stringify({ prompt: text }),
    }).then((r) => r.json());
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: answer.text },
    ]);
  };

  return <AIChat messages={turns} onSend={ask} />;
}
```

That already gives you the transcript, the Markdown, the composer, `Enter`/`Shift+Enter`, the scroll that follows the answer, and the copy action. What is missing is **streaming** — and that is where the component starts to look like a product.

#### Streaming, from scratch

The SDK does **not** make the call for you: "how do I stream from my backend" has a different answer per provider. What it does is render the state. The contract is simple — keep rewriting the `content` of the **last** turn, and keep `streaming: true` on it until you are done:

```tsx
import { AIChat, type AIChatMessage } from "tempest-react-sdk";
import { useRef, useState } from "react";

export function StreamingCopilot() {
  const [turns, setTurns] = useState<AIChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const abort = useRef<AbortController | null>(null);

  /** Rewrites the last turn on every chunk — the component follows the text itself. */
  const write = (id: string, text: string) =>
    setTurns((current) =>
      current.map((t) => (t.id === id ? { ...t, content: text } : t)),
    );

  const ask = async (prompt: string) => {
    const answerId = crypto.randomUUID();
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
    ]);
    setPending(true);

    abort.current = new AbortController();
    const response = await fetch("/api/stream", {
      method: "POST",
      body: JSON.stringify({ prompt }),
      signal: abort.current.signal,
    });

    setPending(false);
    setTurns((current) => [
      ...current,
      { id: answerId, role: "assistant", content: "", streaming: true },
    ]);

    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        write(answerId, buffer);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    } finally {
      setTurns((current) =>
        current.map((t) => (t.id === answerId ? { ...t, streaming: false } : t)),
      );
    }
  };

  return (
    <AIChat
      messages={turns}
      pending={pending}
      onSend={ask}
      onStop={() => abort.current?.abort()}
      composerFooter={<small>May be wrong — check numbers before deciding.</small>}
    />
  );
}
```

What you get for free in that snippet:

| You did | The component does |
| --- | --- |
| `pending` while the request is out | Shows the three dots and already swaps **Send** for **Stop** |
| `streaming: true` on the last turn | Draws the `▍` caret at the end of the text and hides that turn's actions |
| Rewrites `content` per chunk | Scrolls to follow — **only if** the reader was already at the bottom |
| `onStop` | Stop button in the send slot, and `Escape` in the field aborts too |
| `streaming: false` at the end | Caret goes away, actions come back, and a screen reader hears "Response complete" |

!!! tip "If your backend speaks SSE, use the SDK's `createEventStream`"
    The loop above is `fetch` + `ReadableStream` because that is the common path for LLM APIs. For a real `text/event-stream` endpoint, the SDK's [`sse`](../sse.md) already handles reconnection and `Last-Event-ID` — the `write()` loop is the same.

#### Reasoning (extended thinking / R1)

A turn with `reasoning` gets a collapsible block **above** the answer:

```tsx
{
  id: "a1",
  role: "assistant",
  content: "There are 12 orders.",
  reasoning: "Filtered by overdue delivery date and status != delivered…",
}
```

!!! info "While only the reasoning has arrived, the block opens itself"
    If the turn has `streaming: true` and `content` is still empty, the reasoning block mounts **open** — it is the only content there is, and hiding it would leave the screen frozen behind a blinking caret. Once the answer lands the block stays open (collapse it if you want); `defaultReasoningOpen` opens **all** of them, which is what an audit screen wants.

#### Per-turn actions

| Action | Appears on | Prop that enables it |
| --- | --- | --- |
| Copy | every turn | always (copies the **raw** Markdown, not the HTML) |
| Regenerate | **only** the newest assistant turn | `onRegenerate` |
| 👍 / 👎 | assistant turns | `onFeedback` |
| Edit | user turns | `onEditSubmit` |
| Retry | a turn carrying `error` | `onRetry` |

```tsx
<AIChat
  messages={turns}
  onRegenerate={(turn) => reask(turn)}
  onFeedback={(turn, vote) => track("answer_rated", { id: turn.id, vote })}
  onEditSubmit={(turn, text) => {
    truncateAfter(turn.id);   // your app decides what goes
    return ask(text);
  }}
  votes={savedVotes}          // optional: votes loaded from your database
/>
```

!!! warning "Regenerate shows up on the newest assistant turn only — on purpose"
    Re-asking a turn in the middle throws away **every** turn after it. That is a different operation ("branch here") and needs its own confirmation; offering the same button for both invites losing half a conversation in one click.

!!! info "Editing does not decide what to delete"
    `onEditSubmit` hands you the turn and the new text. Truncating the transcript is the app's call, because "drop everything after" and "create a branch" are different products and the SDK should not pick for you.

#### Suggested prompts and the empty state

```tsx
<AIChat
  messages={[]}
  onSend={ask}
  suggestions={["Summarise the latest report", "Which orders are late?"]}
/>
```

On an empty conversation the suggestions sit at the bottom of the transcript area; clicking one sends it straight away. They disappear on the first turn. Without `onSend` they are not rendered (there would be nowhere to send them) and the `EmptyState` shows instead — or your `emptyState`.

#### Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `messages` | `AIChatMessage[]` | — | The transcript, **oldest first**. Never reordered. |
| `onSend` | `(text: string) => void \| Promise<void>` | — | Renders the composer. Receives the trimmed prompt. |
| `onStop` | `() => void` | — | Aborts the turn in flight. Swaps send for stop; `Escape` aborts too. |
| `pending` | `boolean` | `false` | Request is out, nothing back yet. |
| `onRegenerate` | `(message) => void` | — | Enables "regenerate" on the newest assistant turn. |
| `onEditSubmit` | `(message, text) => void \| Promise<void>` | — | Enables "edit" on user turns. |
| `onFeedback` | `(message, vote) => void` | — | Enables 👍/👎. `vote` ∈ `"up" \| "down"`. |
| `onRetry` | `(message) => void` | — | Enables retry on a turn carrying `error`. |
| `onSendError` | `(error: unknown) => void` | — | Error from `onSend` **or** `onEditSubmit`. Draft preserved. |
| `votes` | `Record<string, AIChatVote>` | — | Votes the app owns. Without it the pressed state is local. |
| `suggestions` | `string[]` | `[]` | Prompts offered on an empty conversation. |
| `renderAvatar` | `(message) => ReactNode` | — | Avatar per turn. |
| `renderContent` | `(message) => ReactNode` | — | Replaces the body — a tool-call card, a chart, a citation list. |
| `showSystem` | `boolean` | `false` | Show `"system"` turns. |
| `defaultReasoningOpen` | `boolean` | `false` | Open every reasoning block. |
| `showLineNumbers` | `boolean` | `false` | Line numbers in fenced code. |
| `header` | `ReactNode` | — | Bar above the transcript, inside the panel. |
| `composerActions` | `ReactNode` | — | Before the send button — attach, model picker. |
| `composerFooter` | `ReactNode` | — | Under the field — token count, disclaimer. |
| `composerDisabled` | `boolean` | `false` | No credits, conversation archived, offline. |
| `maxRows` | `number` | `8` | Largest composer height, in lines. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Labels ("Stop", "Reasoning", "You"…). |
| `emptyState` | `ReactNode` | `<EmptyState/>` | Empty conversation. |

`AIChatMessage = { id, role, content, reasoning?, streaming?, error?, createdAt?, model?, attachments?, data? }` · `role` ∈ `"user" \| "assistant" \| "system"`.

`AIChatAttachment = { id, name, size?, url?, mimeType? }` — with `url` it renders a thumbnail, without it a chip with name and size.

#### Decisions worth knowing

!!! info "The answer is Markdown, the prompt is plain text"
    A model emits Markdown by contract. A person who typed `compute 2 * 3 * 4` did not mean to open an emphasis span — and seeing your own prompt rewritten is unsettling. So a user turn is `white-space: pre-wrap` and an assistant turn goes through [`Markdown`](#markdown) (which already uses [`CodeBlock`](utility.md#codeblock) for fenced blocks). Want Markdown in the prompt too? `renderContent`.

!!! tip "The answer is the document, not a bubble"
    An assistant turn takes the full width with no bubble; a user turn is a narrow bubble pushed to the end of the row. Wrapping the answer in a bubble would cap its width, fight the tables and code blocks inside it, and make a long answer look like a shouted message. The prompt is short and needs to be told apart at a glance, which a bubble does better than anything else.

!!! danger "The transcript is **not** `aria-live` — and that is accessibility, not an oversight"
    A live region over streaming text makes a screen reader read the answer again on every token: unusable. So the `role="log"` carries no `aria-live`, and the two moments that matter ("Generating a response", "Response complete") are announced by a separate `role="status"`. The turn in flight carries `aria-busy`, and the finished answer is read from the log at the reader's own pace. jsdom's `axe` cannot catch this class of mistake — it was a design decision, verified in a real browser.

!!! tip "Scrolling follows the answer only if you were already at the bottom"
    Same rule as [`Chat`](#chat), and it weighs more here: a transcript that always jumps to the newest text would yank the reader **dozens of times per second** while streaming. When you are not at the bottom, a round button appears to take you back — the jump never happens unasked.

!!! warning "The scroll effect's dependency is not the list"
    Streaming appends to the **last** turn. An app that mutated that object in place — or that re-rendered from a store holding the same array — would keep the same dependency while the text grows, and the view would stop following the answer. Hence `tailSignature()` (exported): array length + tail identity + tail text length cover both shapes.

!!! info "Only the growing turn re-parses"
    `Markdown` parses in its own render, and React skips re-rendering a child whose element is referentially identical. Holding that element across renders is what keeps a fifty-turn transcript from re-parsing every finished answer on every token of the newest one.

!!! tip "Stop takes the send slot, not a button next to it"
    The one button under your thumb is always the one you want next: send while idle, abort while the answer is coming. Two buttons side by side would mean aiming at the right one mid-stream.

!!! warning "An action hidden behind `:hover` does not exist on touch"
    The action row appears on hover and on keyboard focus, and is **always** visible where there is no hover at all (`@media (hover: none)`). Without that, on a phone the first tap would land on whatever is underneath.

#### `AIChatComposer` and `AIChatTurn`

Exported separately for apps that build their own layout — a composer pinned to the footer of a route, a side-by-side diff of two answers. Same relevant props as the panel, and `AIChatComposer` is **uncontrolled** for the same reason as [`ChatComposer`](#chatcomposer): a draft changes on every keystroke, and lifting that into app state re-renders the whole transcript per character — with a streaming answer above, that is visible.

| Exported helper | What it is for |
| --- | --- |
| `visibleTurns({ messages, showSystem })` | The list the panel actually renders. |
| `isGenerating(messages)` | Whether any turn is streaming. |
| `lastAssistantId(messages)` | Which turn gets "regenerate". |
| `tailSignature(messages)` | An effect dependency that changes when the tail grows. |
| `aiChatStrings(locale)` · `roleLabel(role, strings)` · `turnTime(ts, locale)` | Labels, to reuse in your own layout. |

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
- **Conversation**: `Chat` for a thread between people (author, delivery, typing) and `AIChat` for a conversation with a model (role, streaming, reasoning, re-asking). They are different components, not variants.
- All share the same controlled/uncontrolled patterns, expose keyboard A11y, and import from `tempest-react-sdk`.
