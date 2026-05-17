# Estilos & Design Tokens

O SDK expõe um conjunto de CSS Custom Properties (`--tempest-*`) que controlam toda a aparência dos componentes. Apps consumidores customizam o tema sobrescrevendo esses tokens — **não é necessário tocar em CSS Modules**.

```tsx
import "tempest-react-sdk/dist/styles.css";
```

Pronto. Tudo o que está abaixo já está disponível na sua aplicação.

## Sumário

- [Cor](#cor)
  - [Brand — primary tints](#brand--primary-tints)
  - [Neutros — gray scale](#neutros--gray-scale)
  - [Status — triplets (fg/bg/border/solid)](#status--triplets-fgbgbordersolid)
- [Tipografia](#tipografia)
- [Espaçamento](#espaçamento)
- [Radius](#radius)
- [Elevação (shadow)](#elevação-shadow)
- [Motion](#motion)
- [Focus ring](#focus-ring)
- [Z-index](#z-index)
- [Densidade — `data-tempest-density`](#densidade--data-tempest-density)
- [Tema dark — `data-tempest-theme`](#tema-dark--data-tempest-theme)
- [Componentes — variants disponíveis](#componentes--variants-disponíveis)

---

## Cor

### Brand — primary tints

Scale `50` (mais claro) → `900` (mais escuro). Use `--tempest-primary` como cor canônica de ação.

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
- `--tempest-primary-soft` = primary-50 (fundo tinted para soft buttons/badges)
- `--tempest-primary-foreground` = `#ffffff` (cor do texto sobre a primary)

Para trocar a brand inteira:

```css
:root {
  --tempest-primary-500: #7c3aed; /* roxo */
  --tempest-primary-600: #6d28d9;
  --tempest-primary-700: #5b21b6;
  --tempest-primary-soft: #ede9fe;
}
```

### Neutros — gray scale

```css
--tempest-gray-50: #f8f9fb;
--tempest-gray-500: #667085;
--tempest-gray-900: #101828;
```

Aliases semânticos:

| Token                     | Uso                                  |
| ------------------------- | ------------------------------------ |
| `--tempest-bg`            | Background canvas                    |
| `--tempest-surface`       | Cards, headers, footers              |
| `--tempest-surface-2`     | Surface elevada (chip, button hover) |
| `--tempest-surface-3`     | Surface mais elevada                 |
| `--tempest-border`        | Borda padrão                         |
| `--tempest-border-strong` | Borda com mais contraste             |
| `--tempest-text`          | Texto principal                      |
| `--tempest-text-muted`    | Texto secundário                     |
| `--tempest-text-subtle`   | Texto terciário (placeholders)       |

### Status — triplets (fg/bg/border/solid)

Cada status (`success`, `warning`, `danger`, `info`) expõe 4 cores:

```css
--tempest-success-fg:     /* texto sobre bg soft */ --tempest-success-bg: /* fundo soft tinted */
  --tempest-success-border: /* borda outline */ --tempest-success-solid: /* fill solid */;
```

Atalhos:

- `--tempest-success` — cor principal (igual a `success` solid escuro no light, mais clara no dark).
- `--tempest-danger-hover` — variação para hover em danger solid.

Componentes que aceitam `appearance="soft|solid|outline"` (Badge, Alert, etc.) escolhem automaticamente a combinação certa.

---

## Tipografia

### Famílias

```css
--tempest-font-sans:    /* system stack */ --tempest-font-mono: /* monospace stack */
  --tempest-font-display: /* === sans, override pra heading */;
```

### Tamanhos

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

### Pesos

`--tempest-weight-regular|medium|semibold|bold|extrabold` (400 → 800).

### Letter spacing

`--tempest-tracking-tight|normal|wide|wider|widest`.

---

## Espaçamento

Base 4px. Vai de 0 até 24 (96px).

```css
--tempest-space-0: 0 --tempest-space-1: 4px --tempest-space-2: 8px --tempest-space-3: 12px
  --tempest-space-4: 16px --tempest-space-5: 20px --tempest-space-6: 24px --tempest-space-7: 28px
  --tempest-space-8: 32px --tempest-space-10: 40px --tempest-space-12: 48px --tempest-space-16: 64px
  --tempest-space-20: 80px --tempest-space-24: 96px;
```

---

## Radius

```css
--tempest-radius-xs: 2px --tempest-radius-sm: 4px --tempest-radius-md: 8px /* controls padrão */
  --tempest-radius-lg: 12px /* cards padrão */ --tempest-radius-xl: 16px /* modais */
  --tempest-radius-2xl: 24px --tempest-radius-full: 9999px;
```

---

## Elevação (shadow)

```css
--tempest-shadow-xs:    /* hairline, controls em rest */ --tempest-shadow-sm: /* card padrão */
  --tempest-shadow-md: /* hover card, dropdown */ --tempest-shadow-lg: /* drawer, popover */
  --tempest-shadow-xl: /* modal */ --tempest-shadow-inner: /* tracks, inputs sunken */;
```

Shadows são automaticamente mais escuros no tema dark.

---

## Motion

### Duração

```css
--tempest-duration-instant: 0ms --tempest-duration-fast: 120ms /* hover, focus */
  --tempest-duration-base: 180ms /* enter/leave padrão */ --tempest-duration-slow: 280ms
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
  --tempest-transition-base: /* tudo acima + opacity */;
```

### Reduced motion

`@media (prefers-reduced-motion: reduce)` zera todas as durações de tokens automaticamente. Componentes que usam keyframes pesados (modal, drawer, toast, tooltip, skeleton) também detectam e desabilitam animações específicas.

---

## Focus ring

```css
--tempest-focus-ring-color: rgba(0, 102, 255, 0.35) --tempest-focus-ring-width: 3px
  --tempest-focus-ring-offset: 2px;
```

`:focus-visible` global aplicado em `reset.css`. Componentes interactive (Button, Card interactive, Tabs, Pagination, etc.) reaplicam o ring com tokens.

Para customizar o ring por subárvore (ex: tema marca branca):

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

## Densidade — `data-tempest-density`

Atributo aplicado em qualquer elemento (geralmente `<html>` ou `<body>`) ajusta altura, padding, font-size e radius de todos os controles na subárvore.

```html
<html data-tempest-density="compact"></html>
```

Valores: `compact` | `comfortable` (padrão) | `spacious`.

Tokens controlados:

```css
--tempest-control-height-xs..xl
--tempest-control-padding-xs..xl
--tempest-control-font-xs..xl
--tempest-control-radius
--tempest-control-gap
```

Button, Input, Select, Textarea já lêem desses tokens — basta trocar o atributo no root e tudo redimensiona junto.

---

## Tema dark — `data-tempest-theme`

```html
<html data-tempest-theme="dark"></html>
```

Atributo aplicado em qualquer elemento ativa o tema escuro só naquela subárvore. Tokens de cor (primary scale, neutrals, status, focus ring, shadow) são todos sobrescritos.

Use junto com `<ThemeProvider>` (`tempest-react-sdk/theme`) para persistência + flash prevention.

---

## Componentes — variants disponíveis

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

## Importando tokens em CSS-in-JS

Como os tokens são CSS Custom Properties, qualquer solução (`styled-components`, `emotion`, `vanilla-extract`, Tailwind arbitrary values) lê com `var(--tempest-*)`:

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

## Política de versionamento de tokens

Tokens são **API pública**. Mudanças quebram apps consumidores. Política:

- **Adições** (novos tokens) — bump minor.
- **Renames / removals** — bump major. Tokens antigos ficam como alias deprecated por pelo menos 1 minor antes de remoção.
- **Mudanças de valor** que afetam aparência visivelmente (cor primária, radius padrão, font stack) — bump minor + nota no changelog.
