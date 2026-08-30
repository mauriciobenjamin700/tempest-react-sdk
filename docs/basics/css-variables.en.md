# Custom properties and theming

!!! tip "Skip this page if you already know…"

    - that `--my-colour` is a real CSS property, and that it **inherits**;
    - the difference between `var(--x)` and `var(--x, fallback)`;
    - why overriding on a subtree changes only that part of the screen;
    - why a custom property beats a preprocessor variable.

## The problem

An app with the brand colour written into forty files:

```css
.button {
    background: #3b82f6;
}
.link {
    color: #3b82f6;
}
.badge {
    border-color: #3b82f6;
}
```

Changing the brand is forty edits. Supporting a dark theme is forty **pairs** of
edits. And a customer who wants their own colour is impossible without a rebuild.

## The fix is one line

A custom property is a CSS property like any other — the name just starts with `--`
and the value is yours:

```css
:root {
    --brand: #3b82f6;
}

.button {
    background: var(--brand);
}
```

Now the brand lives in one place. But what makes this the entire theming strategy
is not the centralisation — it is the **inheritance**.

## A complete example

Single file. Open it in a browser: both cards are the **same** CSS, and one of them
is dark.

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Custom properties</title>
        <style>
            :root {
                --bg: #ffffff;
                --text: #101828;
                --brand: #3b82f6;
                --radius: 8px;
            }

            [data-theme="dark"] {
                --bg: #0b0d12;
                --text: #f1f3f8;
                --brand: #7aa2ff;
            }

            .card {
                background: var(--bg);
                color: var(--text);
                border: 1px solid var(--brand);
                border-radius: var(--radius);
                padding: 16px;
                margin-bottom: 12px;
                font-family: system-ui, sans-serif;
            }

            .card button {
                background: var(--brand);
                color: var(--bg);
                border: 0;
                border-radius: var(--radius);
                padding: 8px 16px;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <p>Light — uses the values from <code>:root</code>.</p>
            <button type="button">Action</button>
        </div>

        <div class="card" data-theme="dark">
            <p>Dark — same rules, values overridden right here.</p>
            <button type="button">Action</button>
        </div>
    </body>
</html>
```

Not one `.card` rule was duplicated. The second card redefines three values on
itself, and **everything below it** — including the `<button>`, styled by the
`.card button` rule — starts resolving `var(--brand)` to the new value.

### Why this works

Custom properties inherit. `var(--brand)` is not "read the global variable": it is
"read the value of `--brand` **on this element**", and if this element did not
define it, the value comes from the parent, and its parent, up to `:root`.

That chain is what makes subtree theming possible. And it is why a Sass variable
does **not** do the same: `$brand` is resolved at build time and disappears from
the CSS. A custom property exists at runtime — JS can read and write it.

```js
// read
getComputedStyle(document.documentElement).getPropertyValue("--brand");

// write
document.documentElement.style.setProperty("--brand", "#e11d48");
```

## `var()` with a fallback

The second argument is the value used when the property is **not defined**:

```css
.card {
    padding: var(--card-padding, 16px);
}
```

That creates a **knob**: consumers may define `--card-padding` to change the
spacing, and those who do not get `16px`. Unlike a token — a named design decision
that is always defined — a knob exists precisely to be optional.

!!! tip "The SDK's CSS linter treats the two differently"

    `tempest doctor` reports `var(--does-not-exist)` without a fallback as a
    missing token, and **never** reports `var(--x, fallback)`. That rule came out of
    dogfooding: the first version of the analysis flagged 47 problems in the SDK's
    own CSS, and 43 of them were the knob idiom. The false-positive rate decides
    whether a tool gets read or ignored.

## Where it shows up in the SDK

This is the **entire** theming strategy of `tempest-react-sdk`. There is no colour
prop, no JS theme object, no provider required for styling: there are `--tempest-*`
tokens defined on `:root` and redefined under `[data-tempest-theme="dark"]`.

```css
:root {
    --tempest-bg: #ffffff;
    --tempest-surface: var(--tempest-gray-50);
    --tempest-text: var(--tempest-gray-900);
    --tempest-primary: var(--tempest-primary-500);
}

[data-tempest-theme="dark"] {
    --tempest-bg: #0b0d12;
    --tempest-text: #f1f3f8;
}
```

Customising the whole app means overriding in your own CSS, imported afterwards:

```css
:root {
    --tempest-primary: #e11d48;
    --tempest-radius-md: 4px;
}
```

Done — every `<Button>`, `<Badge>`, `<Input>` and the rest repaint. You touched no
selector, so there is no specificity fight ([CSS: cascade](css.md)).

!!! info "Dark by attribute, not by class"

    The SDK uses `data-tempest-theme="dark"`, not `class="dark"`. The reason is this
    page's example: because the attribute can sit on **any** element, you can darken
    a subtree — a preview, a drawer, a panel — without darkening the page. A global
    class would not give you that for free.

    `<ThemeProvider>` manages the attribute, and `themeInitScript` applies it
    **before** the first paint so the page does not flash white. Details in
    [Theme](../theme.md).

!!! warning "A text token validated against one background does not hold over another"

    `--tempest-text-subtle` is resolved against `--tempest-bg` and
    `--tempest-surface`, and it **fails** 4.5:1 over `--tempest-primary-soft`. Over a
    tinted surface, use that surface's foreground (`--tempest-primary-on-soft`) and
    de-emphasise by **size**, not colour. This happened twice in the SDK and both
    times it only showed up in a real browser — `axe` in jsdom disables the contrast
    check because nothing is painted.

## Recap

- A custom property is a real CSS property: `--x` **inherits** from the parent up to
  `:root`. ✅
- Overriding on a subtree changes only that part of the screen — that is what makes
  regional theming possible.
- It exists at runtime; JS reads it with `getPropertyValue` and writes it with
  `setProperty`. A Sass variable disappears at build time.
- `var(--x, fallback)` is an optional **knob**; `var(--x)` is a token that should
  exist.
- In the SDK: `--tempest-*` tokens on `:root`, dark theme under
  `[data-tempest-theme="dark"]`, and customising means overriding a token — never
  fighting a selector.

📚 **Canonical reference:** [MDN — Custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)

➡️ **Next page:** [JavaScript: value, reference, scope](js.md)
