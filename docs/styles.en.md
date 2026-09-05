# Styles & Design Tokens

The SDK exposes a set of CSS Custom Properties (`--tempest-*`) that control the
entire appearance of the components. Consumer apps customize the theme by
overriding these tokens — **there's no need to touch CSS Modules**.

```tsx
import "tempest-react-sdk/styles.css";
```

Done. Everything below is already available in your application.

!!! tip "Override tokens on `:root`"
    The only way to theme is to redefine the `--tempest-*` tokens in your own CSS.
    Put your overrides in a `:root` (or a subtree for partial scoping) **after**
    the import — never edit the SDK's CSS Modules.

!!! warning "Tokens are a public API"
    The `--tempest-*` names are part of the SDK's semver contract. See the
    [versioning policy](#token-versioning-policy) at the end of the page before
    you depend on a specific token.

<!-- gallery:utilities-css -->
[![utilities.css (camada opt-in) in the gallery](assets/gallery/utilities-css.webp)](gallery.md)

*Section `utilities-css` of the [gallery](gallery.md) — run it locally to interact.*
<!-- /gallery -->

## Summary

- [Color](#color)
  - [Brand — primary tints](#brand-primary-tints)
  - [Neutrals — gray scale](#neutrals-gray-scale)
  - [Status — triplets (fg/bg/border/solid)](#status-triplets-fgbgbordersolid)
  - [Data viz — series colors](#data-viz-series-colors)
  - [Generating the palette with `createTheme`](#generating-the-palette-with-createtheme)
- [Typography](#typography)
- [Spacing](#spacing)
- [Radius](#radius)
- [Elevation (shadow)](#elevation-shadow)
- [Motion](#motion)
- [The document surface](#the-document-surface)
- [`color-scheme` — the surfaces the browser paints](#color-scheme-the-surfaces-the-browser-paints)
- [Focus ring](#focus-ring)
- [Z-index](#z-index)
- [Density — `data-tempest-density`](#density-data-tempest-density)
- [Dark theme — `data-tempest-theme`](#dark-theme-data-tempest-theme)
- [Components — available variants](#components-available-variants)
- [Opt-in utility layer — `utilities.css`](#opt-in-utility-layer-utilitiescss)

---

## Importing less CSS

`tempest-react-sdk/styles.css` carries all ~150 components. The JavaScript you
import is tree-shaken; **the CSS is not** — so an app using thirteen components
downloads the other hundred and forty.

To pay only for what you mount, import the foundation plus the sheets you want:

```ts
import "tempest-react-sdk/styles/core.css";
import "tempest-react-sdk/styles/Button.css";
import "tempest-react-sdk/styles/Modal.css";
```

Measured in a real Vite app, the same twelve components mounted both ways:

| Import | raw | gzip |
| --- | --- | --- |
| `styles.css` | 236.71 kB | 35.38 kB |
| `core.css` + 7 groups | 155.43 kB | 23.38 kB |
| `core.css` + 12 components | **38.94 kB** | **7.70 kB** |

!!! danger "`core.css` is not optional"
    It carries the reset, tokens, typography, motion, density, responsive and
    print layers — **no** component sheet repeats any of it. Importing
    `Button.css` without `core.css` gives you a button with no colour, no spacing
    and no font.

### Three granularities

| Entry | What it carries | When |
| --- | --- | --- |
| `styles.css` | everything | one line, and the weight does not bother you |
| `styles/core.css` | foundation, zero components | always, alongside any of the others |
| `styles/<Group>.css` | a whole family | you use most of it |
| `styles/<Component>.css` | one component | you want the minimum |

Available groups: `actions`, `advanced`, `br`, `chat`, `data`, `editor`,
`feedback`, `forms`, `geo`, `icons`, `identity`, `layout`, `media`,
`navigation`, `overlay`, `utility`. A component file is named after the
component — `styles/DataTable.css`, `styles/Slider.css`.

!!! tip "One file per component, one public path"
    The package `exports` publishes this as **one** subpath pattern
    (`"./styles/*.css"`), not as 125 entries. Fine granularity without 125 paths
    pinned by semver.

!!! note "The split is exact, not a prune"
    Every class is hashed per CSS module (`tempest_[local]_[hash]`), and every
    `dist/**/*.module.js` carries its source path alongside the names that module
    declares — attributing a rule to a component is a lookup, not a guess. The
    build **fails** if any rule names classes from two modules, which is what
    would make it one.

## Color

### Brand — primary tints

Scale `50` (lightest) → `900` (darkest). Use `--tempest-primary` as the canonical
action color.

```css
--tempest-primary-50: #eef4ff;
--tempest-primary-100: #d9e6ff;
--tempest-primary-500: #0066ff; /* === --tempest-primary */
--tempest-primary-700: #003d99;
--tempest-primary-900: #001f4d;
```

Aliases:

- `--tempest-primary` = primary-500
- `--tempest-primary-hover` = primary-600 in light, primary-**600** in dark (the dark ramp is inverted, so 600 is **lighter** than 500)
- `--tempest-primary-active` = primary-700
- `--tempest-primary-soft` = primary-50 (tinted background for soft buttons/badges)
- `--tempest-primary-foreground` = `#ffffff` in light, `#1f0606` in dark (text color **on top of** primary)
- `--tempest-primary-on-soft` = primary-600 in light, primary-700 in dark (text/icon color **on top of** `--tempest-primary-soft`)

### Text on a saturated fill: `*-on-solid`

- `--tempest-danger-on-solid` · `--tempest-info-on-solid` = `#ffffff` in light, `#1f0606` in dark
- `--tempest-success-on-solid` · `--tempest-warning-on-solid` = `#1f0606` in **both** themes
- `--tempest-neutral-on-solid` = `#ffffff` in **both** themes (the neutral fill is
  `--tempest-gray-700`, and the gray ramp does not invert)

!!! danger "`#ffffff` on a status fill is not safe, and never was"
    Measured against the **light** theme's own fills — the default — white on
    `--tempest-success-solid` is **3.30:1** and on `--tempest-warning-solid`
    **3.19:1**. Mid-green and amber simply cannot carry white text; every design
    system that ships them puts dark text on top. In the dark theme, where the fills
    are lighter, **all** of them fail: `primary` 3.68:1, `danger` 3.76:1, `info`
    3.68:1, `success` 2.28:1, `warning` 2.15:1.

    So the text colour is a token per status rather than a hardcoded `#ffffff`. The
    dark ink is a near-black tinted toward its own hue (`#1f0606`), not pure black —
    it reads as part of the swatch instead of a hole in it.

!!! info "In dark, `hover` and `active` go **lighter**"
    The primary scale is inverted for the dark theme (300 is the darkest step, 900
    the lightest), so reaching for 400/300 on hover made the button get **darker**
    under the pointer — the light-theme gesture applied to a dark surface. It also
    made the fill outrun its own text: no single foreground cleared 4.5:1 against
    `#3b82f6`, `#2563eb` and `#1a4399` at once. Going up the ramp fixes both.

!!! check "A test holds this"
    `src/styles/contrast.test.ts` computes the ratio of **every** (text, fill) pair
    the SDK renders, straight from `colors.css`, in both themes. Redefine the palette
    and drop a pair below 4.5:1 and the test fails — instead of the problem showing
    up in someone's product. jsdom's `axe` does **not** catch this: it disables
    `color-contrast` because there is no paint.

!!! check "And a browser sweep covers the rest"
    The test above measures the pairs the SDK **declares**. What it cannot see is
    what a page composes: text over a tinted surface, over an overlay, over an
    image. For that, `e2e/gallery.spec.ts` runs `axe` in real Chromium across a
    **four-cell** matrix — light and dark, at 1280px and 390px — and reads
    **both** lists axe returns.

    Reading `incomplete` is the point. `color-contrast` lands there, not in
    `violations`, whenever axe cannot resolve what is behind the text — which is
    exactly the tinted-surface case. A sweep that reads only `violations` is
    looking in the drawer the finding is not in.

    The measured numbers per cell live in `e2e/axe-baseline.json`, and the test
    fails when one **grows past the slack** — two nodes, or 2% for the big rules.
    The slack has the same design as the coverage floors, and the same reason:
    the gallery renders demos that depend on the clock, so the same build
    measured twice does not always report the same count. Measured: 87 and then
    88 `color-contrast` `incomplete` nodes, with nothing changed in between. It is a ratchet, not an allowlist: the gallery
    renders 64 demo sections and carries real accessibility debt, and failing all
    of it would leave the build red forever — which is how a gate gets deleted. A
    drop does not fail; the numbers are there to be lowered.

!!! warning "Measuring contrast without disabling `transition` gives a false positive"
    Flipping `data-tempest-theme` starts the `color` transition on every component
    that declares one, so reading `getComputedStyle` a frame or two later samples
    the **animation**: the outgoing theme's foreground against the incoming
    theme's background. Measuring the `VideoPlayer` that way gave 7.32 and then
    **2.33** between runs — and 2.33 looks exactly like a real defect.

    Inject `*{transition:none!important}` before measuring, and check that
    light → dark → light returns the same number. If it does not, the measurement
    is wrong, not the CSS.

!!! danger "Two names for one job is the gap a defect walks through"
    The dark theme shipped **73 contrast violations**, measured in Chromium, and
    the three causes were the same thing from different angles: a text token
    nobody validated against the surface it lands on.

    | Cause | Measured | Fix |
    | --- | --- | --- |
    | `--tempest-text-subtle` in dark | 4.04:1 over `surface`, 4.37 over `bg` | `#6f7889` → `#7b849a` (4.79 / 5.19) |
    | `--tempest-primary-contrast` in `Scheduler` | token **does not exist**, so the `#fff` fallback always won → 3.67:1 | points at `--tempest-primary-foreground` |
    | `--tempest-text-on-primary` | declared white in `:root` and **never** overridden in dark → 3.67:1 | follows `var(--tempest-primary-foreground)` |

    `--tempest-primary-foreground` was already right — somebody measured the
    3.68:1 and fixed it, writing in `colors.css` that "all 16 uses" pointed at
    it. The measurement was right; the count was not: `AppBar` used the twin and
    `Scheduler` used a name that does not exist.

    **If you redefine the palette, redefine both names.** And prefer the
    canonical one: `--tempest-text-on-primary` exists for compatibility and
    follows the other.

!!! warning "A `var()` with a fallback hides a token that does not exist"
    The CSS analysis in `tempest doctor` does not report `var()` **with** a
    fallback, on purpose: without that rule the knob idiom
    (`var(--tempest-card-padding, 1rem)`) produced 43 false positives and the
    tool would be ignored. The price is this blind spot —
    `var(--tempest-primary-contrast, #fff)` compiles, runs, and paints white
    forever.

    When writing a `var()` with a fallback, ask whether the name is a **knob**
    (the consumer defines it) or a **purpose token** (the SDK defines it). In
    the second case the fallback is hiding a typo.

!!! warning "Text on `primary-soft` uses `primary-on-soft`, not `primary`"
    `--tempest-primary` over `--tempest-primary-soft` yields 4.37:1 — WCAG AA
    asks for 4.5:1 on text. That is why `--tempest-primary-on-soft` exists
    (~6:1). If you redefine the palette, redefine both: overriding only
    `--tempest-primary` leaves the selected states (Toggle, ToggleGroup,
    ListTile, Stepper, NavigationRail, FileUpload) out of compliance.

To swap the entire brand:

```css
:root {
  --tempest-primary-500: #7c3aed; /* purple */
  --tempest-primary-600: #6d28d9;
  --tempest-primary-700: #5b21b6;
  --tempest-primary-soft: #ede9fe;
}
```

### Neutrals — gray scale

```css
--tempest-gray-50: #f8f9fb;
--tempest-gray-500: #667085;
--tempest-gray-900: #101828;
```

Semantic aliases:

| Token                     | Use                                   |
| ------------------------- | ------------------------------------- |
| `--tempest-bg`            | Canvas background                     |
| `--tempest-surface`       | Cards, headers, footers               |
| `--tempest-surface-2`     | Elevated surface (chip, button hover) |
| `--tempest-surface-3`     | More elevated surface                 |
| `--tempest-border`        | Default border                        |
| `--tempest-border-strong` | Higher-contrast border                |
| `--tempest-text`          | Primary text                          |
| `--tempest-text-muted`    | Secondary text                        |
| `--tempest-text-subtle`   | Tertiary text (placeholders)          |

### Status — triplets (fg/bg/border/solid)

Each status (`success`, `warning`, `danger`, `info`) exposes 4 colors:

```css
--tempest-success-fg:     /* text over soft bg */ --tempest-success-bg: /* tinted soft background */
  --tempest-success-border: /* outline border */ --tempest-success-solid: /* solid fill */;
```

Shortcuts:

- `--tempest-success` — main color (same as the dark `success` solid in light, lighter in dark).
- `--tempest-danger-hover` — variation for hover on danger solid.

Components that accept `appearance="soft|solid|outline"` (Badge, Alert, etc.)
automatically pick the right combination.

### Data viz — series colors

Eight categorical colors in cycle order, plus the chart chrome:

| Token                       | Use                                            |
| --------------------------- | ---------------------------------------------- |
| `--tempest-chart-1` … `-8`  | Series colors, applied by index (they cycle)   |
| `--tempest-chart-grid`      | Grid lines                                     |
| `--tempest-chart-axis`      | Axis lines and labels                          |

The eight are spaced by **hue** — they are categorical, not a ramp. For a sequential or diverging scale, use `--tempest-primary-*`.

The `tempest-react-sdk/charts` module reads these tokens at runtime and re-resolves when the theme flips, so overriding them moves the charts without touching a single prop:

```css
:root {
  --tempest-chart-1: #0f766e;
  --tempest-chart-2: #f97316;
}
```

!!! warning "Do not pass `var()` as a series color"
    Recharts applies color as an SVG presentation attribute, where `var()` is not resolved. That is why the SDK reads the token via `getComputedStyle` and hands over a literal color. Details in [Charts › Colors and theming](charts.md#colors-and-theming).

### Generating the palette with `createTheme`

Writing a brand's ~30 values by hand (ten steps × light/dark + aliases) is tedious and easy to get wrong in dark, where the ramp **inverts**. `createTheme` derives all of it from one color, in OKLCH:

```tsx
import { applyTheme, createTheme } from "tempest-react-sdk";

applyTheme(createTheme({ primary: "#7c3aed", radius: "lg" }));
```

It emits the same tokens documented on this page — it is sugar over the token API, not a second theming system. Full guide in [Theme › `createTheme`](theme.md#createtheme-a-whole-brand-from-one-color).

---


### Syntax colours (`--tempest-code-*`)

`CodeBlock` paints with ten tokens of its own: `comment` · `punctuation` · `string` · `number` · `keyword` · `literal` · `function` · `tag` · `attribute` · `property`.

!!! danger "Do not reuse the chart ramp for text"
    It is tempting — the eight series colours already exist and are already validated. But they are validated at the **mark** floor: 3:1, which is what WCAG asks of a graphical element. A syntax colour is **text**, and text needs **4.5:1**. Measured as text in a browser, a keyword in `--tempest-chart-1` came out at **3.47:1** on the dark surface and a string in `--tempest-chart-3` at **2.03:1** on the light one. Both pass as marks and fail as text.

Each code token was solved in OKLCH: fix the hue, then search for the highest lightness (in dark mode, the lowest) that still clears AA against **both grounds** the token can land on — the block surface, and a highlighted line once the 10% primary wash composites over it. Solving against the surface alone is not enough: the highlight moves the ground, and a keyword measured 4.17:1 on it.

`src/styles/colors.contrast.test.ts` reads `colors.css` and re-checks every token in both modes against both grounds. If you override these tokens in your app, redo that arithmetic.

## Typography

### Families

```css
--tempest-font-sans:    /* system stack */ --tempest-font-mono: /* monospace stack */
  --tempest-font-display: /* === sans, override for heading */;
```

### Sizes

| Token                 | Pixels |
| --------------------- | ------ |
| `--tempest-text-2xs`  | 10px   |
| `--tempest-text-xs`   | 12px   |
| `--tempest-text-sm`   | 13px   |
| `--tempest-text-base` | 14px   |
| `--tempest-text-md`   | 15px   |
| `--tempest-text-lg`   | 16px   |
| `--tempest-text-xl`   | 18px   |
| `--tempest-text-2xl`  | 20px   |
| `--tempest-text-3xl`  | 24px   |
| `--tempest-text-4xl`  | 30px   |
| `--tempest-text-5xl`  | 36px   |
| `--tempest-text-6xl`  | 48px   |

### Line heights

`--tempest-leading-none|tight|snug|normal|relaxed|loose` (1.0 → 1.9).

### Weights

`--tempest-weight-regular|medium|semibold|bold|extrabold` (400 → 800).

### Letter spacing

`--tempest-tracking-tight|normal|wide|wider|widest`.

---

## Spacing

Base 4px. Goes from 0 up to 24 (96px).

```css
--tempest-space-0: 0 --tempest-space-1: 4px --tempest-space-2: 8px --tempest-space-3: 12px
  --tempest-space-4: 16px --tempest-space-5: 20px --tempest-space-6: 24px --tempest-space-7: 28px
  --tempest-space-8: 32px --tempest-space-10: 40px --tempest-space-12: 48px --tempest-space-16: 64px
  --tempest-space-20: 80px --tempest-space-24: 96px;
```

---

## Radius

```css
--tempest-radius-xs: 2px --tempest-radius-sm: 4px --tempest-radius-md: 8px /* default controls */
  --tempest-radius-lg: 12px /* default cards */ --tempest-radius-xl: 16px /* modals */
  --tempest-radius-2xl: 24px --tempest-radius-full: 9999px;
```

---

## Elevation (shadow)

```css
--tempest-shadow-xs:    /* hairline, controls at rest */ --tempest-shadow-sm: /* default card */
  --tempest-shadow-md: /* card hover, dropdown */ --tempest-shadow-lg: /* drawer, popover */
  --tempest-shadow-xl: /* modal */ --tempest-shadow-inner: /* tracks, sunken inputs */;
```

Shadows are automatically darker in the dark theme.

---

## Motion

### Duration

```css
--tempest-duration-instant: 0ms --tempest-duration-fast: 120ms /* hover, focus */
  --tempest-duration-base: 180ms /* default enter/leave */ --tempest-duration-slow: 280ms
  /* drawer, modal */ --tempest-duration-slower: 420ms;
```

### Easing

```css
--tempest-ease-linear
--tempest-ease-in
--tempest-ease-out
--tempest-ease-in-out
--tempest-ease-emphasized  /* enter animations */
--tempest-ease-bounce
```

### Composite shortcuts

```css
--tempest-transition-color:      /* color + bg + border, fast */ --tempest-transition-shadow:
  /* box-shadow, base */
  --tempest-transition-transform: /* transform, fast */
  --tempest-transition-base: /* everything above + opacity */;
```

### Reduced motion

`@media (prefers-reduced-motion: reduce)` zeroes out all token durations
automatically. Components that use heavy keyframes (modal, drawer, toast,
tooltip, skeleton) also detect it and disable their specific animations.

---

## The document surface

Before any component, `styles.css` claims the `body`:

```css
:where(html, body, #root) {
    height: 100%;
}

body {
    margin: 0;
    background-color: var(--tempest-bg);
    color: var(--tempest-text);
}
```

That is three promises, and it is worth knowing which is which.

**The margin.** The user agent gives `body` an 8px `margin`. That is not
cosmetic next to `AppShell`, which is `min-height: 100dvh`: the document then
measures `100dvh + 16px`, so a page that **fits** the viewport opens with a
vertical scrollbar.

**The paint.** `ThemeProvider` writes `data-tempest-theme` on `<html>` and the
tokens live on `:root`, but that alone paints nothing — it only declares. Without
the rule above, the area behind the shell stays white in the dark theme, framing
the content on all four sides, and any element with no background of its own
resolves up to a white `body`.

**The height chain.** `height: 100%` is a percentage, and a percentage needs a
parent with a resolved height. Without all three links, a percentage-height shell
collapses onto its content instead of filling the viewport.

!!! tip "Zero specificity on the height chain"
    `#root` is markup this sheet does **not** draw — the id is your convention,
    not the SDK's. So the chain goes inside `:where()`, which adds no
    specificity: any rule of yours beats it without `!important`.

    ```css
    #root { height: auto; }
    ```

!!! note "Changing the background is one declaration"
    `body` is a 0-0-1 selector. An app that wants a different background — an
    image, a gradient, a brand colour — overrides it normally:

    ```css
    body { background: linear-gradient(180deg, #0b0d12, #14171f); }
    ```

!!! info "What the reset does **not** decide"
    The document's type family. The SDK declares `--tempest-font-sans` but does
    not apply it to `body`: which font the whole page renders in is the app's
    call, and an SDK that imposed it would cap anyone shipping their own.

    ```css
    body { font-family: var(--tempest-font-sans); }
    ```

## `color-scheme` — the surfaces the browser paints

Tokens do not reach everything. The `<select>` dropdown popup, the scrollbar, the
autofill wash, the date picker, the `input[type=number]` spinner and the default
canvas are drawn by the **user agent**, from a single property:

```css
:root {
    color-scheme: light;
}

[data-tempest-theme="dark"] {
    color-scheme: dark;
}
```

The SDK ships both. You do not have to do anything — but it is worth knowing they
are there, because it is what explains why an `<input>` with **no styling at all**
inside your app already comes out dark in the dark theme.

!!! danger "Reading `prefers-color-scheme` is not declaring `color-scheme`"
    Two different things with similar names, and confusing them cost 58 releases.
    `ThemeProvider` always **read** the media query to resolve the `"system"`
    mode. Declaring the property is what tells the browser which palette to paint
    the things it draws itself from.

    Measured in Chromium with `data-tempest-theme="dark"` on and the property
    absent: `getComputedStyle(document.documentElement).colorScheme` came back
    `"normal"`, a class-less `<select>` painted `#efefef` and a class-less
    `<input>` painted `#ffffff`, both carrying the dark theme's `#f1f3f8` text —
    **1.03:1** and **1.11:1**.

!!! tip "Partial scope works"
    The declaration goes on the attribute selector rather than in a media query,
    so a dark subtree inside a light page gets dark native controls too:

    ```html
    <aside data-tempest-theme="dark">
        <select><!-- dark popup --></select>
    </aside>
    ```

## The reset and your markup

`styles.css` ships a modern reset, and one of its rules reaches elements the SDK
does not draw:

```css
img, svg, video, canvas, audio, iframe, embed, object {
    display: block;
    max-width: 100%;
}
```

Making media block-level removes the phantom gap under an inline image, which is
why every modern reset has this rule. But a user-agent `<button>` centres its
content with `text-align: center`, and `text-align` only reaches inline boxes —
so a lone icon inside a button of **yours** would sit flush against the left
edge.

The SDK ships the counterweight alongside it:

```css
:where(button, a, label, summary) > svg:only-child {
    margin-inline: auto;
}
```

!!! tip "Zero specificity, on purpose"
    `:where()` adds no specificity, so **any** rule of yours beats this one
    without `!important`. Centred is the default; a different alignment is one
    ordinary declaration:

    ```css
    .toolbar button > svg { margin-inline: 0; }
    ```

!!! note "Only for a lone icon"
    `:only-child` keeps the rule to the icon-only button. An icon beside a label
    already lives in a flex row of yours, where `margin: auto` would shove the
    text — that case keeps whatever alignment you gave it.

## Focus ring

```css
--tempest-focus-ring-color: rgba(0, 102, 255, 0.35) --tempest-focus-ring-width: 3px
  --tempest-focus-ring-offset: 2px;
```

A global `:focus-visible` is applied in `reset.css`. Interactive components
(Button, interactive Card, Tabs, Pagination, etc.) re-apply the ring with tokens.

To customize the ring per subtree (e.g. a white-label theme):

```css
.my-app {
  --tempest-focus-ring-color: rgba(124, 58, 237, 0.4);
}
```

---

## Z-index

```css
--tempest-z-base: 0 --tempest-z-raised: 10 --tempest-z-dropdown: 1000 --tempest-z-sticky: 1020
  --tempest-z-overlay: 1050 --tempest-z-modal: 1100 --tempest-z-popover: 1150
  --tempest-z-toast: 1200 --tempest-z-tooltip: 1300;
```

---

## Density — `data-tempest-density`

An attribute applied to any element (usually `<html>` or `<body>`) adjusts the
height, padding, font-size, and radius of every control in the subtree.

```html
<html data-tempest-density="compact"></html>
```

Values: `compact` | `comfortable` (default) | `spacious`.

Controlled tokens:

```css
--tempest-control-height-xs..xl
--tempest-control-padding-xs..xl
--tempest-control-font-xs..xl
--tempest-control-radius
--tempest-control-gap
```

Button, Input, Select, and Textarea already read these tokens — just swap the
attribute on the root and everything resizes together.

---

## Dark theme — `data-tempest-theme`

```html
<html data-tempest-theme="dark"></html>
```

An attribute applied to any element enables the dark theme only in that subtree.
Color tokens (primary scale, neutrals, status, focus ring, shadow) are all
overridden.

Use it together with `<ThemeProvider>` (`tempest-react-sdk/theme`) for
persistence + flash prevention.

!!! warning "Use `data-tempest-theme=\"dark\"`, not `class=\"dark\"`"
    The SDK's dark mode toggles on the `data-tempest-theme` attribute, never on a
    `dark` class. This lets you scope the dark theme to a specific subtree instead
    of the whole document — something the class convention can't do.

---

## Components — available variants

### Button

```tsx
<Button variant="primary | secondary | danger | success | ghost | soft | outline | link" />
<Button size="xs | sm | md | lg | xl" />
<Button iconOnly aria-label="..." />
<Button pill />
<Button loading />
```

### Badge

```tsx
<Badge
  variant="neutral | primary | success | warning | danger | info"
  appearance="soft | solid | outline"
  size="sm | md | lg"
  shape="pill | square"
  dot
/>
```

### Alert

```tsx
<Alert variant="neutral | info | success | warning | danger"
       appearance="soft | solid | outline"
       title="..."
       description="..."
       icon={<Icon />}
       onClose={() => ...} />
```

### Card

```tsx
<Card elevation="flat | default | raised | elevated"
      interactive
      title="..."
      actions={...}
      footer={...} />
```

### Input

```tsx
<Input size="sm | md | lg" />
```

### Spinner

```tsx
<Spinner size="xs | sm | md | lg | xl" />
```

### Divider

```tsx
<Divider
  orientation="horizontal | vertical"
  variant="solid | dashed"
  label="OR"
  align="start | center | end"
/>
```

### Kbd

```tsx
<Kbd size="sm | md | lg">Ctrl</Kbd>
```

---

## Importing tokens in CSS-in-JS

!!! note "The `tempest_` prefix avoids collisions"
    The classes generated by the CSS Modules come out prefixed with `tempest_`, so
    they never collide with your app's CSS or with Tailwind/Stitches/Linaria
    running side by side. You only interact with the `--tempest-*` tokens — you
    never need to know the class names.

!!! warning "CSS Modules is the SDK's only styling strategy"
    Components are styled with CSS Modules plus `--tempest-*` tokens, full stop.
    There is no headless mode and no class hook (`data-tempest-classname`) for
    Tailwind/Stitches/Linaria to take over the styling — and none is planned.
    Keeping two styling paths would double every component's surface and dilute
    the tokens.

    What you **can** do: run your favourite utility framework side by side in the
    rest of the app, read the SDK's tokens with `var(--tempest-*)`, and customise
    the SDK by overriding those tokens on `:root`.

Since the tokens are CSS Custom Properties, any solution (`styled-components`,
`emotion`, `vanilla-extract`, Tailwind arbitrary values) reads them with
`var(--tempest-*)`:

```ts
import styled from "styled-components";

const Card = styled.div`
  background: var(--tempest-bg);
  border: 1px solid var(--tempest-border);
  border-radius: var(--tempest-radius-lg);
  padding: var(--tempest-space-5);
  box-shadow: var(--tempest-shadow-sm);
`;
```

Tailwind via `theme.extend.colors`:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        tempest: {
          primary: "var(--tempest-primary)",
          bg: "var(--tempest-bg)",
          border: "var(--tempest-border)",
        },
      },
    },
  },
};
```

---

## Opt-in utility layer — `utilities.css`

Components are styled with CSS Modules, which solves the **inside** of them. What was left for the app was the **around**: the page shell, a two-column form, a row of actions, a card, a region that scrolls sideways. Every app rewrote that CSS.

`utilities.css` is that layer, written only in `--tempest-*` tokens — so it follows the theme, including whatever `createTheme` emits and dark mode.

```ts
// src/main.tsx
import "tempest-react-sdk/styles.css";
import "tempest-react-sdk/utilities.css"; // opt-in
```

!!! info "Why opt-in and not part of `styles.css`"
    It ships ~50 **global** class names. An app that already has its own layout system should not pay for them, and injecting global classes into someone's page uninvited is rude. Cost if you opt in: **1.13 KB brotli**.

!!! warning "This is not a Tailwind, and it is not becoming one"
    The layer holds a handful of layout primitives — there is no (and no plan for) `p-4 mt-2 text-sm bg-blue-500` for every possible value. The [consolidated decision](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CLAUDE.md) still holds: **CSS Modules + tokens is the components' styling strategy**. This is a tool for the *app's* code, not a second way to style the SDK.

### Layout

| Class                     | What it does                                                              | Tune with                                          |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `.tempest-container`      | Centers, caps the width, applies gutters that respect the safe area        | `--tempest-container-width`, `--tempest-container-gutter` |
| `.tempest-stack`          | Vertical flow with a single gap                                           | `--tempest-stack-gap`                              |
| `.tempest-cluster`        | Horizontal group that **wraps** instead of overflowing                     | `--tempest-cluster-gap`                            |
| `.tempest-row`            | Horizontal group that does not wrap (toolbars, inline fields)              | `--tempest-row-gap`                                |
| `.tempest-center`         | Centers the child on both axes                                            | —                                                  |
| `.tempest-spread`         | Pushes first and last child apart (title ↔ actions)                        | `--tempest-row-gap`                                |
| `.tempest-grid-auto`      | Responsive card grid with **no media query** (`auto-fill` + `minmax`)      | `--tempest-grid-min`, `--tempest-grid-gap`         |
| `.tempest-sidebar-layout` | Sidebar + content; collapses to one column below 768px                    | `--tempest-sidebar-width`, `--tempest-sidebar-gap` |
| `.tempest-form-grid`      | Two-column form that collapses below 640px                                | `--tempest-form-columns`, `--tempest-form-gap`     |
| `.tempest-form-span`      | Field taking the full row of the form grid                                | —                                                  |
| `.tempest-fill`           | Takes the remaining flex space (with `min-width: 0`, so truncation works)  | —                                                  |
| `.tempest-fixed`          | Never shrinks below its content (an icon button next to a growing field)   | —                                                  |

### Spacing, text, surfaces, scrolling

| Group      | Classes                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| Gap        | `.tempest-gap-{0,1,2,3,4,5,6,8,10,12}`                                                        |
| Padding    | `.tempest-pad-{0,2,3,4,6,8}`, `.tempest-pad-block`, `.tempest-pad-inline`                      |
| Text       | `.tempest-truncate`, `.tempest-clamp-{2,3,4}`, `.tempest-text-{muted,subtle}`, `.tempest-text-{xs,sm,base,lg,xl,2xl}`, `.tempest-weight-{medium,semibold,bold}`, `.tempest-numeric` |
| Surfaces   | `.tempest-card`, `.tempest-panel`, `.tempest-inset`, `.tempest-divider`                        |
| Scrolling  | `.tempest-scroll-x`, `.tempest-scroll-y`                                                       |
| Media      | `.tempest-aspect-video`, `.tempest-aspect-square`                                              |
| Misc       | `.tempest-visually-hidden`, `.tempest-no-select`, `.tempest-busy`                               |

!!! tip "`.tempest-numeric` exists for one specific reason"
    `font-variant-numeric: tabular-nums` stops a column of numbers from **dancing** as values change (proportional digits have different widths). Use it on value tables, live counters and `Stat`.

!!! tip "`.tempest-scroll-x` around a wide table"
    Without it, a wide table makes the **page** scroll horizontally — the most common mobile layout defect there is. With it, the scrolling stays inside the region.

### A whole page, assembled

```tsx
export function UsersPage() {
  return (
    <div className="tempest-container tempest-page">
      <header className="tempest-page-header">
        <div>
          <h1 className="tempest-page-title">Users</h1>
          <p className="tempest-page-subtitle">142 active · 8 pending invites</p>
        </div>
        <div className="tempest-cluster">
          <Button variant="secondary">Export</Button>
          <Button>Invite</Button>
        </div>
      </header>

      <div className="tempest-toolbar tempest-toolbar-sticky">
        <SearchBar className="tempest-fill" placeholder="Search by name or email" />
        <Select className="tempest-fixed" options={roles} />
      </div>

      <div className="tempest-card tempest-scroll-x">
        <DataTable data={users} columns={columns} />
      </div>

      <div className="tempest-grid-auto" style={{ "--tempest-grid-min": "220px" } as React.CSSProperties}>
        <Stat label="Active" value={142} />
        <Stat label="Invited" value={8} />
        <Stat label="Blocked" value={3} />
      </div>
    </div>
  );
}
```

Note the `style={{ "--tempest-grid-min": "220px" }}`: the local hooks are custom properties, so you tune **per instance** without writing CSS or inventing a class variant.

### Widget dashboard

The layer ships a slice for this, and what sets it apart from a plain grid is that
the columns react to the **container** width, not the viewport.

```tsx
import "tempest-react-sdk/utilities.css";

export function OperationsPage() {
  return (
    <div className="tempest-container tempest-page">
      <header className="tempest-page-header">
        <div>
          <h1 className="tempest-page-title">Operations</h1>
          <p className="tempest-page-subtitle">Last 30 days</p>
        </div>
        <Badge variant="success">live</Badge>
      </header>

      {/* Tile row: fits as many as it can, no spans */}
      <div className="tempest-stat-row">
        <div className="tempest-widget-frame">
          <span className="tempest-text-muted tempest-text-xs">Orders</span>
          <strong className="tempest-text-2xl tempest-numeric">1,284</strong>
        </div>
        {/* … */}
      </div>

      {/* 12-column grid, spans keyed on container queries */}
      <div className="tempest-dashboard">
        <section className="tempest-widget tempest-widget-two-thirds">
          <div className="tempest-widget-frame">
            <div className="tempest-widget-header">
              <h2 className="tempest-widget-title">Sales per day</h2>
              <span className="tempest-text-subtle tempest-text-xs">12 days</span>
            </div>
            <div className="tempest-widget-body">
              <Sparkline data={sales} width={320} height={72} label="Sales per day" />
            </div>
          </div>
        </section>

        <section className="tempest-widget tempest-widget-third">{/* … */}</section>
        <section className="tempest-widget tempest-widget-half">{/* … */}</section>
        <section className="tempest-widget tempest-widget-half">{/* … */}</section>
      </div>
    </div>
  );
}
```

| Class | What it does |
| --- | --- |
| `.tempest-dashboard` | a 12-column grid **and** a size container (`container-type: inline-size`) |
| `.tempest-widget` | full width by default — the state a widget spends most of its life in |
| `.tempest-widget-half` · `-third` · `-quarter` · `-two-thirds` | spans that open at **40rem and 64rem of container** |
| `.tempest-widget-tall` | `grid-row: span 2` — a chart beside a stack of tiles |
| `.tempest-stat-row` | tile row with `auto-fit`, no spans. Tune with `--tempest-stat-min` |
| `.tempest-widget-frame` · `-header` · `-title` · `-body` | the widget's own frame |

Hooks: `--tempest-dashboard-columns` (12), `--tempest-dashboard-gap`, `--tempest-widget-padding`, `--tempest-stat-min`.

!!! check "The columns belong to the container, not the viewport — and that is the point"
    Measured in a browser at a **1360px viewport**: the same dashboard inside a 440px panel renders as a **single column**; at 660px the `-third` and the `-half` share a row (`span 6`); at 1060px `-two-thirds` takes `span 8` beside `-third` at `span 4`, and the two halves split the next row.

    A media query would give the 440px panel the desktop span, and every widget in it would be one column of squashed text. Same reason `Masonry` observes its container.

!!! warning "`width: 100%` on `.tempest-page` is not decoration"
    Dropped inside a flex **row** — a preview pane, a split view — a page container is a flex item and sizes to its content: the dashboard collapsed to about 200px while its parent had 500. Only a browser shows that; in normal flow the declaration changes nothing. Found exactly that way, building this recipe in the gallery.

!!! info "`min-height: 0` on `-body` is what lets a chart fit"
    A grid child defaults to `min-height: auto`, so a canvas reporting a tall intrinsic size pushes the row instead of fitting it — and the dashboard grows a scrollbar nobody asked for.

!!! tip "A user-resizable widget is a different thing"
    Dragging a widget's edge fights the grid: the tracks come from the grid, and a pixel width from a drag cannot coexist with that. If you need it, use [`Resizable`](./components/advanced-layout.md#resizable) in a free-form area, or store the chosen span per widget and apply the matching class — which is the version that survives a reload and fits in a URL.

### Two-column form

```tsx
<Form className="tempest-form-grid" onSubmit={form.handleSubmit(onSubmit)}>
  <FormField name="name" label="Name" required><Input /></FormField>
  <FormField name="email" label="Email" required><Input type="email" /></FormField>
  <FormField name="cpf" label="CPF"><CPFInput /></FormField>
  <FormField name="phone" label="Phone"><PhoneInput /></FormField>

  <FormField name="notes" label="Notes" className="tempest-form-span">
    <Textarea rows={4} />
  </FormField>

  <FormActions align="end" className="tempest-form-span">
    <Button type="submit">Save</Button>
  </FormActions>
</Form>
```

One column on a phone, two from 640px up, and `.tempest-form-span` for whatever takes the full row.

---

## Responsive — mobile / tablet / desktop

### Breakpoints

| Token              | Pixels | Expected device |
| ------------------ | ------ | --------------- |
| `--tempest-bp-xs`  | 480px  | Small phones    |
| `--tempest-bp-sm`  | 640px  | Large phones    |
| `--tempest-bp-md`  | 768px  | Tablets         |
| `--tempest-bp-lg`  | 1024px | Laptops         |
| `--tempest-bp-xl`  | 1280px | Default desktop |
| `--tempest-bp-2xl` | 1536px | Ultrawide       |

`useBreakpoint()` / `<Show>` / `<Hide>` convention:

- **mobile** = `< md` (`< 768px`)
- **tablet** = `md..lg-1` (`768..1023px`)
- **desktop** = `>= lg` (`>= 1024px`)

### `useBreakpoint()` hook

```tsx
import { useBreakpoint } from "tempest-react-sdk";

const bp = useBreakpoint();
bp.current; // "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
bp.width; // pixels (0 on SSR)
bp.above("md"); // boolean
bp.below("lg"); // boolean
bp.isMobile; // < md
bp.isTablet; // md..lg-1
bp.isDesktop; // >= lg
```

SSR-safe — on the server it returns `xs` / `width: 0`, updating on mount.

### `<Show>` / `<Hide>` components

```tsx
<Show above="md">Desktop nav</Show>
<Show below="md">Mobile menu</Show>
<Show only="xl">Wide-only banner</Show>
<Show only={["md", "lg"]}>Tablet + laptop</Show>

<Hide above="lg">Hide on desktop</Hide>
```

### Utility classes (CSS-only, no JS)

```html
<div class="tempest-hide-mobile">desktop only</div>
<div class="tempest-show-only-mobile">mobile only</div>
<div class="tempest-hide-tablet">hide on tablets</div>
<div class="tempest-show-only-touch">touch devices only</div>
<div class="tempest-hide-print">don't print</div>
```

### Responsive components — props

#### `<Container>` — automatic responsive padding

`space-4` mobile / `space-6` tablet / `space-8` desktop.

#### `<Stack>` / `<Grid>` — props accept an object

```tsx
<Stack direction={{ mobile: "vertical", desktop: "horizontal" }} gap={{ mobile: 2, desktop: 4 }} />

<Grid columns={{ mobile: 1, tablet: 2, desktop: 3 }} gap={4} />
```

#### `<Modal>` — fullscreen / fullscreenOnMobile / 2xl / 3xl

```tsx
<Modal size="2xl" />                  // 1280px
<Modal size="3xl" />                  // 1440px
<Modal fullscreen />                  // fill viewport
<Modal fullscreenOnMobile />          // auto-fullscreen < 640px
```

Internal padding and radius already shrink below 640px.

#### `<Drawer>` — mobilePlacement + showHandle

```tsx
// desktop: right drawer; mobile: bottom-sheet
<Drawer placement="right" mobilePlacement="bottom" showHandle />
```

#### `<Table>` — priority + stackOnMobile

```tsx
<Table
  stackOnMobile
  columns={[
    { key: "name", header: "Name" }, // always visible
    { key: "email", header: "E-mail", priority: "tablet" }, // hidden < 768px
    { key: "role", header: "Role", priority: "desktop" }, // hidden < 1024px
  ]}
  data={users}
/>
```

#### `<ToastProvider>` — position

```tsx
<ToastProvider position="top-right" />        // default
<ToastProvider position="bottom-center" />    // mobile-friendly default
```

On screens `< 480px`, the container automatically stretches `left: 0; right: 0`.

### Touch targets

- `data-tempest-density="touch"` — forces a 44px minimum height on every control.
- `@media (pointer: coarse)` applies an auto-bump on `xs`/`sm`/`md` when the user is on a touch device (unless `density="compact"` is explicit).
- `Button iconOnly` size `xs`/`sm` gains an invisible 8px hit-slop on all sides on pointer coarse.

### Safe-area (iOS notch / Android gestures)

Available tokens:

```css
--tempest-safe-area-top
--tempest-safe-area-right
--tempest-safe-area-bottom
--tempest-safe-area-left
```

Toast, the Modal overlay padding, and Drawer already consume them automatically.
Remember to include this in the HTML:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### Dynamic viewport (iOS Safari address bar bug)

Modal and Drawer use `dvh` with a `vh` fallback. Apps that need full height can do
the same:

```css
.app {
  min-height: 100vh;
  min-height: 100dvh;
}
```

### Fluid type

For headings that scale with the viewport:

```css
.hero-title {
  font-size: var(--tempest-text-fluid-5xl); /* clamp(32px, 24px + 4vw, 72px) */
}
```

Tokens: `--tempest-text-fluid-sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl`.

### Hover-only effects

`transform` / `box-shadow` hover effects (interactive Card lift, Button
elevation) sit behind `@media (hover: hover) and (pointer: fine)` — they don't
fire on a mobile tap.

### Print

Everything is bundled in `print.css`:

- Modal, Drawer, Toast, Tooltip are hidden.
- Grayscale background, cards get `page-break-inside: avoid`.
- Links get their `(href)` appended next to them.

Use the `tempest-hide-print` class to hide your own elements.

---

## Token versioning policy

Tokens are a **public API**. Changes break consumer apps. Policy:

- **Additions** (new tokens) — minor bump.
- **Renames / removals** — major bump. Old tokens stay as deprecated aliases for at least 1 minor before removal.
- **Value changes** that visibly affect appearance (primary color, default radius, font stack) — minor bump + a changelog note.

---

## Recap

- Import `tempest-react-sdk/styles.css` once; theme by overriding `--tempest-*`
  tokens on `:root` (or a subtree).
- Dark mode toggles via `data-tempest-theme="dark"`; density via
  `data-tempest-density` — both scopable to any subtree.
- CSS Module classes come out prefixed with `tempest_`, with no collision with
  your app's CSS or with Tailwind/Stitches/Linaria.
- Tokens are a **public API** under semver — additions bump minor,
  renames/removals bump major.
