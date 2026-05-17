# Tema (dark / light)

`ThemeProvider` aplica `data-tempest-theme="dark"` em `<html>` (ou em outro elemento). `useTheme()` lê e muta. Tokens CSS (`--tempest-*`) reagem automaticamente — ver [`src/styles/colors.css`](../src/styles/colors.css).

## Setup

```tsx
import { ThemeProvider } from "tempest-react-sdk";

<ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
```

Modos: `"light"`, `"dark"`, `"system"`. Em `system`, escuta `prefers-color-scheme` e reage a mudanças do OS.

## Toggle

```tsx
import { useTheme } from "tempest-react-sdk";

const { theme, resolvedTheme, setTheme, toggle } = useTheme();

<button onClick={toggle}>
  {resolvedTheme === "dark" ? "🌙" : "☀️"} ({theme})
</button>;
```

- `theme`: preferência crua (`light` / `dark` / `system`).
- `resolvedTheme`: o que efetivamente está aplicado (`light` / `dark`).
- `toggle()`: inverte resolvedTheme.

## No-flash (SSR / hydration)

Inline um script no `<head>` antes de qualquer CSS carregar:

```tsx
import { themeInitScript } from "tempest-react-sdk";

<head>
  <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
</head>;
```

Lê `localStorage["tempest-theme"]` e seta `data-tempest-theme` antes de pintar.

## Customizando tokens

Sobrescreva em qualquer ponto da cascata:

```css
:root {
  --tempest-primary: #ff3366;
  --tempest-radius-md: 6px;
}

[data-tempest-theme="dark"] {
  --tempest-primary: #ff6688;
}
```

## Escopo parcial

Passe `target` pra aplicar o tema numa subárvore (útil em portais ou docs site):

```tsx
<ThemeProvider target={() => document.getElementById("preview")}>
  <Preview />
</ThemeProvider>
```

## Veja também

- [Componentes](./components.md) — todos usam os tokens
