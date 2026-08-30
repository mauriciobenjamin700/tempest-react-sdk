# Box, flow, flex and grid

!!! tip "Skip this page if you already know…"

    - what `box-sizing: border-box` changes in the width arithmetic;
    - the difference between the main axis and the cross axis in flexbox;
    - when grid is the answer and when flex is;
    - why a *container query* answers better than a *media query*.

## The problem

You want two 50% columns side by side, with some breathing room:

```css
.column {
    width: 50%;
    padding: 16px;
    float: left;
}
```

And they wrap onto separate lines. The reason is the **box arithmetic**: by
default, `width: 50%` is the width of the **content**, and `padding` is added
outside it. Each column takes `50% + 32px`, and two of those do not fit in 100%.

One line fixes it, and it is the first line of any modern stylesheet:

```css
*,
*::before,
*::after {
    box-sizing: border-box;
}
```

With `border-box`, `width: 50%` starts including `padding` and `border`. The
arithmetic closes.

## The box model

Every element is four concentric rectangles:

```
┌──────────── margin ────────────┐
│ ┌────────── border ──────────┐ │
│ │ ┌──────── padding ───────┐ │ │
│ │ │       content          │ │ │
│ │ └────────────────────────┘ │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- **content** — the text or the image.
- **padding** — breathing room **inside**, painted with the element's background.
- **border** — the line.
- **margin** — breathing room **outside**, transparent. Adjacent vertical margins
  **collapse** into each other (two 16px margins become one 16px gap, not 32px) —
  which is why `gap` tends to be more predictable.

## Flexbox: one dimension

Flex distributes children along **one** axis. It is the tool for a bar, a toolbar,
a row of buttons, a vertical list.

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Flex</title>
        <style>
            *,
            *::before,
            *::after {
                box-sizing: border-box;
            }
            .bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px;
                border: 1px solid #ddd;
            }
            .title {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        </style>
    </head>
    <body>
        <div class="bar">
            <strong class="title">A very long title that does not fit in the whole bar</strong>
            <button type="button">Edit</button>
            <button type="button">Delete</button>
        </div>
    </body>
</html>
```

| Property                        | What it does                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `display: flex`                 | Turns on the main axis (horizontal by default).                              |
| `justify-content`               | Distributes along the **main** axis.                                          |
| `align-items`                   | Aligns along the **cross** axis (vertical, here).                             |
| `gap`                           | Space between children, with no collapsing margins.                           |
| `flex: 1`                       | "Grow to take the leftover room."                                             |
| `min-width: 0`                  | The truncation unlock — see below.                                            |

!!! warning "`min-width: 0` is the missing line in 90% of broken truncations"

    A flex item's default minimum size is `auto`, which is **the size of its
    content**. Long text simply refuses to shrink, and pushes the buttons out of
    the bar. `min-width: 0` says "you may shrink below your content", and only then
    does `text-overflow: ellipsis` do anything.

## Grid: two dimensions

Grid defines rows **and** columns at once. It is the tool for page layout, a
two-column form, a card gallery.

```css
.gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}
```

That single line is an entire responsive layout, **with no media query**: "as many
columns as fit, each at least 240px, splitting the leftover evenly".

!!! info "Rule of thumb"

    One direction and the content decides the size → **flex**. Two directions and
    the container decides the size → **grid**. A button bar is flex; the whole page
    is grid.

## Container query: the right breakpoint

A media query asks about the size of the **window**. Almost always the wrong
question: a component inside a 320px sidebar, in a 1600px window, gets the desktop
layout and ends up squashed.

A container query asks about the size of the **container**:

```css
.panel {
    container-type: inline-size;
    container-name: panel;
}

@container panel (min-width: 40rem) {
    .card {
        grid-column: span 6;
    }
}
```

The same component works full-bleed, inside a sidebar, or inside a drawer — because
the question became about the space it **actually** has.

## Where it shows up in the SDK

The SDK publishes an **opt-in** layout sheet, `utilities.css`, which is not in the
default bundle. Import it when you want it:

```ts
import "tempest-react-sdk/styles.css";
import "tempest-react-sdk/utilities.css"; // optional
```

It ships the recipes above already named — `.tempest-stack`, `.tempest-cluster`,
`.tempest-row`, `.tempest-grid-auto`, `.tempest-sidebar-layout`,
`.tempest-form-grid` — plus the whole-page recipe, the dashboard:

```html
<div class="tempest-dashboard">
    <section class="tempest-widget tempest-widget-half">Sales</section>
    <section class="tempest-widget tempest-widget-half">Visits</section>
    <section class="tempest-widget tempest-widget-tall">Time series</section>
</div>
```

`.tempest-dashboard` is a 12-column grid with `container-type: inline-size`, and the
widget spans open in two steps — 40rem and 64rem — of the **container**, not the
window. A widget is born full width, because a dashboard read on a phone is a
single column, and that is where it spends most of its life.

Details and the full list in [Styles & Design Tokens](../styles.md).

## Recap

- `box-sizing: border-box` makes `width` include `padding` and `border` — it is the
  first line of your stylesheet. ✅
- Adjacent vertical margins collapse; `gap` does not, which is why it is more
  predictable.
- Flex is **one** dimension (bar, toolbar); grid is **two** (page, gallery, form).
- `min-width: 0` is what lets a flex item shrink below its content — without it
  `ellipsis` does nothing.
- A container query asks the container's size, which is the right question for a
  reusable component.
- In the SDK, `utilities.css` is **opt-in** and ships these recipes named,
  including `.tempest-dashboard` with container-query spans.

📚 **Canonical reference:** [MDN — Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout) · [MDN — Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)

➡️ **Next page:** [Custom properties and theming](css-variables.md)
