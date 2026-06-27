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
