# Theme (dark / light)

`ThemeProvider` decides the effective theme and writes `data-tempest-theme="dark"` (or `"light"`) on `<html>`. The `--tempest-*` CSS tokens react to that attribute, so **switching the theme is switching one attribute** — no component needs to know the theme changed. See the tokens in [`src/styles/colors.css`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/src/styles/colors.css).

!!! info "Why an attribute, not `class=\"dark\"`?"
    Using `data-tempest-theme` (instead of the `class="dark"` convention) avoids clashing with the app's classes and enables partial scoping: you can apply a different theme to a subtree (preview, portal, docs) without touching the rest of the page. It is the only theming mechanism the SDK supports.

## Setup

Wrap your tree in `ThemeProvider`. The default mode is `"system"`, which follows the operating system preference:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
```

Available modes: `"light"`, `"dark"`, `"system"`. In `"system"` mode the provider listens to `prefers-color-scheme` and reacts to OS changes in real time. The user's choice is persisted in `localStorage["tempest-theme"]` (disable with `storageKey={null}`).

## Theme toggle

`useTheme()` reads and mutates the theme. A complete toggle:

```tsx
import { useTheme } from "tempest-react-sdk";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, toggle } = useTheme();

  return (
    <div>
      <button onClick={toggle}>{resolvedTheme === "dark" ? "🌙 Dark" : "☀️ Light"}</button>

      {/* or control all three modes explicitly */}
      <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
```

What each field means:

- `theme`: the user's **raw preference** — `"light"`, `"dark"` or `"system"`.
- `resolvedTheme`: the theme **actually applied** — always `"light"` or `"dark"` (never `"system"`).
- `setTheme(next)`: writes the preference (and persists it).
- `toggle()`: inverts the `resolvedTheme`. In `"system"` mode it flips to the opposite of what is applied.

!!! tip "Use `resolvedTheme` to render, `theme` for the selector"
    When deciding which icon/image to show, read `resolvedTheme` (it is always concrete). Reserve `theme` for reflecting the choice in a three-option selector.

## No-flash (avoiding the wrong-theme flash)

There is a classic problem: the HTML paints before React mounts, so for an instant the user sees the default theme before `ThemeProvider` corrects it. The fix is a synchronous inline script in the `<head>`, **before any CSS**, that applies the attribute on first paint.

`themeInitScript()` returns exactly that snippet. In a Vite `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- Applies data-tempest-theme before paint. Paste the output of themeInitScript() here. -->
    <script>
      (function () {
        try {
          var key = "tempest-theme";
          var def = "system";
          var stored = localStorage.getItem(key);
          var mode = stored || def;
          var resolved =
            mode === "dark" || mode === "light"
              ? mode
              : matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
          document.documentElement.setAttribute("data-tempest-theme", resolved);
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

If you render the HTML via SSR/React (Next, Remix, etc.), inject it with `dangerouslySetInnerHTML` to keep the generated string in sync with the SDK:

```tsx
import { themeInitScript } from "tempest-react-sdk";

export function Head() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />;
}
```

!!! warning "The script must be synchronous and run early"
    Do not use `defer`, `async`, or move the script to the end of `<body>` — it has to run before the first paint, otherwise the flash returns. `getInitialTheme()` exposes the same resolution logic for when you want the computed theme in JS without injecting the script.

## Customizing tokens

The `--tempest-*` tokens are the only theming API. Override them anywhere in the cascade — one for the light theme, another inside the dark-theme selector:

```css
:root {
  --tempest-primary: #ff3366;
  --tempest-radius-md: 6px;
}

[data-tempest-theme="dark"] {
  --tempest-primary: #ff6688;
}
```

!!! note "Tokens are public API"
    Because apps depend on these names, changing/removing a token is a breaking change — that is why they follow the SDK's semantic versioning.

## `createTheme` — a whole brand from one color

Overriding token by token is fine for a one-off tweak. To **change the brand**, it is ~30 values for `primary` alone (ten steps × light/dark, plus the hover/active/soft aliases) — and the dark ramp inversion is easy to get wrong by hand. `createTheme` generates all of it:

```tsx
import { applyTheme, createTheme } from "tempest-react-sdk";

const theme = createTheme({ primary: "#7c3aed" });

applyTheme(theme);
```

That's it: all 104 components pick up the new brand, in light and dark.

### What it generates

```ts
const theme = createTheme({
  primary: "#7c3aed",          // 50→900 scale + hover/active/soft/foreground/focus-ring
  gray: "#6b7280",             // surfaces, borders and text
  success: "#16a34a",          // each status becomes -fg / -bg / -border / -solid
  danger: "#dc2626",
  chart: ["#7c3aed", "#0ea5e9", "#22c55e"],  // --tempest-chart-1..N + -count (see Charts)
  radius: "lg",                // "none" | "sm" | "md" | "lg" | "xl" | "full"
  focusRingAlpha: 0.35,
});

theme.light; // { "--tempest-primary-500": "#7c3aed", … } — your color, exactly
theme.dark;  // same, with the ramp inverted
theme.css;   // ":root { … }\n\n[data-tempest-theme=\"dark\"] { … }"
```

Only the families you pass are generated — everything else still comes from the SDK's `colors.css`. A theme is a **patch**, not a fork of the palette.

!!! check "Step `500` is exactly the color you passed"
    The scale is **anchored** at `500`: your brand's lightness becomes the fixed
    point and both halves of the ramp are rescaled around it. Without that, `500`
    was forced onto the curve's target lightness and `#7c3aed` came back as
    `#9161fe` — same hue, same chroma, **re-lightened**. It looks fine in isolation
    and is wrong anyway: the one color the designer handed over is the one the
    buttons have to be. A very light brand (yellow) or a very dark one (navy)
    simply gets a shorter run on the crowded side, and the ramp stays monotonic.

!!! info "Why OKLCH and not HSL"
    The scale is derived in OKLCH because HSL lightness is **not perceptual**: a yellow and a blue at the same HSL `L` read as visibly different brightness, and that is exactly what makes a generated palette look broken for some colors. In OKLCH, the `500` step of any brand sits in the same visual place.

!!! tip "The text-on-soft step is measured, not conventional"
    `--tempest-primary-on-soft` is not pinned to `600`: the SDK **measures** contrast against the `50` tint and walks down the ramp until it clears 4.5:1 (AA for body text). This is not fussiness — the default blue only reaches 4.37:1 at `500` over its own tint, and a generated emerald stops at 4.41:1 at `600`. Both would miss AA by a hair.

### Bundled presets

```tsx
import { applyTheme, createTheme, themePresets } from "tempest-react-sdk";

applyTheme(createTheme(themePresets.violet));

// or start from one and tweak it
applyTheme(createTheme({ ...themePresets.emerald, radius: "full" }));
```

Available presets: `tempest` (the SDK default), `violet`, `emerald`, `rose`, `slate`, `amber`. Each one is an options object — data, not CSS — so you can persist the chosen name in `localStorage` and resolve it with `getThemePreset(name)`, which returns `undefined` for an unknown name instead of blowing up at boot.

### Switching themes at runtime

```tsx
import { applyTheme, createTheme, getThemePreset } from "tempest-react-sdk";
import { useEffect, useState } from "react";

export function BrandPicker() {
  const [brand, setBrand] = useState(() => localStorage.getItem("brand") ?? "tempest");

  useEffect(() => {
    const preset = getThemePreset(brand);
    if (!preset) return;
    localStorage.setItem("brand", brand);
    return applyTheme(createTheme(preset));
  }, [brand]);

  return (
    <select value={brand} onChange={(event) => setBrand(event.target.value)}>
      {["tempest", "violet", "emerald", "rose", "slate", "amber"].map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
}
```

`applyTheme` is **idempotent**: it owns a single `<style id="tempest-theme">` and rewrites its content, so a brand picker can fire as often as it likes without stacking dead stylesheets in `<head>`. The return value is the disposer (used as the effect cleanup above).

!!! tip "Theming one subtree"
    Pass `selector`/`darkSelector` to `createTheme` and `id`/`target` to `applyTheme` to paint only part of the screen — handy for a brand preview:

    ```tsx
    applyTheme(
      createTheme({ primary: "#e11d48", selector: ".preview", darkSelector: '.preview[data-tempest-theme="dark"]' }),
      { id: "preview-theme" },
    );
    ```

### No JS: paste the generated CSS

`theme.css` is text. If you prefer a static theme (zero JS on the critical path), generate it once and paste it into the app's global CSS:

```bash
node -e "import('tempest-react-sdk').then(({ createTheme }) => console.log(createTheme({ primary: '#7c3aed' }).css))" > src/brand.css
```

### Auditing your brand's contrast

```ts
import { contrastRatio, createColorScale, themeContrast } from "tempest-react-sdk";

themeContrast({ primary: "#fde047" }); // 15.2 — dark text was picked automatically

const scale = createColorScale("#7c3aed");
contrastRatio(scale[500], "#ffffff");  // assert it in your own test if the brand is a requirement
```

`--tempest-primary-foreground` (and `--tempest-text-on-primary`) is picked by measured contrast between white and the dark gray — hardcoding white would produce unreadable buttons for light brands (yellow, lime, cyan).

### The color conversions, on their own

`createTheme` does the whole job, but the conversions it uses internally are
exported for when you need just one — lightening a badge, building an overlay,
comparing two colors in a test of your own:

```ts
import { hexToOklch, hexToRgb, hexToRgbaString, oklchToHex } from "tempest-react-sdk";

const { l, c, h } = hexToOklch("#7c3aed"); // lightness, chroma, hue
oklchToHex({ l: l + 0.1, c, h }); // 10% lighter, same hue and saturation

hexToRgbaString("#7c3aed", 0.12); // "rgb(124 58 237 / 0.12)" — overlay/hover
hexToRgb("#7c3aed"); // { r, g, b } in 0–1, for your own math
rgbToHex({ r: 0.49, g: 0.23, b: 0.93 }); // back to "#7c3aed"
```

Two more come from the contrast side, and they are what `createTheme` uses to
pick a readable foreground instead of hardcoding white:

```ts
import { readableForeground, relativeLuminance } from "tempest-react-sdk";

relativeLuminance("#fde047"); // 0.83 — WCAG relative luminance, the input to contrastRatio
readableForeground("#fde047"); // the dark foreground: white on this yellow is unreadable
```

!!! info "Why OKLCH and not HSL"
    Lightening in HSL changes the perceived color: `hsl(240 100% 50%)` and
    `hsl(60 100% 50%)` declare the same "lightness" and look nothing alike in
    brightness. OKLCH is perceptually uniform, so `l + 0.1` lightens by the same
    amount at any hue — which is why `createTheme`'s scale comes out even
    instead of collapsing in the yellows. `oklchToHex` also walks chroma down
    until the color fits the sRGB gamut, rather than handing back a clipped hex.

## App CSS integration + `theme-color`

SDK components read `data-tempest-theme`. If your **app's own CSS** already keys the theme off a different attribute (e.g. `[data-theme="dark"]`), you don't need a sync effect — pass an array to `attribute` and the provider writes the resolved theme to **all** of them:

```tsx
<ThemeProvider attribute={["data-tempest-theme", "data-theme"]}>
  <App />
</ThemeProvider>
```

To keep the browser chrome / PWA status bar in sync, pass `themeColor` — the provider updates `<meta name="theme-color">` with the resolved theme's color (the meta tag must already exist in `<head>`):

```tsx
<ThemeProvider themeColor={{ light: "#1f7a3f", dark: "#0f1411" }}>
  <App />
</ThemeProvider>
```

!!! tip "Why this exists"
    Apps mixing their own CSS with SDK components used to write a hook just to mirror the theme onto `data-theme` and update the meta tag. `attribute` (array) + `themeColor` cover both cases in the provider itself.

## Partial scope

Pass `target` to apply the theme to a specific subtree instead of `<html>` — useful for a preview or portal that needs an independent theme:

```tsx
<ThemeProvider target={() => document.getElementById("preview")} defaultTheme="dark">
  <Preview />
</ThemeProvider>
```

## Recap

- `ThemeProvider` writes `data-tempest-theme` on `<html>` (or the `target` element); the `--tempest-*` tokens react on their own.
- Modes: `"light"`, `"dark"`, `"system"` — the last follows `prefers-color-scheme` live. The choice persists in `localStorage["tempest-theme"]`.
- `useTheme()` gives `theme` (raw preference), `resolvedTheme` (always `light`/`dark`), `setTheme` and `toggle`.
- Inline the `themeInitScript()` **synchronously in `<head>`, before the CSS**, to kill the wrong-theme flash.
- Customize the look by overriding the `--tempest-*` tokens; use `target` for subtree theming.

## See also

- [Components](./components.md) — they all consume the tokens
- [Styles](./styles.md) — full catalog of the `--tempest-*` tokens
- [App Providers](./app-providers.md) — mounting the theme alongside Query and i18n
