# CSS: selectors, cascade, specificity

!!! tip "Skip this page if you already know…"

    - how to read a specificity like `(0, 1, 0)` and say who wins;
    - that source order breaks ties between rules of equal specificity;
    - why `!important` fixes today and charges tomorrow;
    - what inherits and what does not.

## The problem

You want the button red. You write this and nothing changes:

```css
.button {
    background: red;
}
```

So you write this, and it works:

```css
.button {
    background: red !important;
}
```

The bug was not fixed — it was postponed. Somewhere there is a rule that beat
yours, and now two rules are fighting, one of them holding a weapon that can only
be answered with another `!important`. Three months later the app has forty of them
and switching themes is impossible.

It is worth knowing **who** won.

## A complete example

Single file, open it in a browser:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Cascade</title>
        <style>
            button {
                background: gray;
            }
            .button {
                background: blue;
            }
            #save {
                background: green;
            }
            .bar .button {
                background: orange;
            }
        </style>
    </head>
    <body>
        <div class="bar">
            <button id="save" class="button">Save</button>
        </div>
    </body>
</html>
```

The button comes out **green**. Four rules match it, and the `#id` one wins.

### The arithmetic

Every rule has a three-number specificity — `(id, class, type)`:

| Selector        | id  | class | type | Vector      |
| --------------- | --- | ----- | ---- | ----------- |
| `button`        | 0   | 0     | 1    | `(0, 0, 1)` |
| `.button`       | 0   | 1     | 0    | `(0, 1, 0)` |
| `.bar .button`  | 0   | 2     | 0    | `(0, 2, 0)` |
| `#save`         | 1   | 0     | 0    | `(1, 0, 0)` |

You compare **left to right**, and it is lexicographic, not a sum: `(1, 0, 0)`
beats `(0, 99, 0)`. No number of classes ever reaches one id.

Counting as **class**: `.class`, `[attribute]`, `:hover`, `:focus`, `:not(...)`
(the `:not` itself is worth zero, but what is inside counts). Counting as **type**:
`div`, `button`, `::before`. `*` is worth zero.

!!! info "Source order breaks ties — and only breaks ties"

    Two rules with the **same** specificity: the later one wins. That is how your
    app's CSS overrides a library's — as long as you import yours afterwards, at
    the same specificity.

## What beats everything

The full order the browser applies, strongest first:

1. User `!important` (the user's own stylesheet — rare)
2. Author `!important` (yours, and the library's)
3. Inline `style="..."`
4. Normal author styles, resolved by layer → specificity → source order

`!important` is not "more specificity": it **skips the whole queue**. That is why
the only answer to it is another `!important`, and why it is debt.

!!! warning "The symptom that specificity is out of control"

    You write a selector longer than it needs to be (`.page .card .title h2`) just
    to beat another one. Every time that happens, the next person needs an even
    longer one. The way out is not to escalate — it is to lower both sides.

## What inherits

Some properties pass from parent to child without you asking: `color`,
`font-family`, `font-size`, `line-height`, `text-align`, `visibility` — and
**custom properties** (`--my-colour`), which is what makes theming work.

These do not inherit: `background`, `border`, `padding`, `margin`, `display`,
`width`. They apply only to the element you wrote them on.

```css
body {
    color: #333; /* inherits: every text below becomes #333 */
    border: 1px solid red; /* does not inherit: only body gets a border */
}
```

## Where it shows up in the SDK

`tempest-react-sdk` styles **only** through CSS Modules, and every class comes out
of the build with a transformed name:

```
.button { }        →        .tempest_button_a3f9k { }
```

That is a specificity decision, not an aesthetic one. Every SDK rule is **a single
class** — `(0, 1, 0)` — because:

- **It cannot collide.** The hash guarantees the SDK's `.button` and your app's
  `.button` are different selectors. Neither needs a long selector to defend
  itself.
- **It is cheap to override.** Your own class, at the same `(0, 1, 0)`, imported
  **after** `tempest-react-sdk/styles.css`, wins on source order. You never need
  `!important` to adjust a component.

```tsx
import "tempest-react-sdk/styles.css";
import "./app.css"; // later: your overrides win the tie-break
```

!!! tip "Overriding a token beats overriding a rule"

    Most of the time you do not need a class at all: changing `--tempest-primary`
    on `:root` repaints the whole component without touching a single selector.
    That is the subject of [Custom properties and theming](css-variables.md).

!!! note "Why there is no *headless* mode"

    A recurring question is whether the SDK could emit `data-*` attributes instead
    of classes, so apps could style with Tailwind or Stitches. The answer is no,
    and the reason lives in [Styles & Design Tokens](../styles.md): keeping a second styling
    path would double every component's surface and dilute the tokens. A Tailwind
    app **coexists** with the SDK — the `tempest_` prefix guarantees nothing
    collides.

## Recap

- Specificity is the `(id, class, type)` vector, compared left to right.
  `(1,0,0)` beats `(0,99,0)`. ✅
- Source order **breaks ties** between equal specificities — that is how an app's
  CSS overrides a library's.
- `!important` is not high specificity, it is queue-jumping. It can only be
  answered with another, and that is how an app loses the ability to change
  themes.
- `color` and custom properties **inherit**; `background`, `border` and `padding`
  do not.
- In the SDK every rule is a single hashed `tempest_*` class: it cannot collide
  and it is cheap to override — import your CSS after `styles.css`.

📚 **Canonical reference:** [MDN — Cascade and inheritance](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Cascade_and_inheritance)

➡️ **Next page:** [Box, flow, flex and grid](css-layout.md)
