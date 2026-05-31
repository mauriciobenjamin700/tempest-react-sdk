# Theme (dark / light)

`ThemeProvider` applies `data-tempest-theme="dark"` on `<html>` (or another
element). `useTheme()` reads and mutates it. CSS tokens (`--tempest-*`) react
automatically — see [`src/styles/colors.css`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/src/styles/colors.css).

## Setup

```tsx
import { ThemeProvider } from "tempest-react-sdk";

<ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
```

Modes: `"light"`, `"dark"`, `"system"`. In `system` mode, it listens to
`prefers-color-scheme` and reacts to OS changes.

## Toggle

```tsx
import { useTheme } from "tempest-react-sdk";

const { theme, resolvedTheme, setTheme, toggle } = useTheme();

<button onClick={toggle}>
  {resolvedTheme === "dark" ? "🌙" : "☀️"} ({theme})
</button>;
```

- `theme`: the raw preference (`light` / `dark` / `system`).
- `resolvedTheme`: what is actually applied (`light` / `dark`).
- `toggle()`: inverts the resolvedTheme.

## No-flash (SSR / hydration)

Inline a script in the `<head>` before any CSS loads:

```tsx
import { themeInitScript } from "tempest-react-sdk";

<head>
  <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
</head>;
```

It reads `localStorage["tempest-theme"]` and sets `data-tempest-theme` before
painting.

## Customizing tokens

Override anywhere in the cascade:

```css
:root {
  --tempest-primary: #ff3366;
  --tempest-radius-md: 6px;
}

[data-tempest-theme="dark"] {
  --tempest-primary: #ff6688;
}
```

## Partial scope

Pass `target` to apply the theme to a subtree (useful in portals or a docs site):

```tsx
<ThemeProvider target={() => document.getElementById("preview")}>
  <Preview />
</ThemeProvider>
```

## See also

- [Components](./components.md) — they all use the tokens
