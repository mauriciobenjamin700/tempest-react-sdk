# Styles & Design Tokens

The SDK exposes a set of CSS Custom Properties (`--tempest-*`) that control the
entire appearance of the components. Consumer apps customize the theme by
overriding these tokens — **there's no need to touch CSS Modules**.

```tsx
import "tempest-react-sdk/styles.css";
```

Done. Everything below is already available in your application.

## Summary

- [Color](#color)
  - [Brand — primary tints](#brand-primary-tints)
  - [Neutrals — gray scale](#neutrals-gray-scale)
  - [Status — triplets (fg/bg/border/solid)](#status-triplets-fgbgbordersolid)
- [Typography](#typography)
- [Spacing](#spacing)
- [Radius](#radius)
- [Elevation (shadow)](#elevation-shadow)
- [Motion](#motion)
- [Focus ring](#focus-ring)
- [Z-index](#z-index)
- [Density — `data-tempest-density`](#density-data-tempest-density)
- [Dark theme — `data-tempest-theme`](#dark-theme-data-tempest-theme)
- [Components — available variants](#components-available-variants)

---

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
- `--tempest-primary-hover` = primary-600
- `--tempest-primary-active` = primary-700
- `--tempest-primary-soft` = primary-50 (tinted background for soft buttons/badges)
- `--tempest-primary-foreground` = `#ffffff` (text color over the primary)

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

---

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
