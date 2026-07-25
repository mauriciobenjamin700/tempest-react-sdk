# Estilos & Design Tokens

O SDK expõe um conjunto de CSS Custom Properties (`--tempest-*`) que controlam toda a aparência dos componentes. Apps consumidores customizam o tema sobrescrevendo esses tokens — **não é necessário tocar em CSS Modules**.

```tsx
import "tempest-react-sdk/styles.css";
```

Pronto. Tudo o que está abaixo já está disponível na sua aplicação.

!!! tip "Sobrescreva tokens no `:root`"
    A única forma de tematizar é redefinir os tokens `--tempest-*` no seu próprio
    CSS. Coloque os overrides num `:root` (ou numa subárvore para escopo parcial)
    **depois** do import — nunca edite os CSS Modules do SDK.

!!! warning "Tokens são API pública"
    Os nomes `--tempest-*` fazem parte do contrato semver do SDK. Veja a
    [política de versionamento](#politica-de-versionamento-de-tokens) no fim da
    página antes de depender de um token específico.

## Sumário

- [Cor](#cor)
  - [Brand — primary tints](#brand-primary-tints)
  - [Neutros — gray scale](#neutros-gray-scale)
  - [Status — triplets (fg/bg/border/solid)](#status-triplets-fgbgbordersolid)
  - [Data viz — cores de série](#data-viz-cores-de-serie)
  - [Gerando a paleta com `createTheme`](#gerando-a-paleta-com-createtheme)
- [Tipografia](#tipografia)
- [Espaçamento](#espacamento)
- [Radius](#radius)
- [Elevação (shadow)](#elevacao-shadow)
- [Motion](#motion)
- [Focus ring](#focus-ring)
- [Z-index](#z-index)
- [Densidade — `data-tempest-density`](#densidade-data-tempest-density)
- [Tema dark — `data-tempest-theme`](#tema-dark-data-tempest-theme)
- [Componentes — variants disponíveis](#componentes-variants-disponiveis)
- [Camada utilitária opt-in — `utilities.css`](#camada-utilitaria-opt-in-utilitiescss)

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
- `--tempest-primary-on-soft` = primary-600 no claro, primary-700 no escuro (cor do texto/ícone **sobre** `--tempest-primary-soft`)

!!! warning "Texto sobre `primary-soft` usa `primary-on-soft`, não `primary`"
    `--tempest-primary` sobre `--tempest-primary-soft` dá 4.37:1 de contraste — o
    WCAG AA pede 4.5:1 pra texto. Por isso existe o `--tempest-primary-on-soft`
    (~6:1). Se você redefinir a paleta, redefina os dois: trocar só o
    `--tempest-primary` deixa os estados selecionados (Toggle, ToggleGroup,
    ListTile, Stepper, NavigationRail, FileUpload) fora de conformidade.

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

### Data viz — cores de série

Oito cores categóricas em ordem cíclica, mais o cromado do gráfico:

| Token                        | Uso                                                   |
| ---------------------------- | ----------------------------------------------------- |
| `--tempest-chart-1` … `-8`   | Cores de série, aplicadas por índice (ciclam)          |
| `--tempest-chart-grid`       | Linhas de grid                                         |
| `--tempest-chart-axis`       | Linhas e rótulos de eixo                               |

As oito são espaçadas por **matiz** — são categóricas, não um ramp. Para escala sequencial ou divergente, use `--tempest-primary-*`.

O módulo `tempest-react-sdk/charts` lê esses tokens em runtime e re-resolve quando o tema vira, então sobrescrevê-los muda os gráficos sem tocar em prop nenhuma:

```css
:root {
  --tempest-chart-1: #0f766e;
  --tempest-chart-2: #f97316;
}
```

!!! warning "Não passe `var()` como cor de série"
    O recharts aplica cor como atributo de apresentação do SVG, e `var()` não é resolvido ali. É por isso que o SDK lê o token via `getComputedStyle` e entrega cor literal. Detalhes em [Charts › Cores e tema](charts.md#cores-e-tema).

### Gerando a paleta com `createTheme`

Escrever os ~30 valores de uma marca na mão (dez degraus × claro/escuro + aliases) é trabalhoso e fácil de errar no dark, onde o ramp **inverte**. `createTheme` deriva tudo de uma cor, em OKLCH:

```tsx
import { applyTheme, createTheme } from "tempest-react-sdk";

applyTheme(createTheme({ primary: "#7c3aed", radius: "lg" }));
```

Isso emite os mesmos tokens desta página — é açúcar sobre a API de token, não um segundo sistema de tema. Guia completo em [Tema › `createTheme`](theme.md#createtheme-a-marca-inteira-a-partir-de-uma-cor).

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

!!! warning "Use `data-tempest-theme=\"dark\"`, não `class=\"dark\"`"
    O dark mode do SDK liga pelo atributo `data-tempest-theme`, nunca por uma
    classe `dark`. Isso permite escopar o tema escuro a uma subárvore específica
    em vez do documento inteiro — algo que a convenção de classe não faz.

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

!!! note "O prefixo `tempest_` evita colisão"
    As classes geradas pelos CSS Modules saem prefixadas com `tempest_`, então
    nunca colidem com o CSS do seu app nem com Tailwind/Stitches/Linaria rodando
    lado a lado. Você só interage com os tokens `--tempest-*` — não precisa
    conhecer os nomes de classe.

!!! warning "CSS Modules é a única estratégia de estilo do SDK"
    Os componentes são estilizados por CSS Modules + tokens `--tempest-*`, e ponto.
    Não existe modo "headless" nem hook de classe (`data-tempest-classname`) para
    Tailwind/Stitches/Linaria assumirem a estilização — e isso não está no
    backlog. Manter dois caminhos de estilo dobraria a superfície de cada
    componente e diluiria os tokens.

    O que você **pode** fazer: rodar seu utilitário favorito lado a lado no resto
    do app, ler os tokens do SDK com `var(--tempest-*)` e customizar o SDK
    sobrescrevendo os tokens no `:root`.

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

## Camada utilitária opt-in — `utilities.css`

Os componentes são estilizados por CSS Modules, o que resolve o **dentro** deles. O que sobrava pro app era o **em volta**: casca de página, form de duas colunas, linha de ações, card, região que rola na horizontal. Todo app reescrevia esse CSS.

`utilities.css` é essa camada, escrita só com tokens `--tempest-*` — então ela acompanha o tema, incluindo o que sai do `createTheme` e o modo escuro.

```ts
// src/main.tsx
import "tempest-react-sdk/styles.css";
import "tempest-react-sdk/utilities.css"; // opt-in
```

!!! info "Por que opt-in e não dentro do `styles.css`"
    São ~50 nomes de classe **globais**. Um app que já tem o próprio sistema de layout não deve pagar por eles, e injetar classe global em página alheia sem pedir é falta de educação. Custo se você optar: **1.13 KB brotli**.

!!! warning "Isto não é um Tailwind, e não vira"
    A camada tem um punhado de primitivas de layout — não existe (nem entra no backlog) `p-4 mt-2 text-sm bg-blue-500` para cada valor possível. A [decisão consolidada](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CLAUDE.md) segue valendo: **CSS Modules + tokens é a estratégia de estilo dos componentes**. Isso aqui é ferramenta pro código do *app*, não um segundo caminho de estilizar o SDK.

### Layout

| Classe                    | O que faz                                                                | Ajuste                                             |
| ------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `.tempest-container`      | Centraliza, limita a largura, aplica gutter respeitando a safe area       | `--tempest-container-width`, `--tempest-container-gutter` |
| `.tempest-stack`          | Fluxo vertical com um gap só                                             | `--tempest-stack-gap`                              |
| `.tempest-cluster`        | Grupo horizontal que **quebra linha** em vez de estourar                  | `--tempest-cluster-gap`                            |
| `.tempest-row`            | Grupo horizontal que não quebra (toolbar, campos inline)                  | `--tempest-row-gap`                                |
| `.tempest-center`         | Centraliza o filho nos dois eixos                                        | —                                                  |
| `.tempest-spread`         | Empurra primeiro e último filho pras pontas (título ↔ ações)              | `--tempest-row-gap`                                |
| `.tempest-grid-auto`      | Grid de cards responsivo **sem media query** (`auto-fill` + `minmax`)     | `--tempest-grid-min`, `--tempest-grid-gap`         |
| `.tempest-sidebar-layout` | Sidebar + conteúdo; vira uma coluna abaixo de 768px                      | `--tempest-sidebar-width`, `--tempest-sidebar-gap` |
| `.tempest-form-grid`      | Form de 2 colunas que colapsa abaixo de 640px                            | `--tempest-form-columns`, `--tempest-form-gap`     |
| `.tempest-form-span`      | Campo que ocupa a linha inteira do grid de form                          | —                                                  |
| `.tempest-fill`           | Ocupa o espaço restante do flex (com `min-width: 0`, então truncar funciona) | —                                               |
| `.tempest-fixed`          | Nunca encolhe abaixo do conteúdo (botão de ícone ao lado de campo)        | —                                                  |

### Espaçamento, texto, superfície, scroll

| Grupo         | Classes                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------- |
| Gap           | `.tempest-gap-{0,1,2,3,4,5,6,8,10,12}`                                                       |
| Padding       | `.tempest-pad-{0,2,3,4,6,8}`, `.tempest-pad-block`, `.tempest-pad-inline`                     |
| Texto         | `.tempest-truncate`, `.tempest-clamp-{2,3,4}`, `.tempest-text-{muted,subtle}`, `.tempest-text-{xs,sm,base,lg,xl,2xl}`, `.tempest-weight-{medium,semibold,bold}`, `.tempest-numeric` |
| Superfície    | `.tempest-card`, `.tempest-panel`, `.tempest-inset`, `.tempest-divider`                       |
| Scroll        | `.tempest-scroll-x`, `.tempest-scroll-y`                                                      |
| Mídia         | `.tempest-aspect-video`, `.tempest-aspect-square`                                             |
| Diversos      | `.tempest-visually-hidden`, `.tempest-no-select`, `.tempest-busy`                             |

!!! tip "`.tempest-numeric` existe por um motivo específico"
    `font-variant-numeric: tabular-nums` impede que uma coluna de números **dance** quando o valor muda (dígitos proporcionais têm larguras diferentes). Use em tabela de valores, contador ao vivo e `Stat`.

!!! tip "`.tempest-scroll-x` em volta de tabela larga"
    Sem ele, uma tabela larga faz a **página** rolar na horizontal — que é o defeito de layout mais comum em mobile. Com ele, a rolagem fica contida na região.

### Página inteira, montada

```tsx
export function UsersPage() {
  return (
    <div className="tempest-container tempest-page">
      <header className="tempest-page-header">
        <div>
          <h1 className="tempest-page-title">Usuários</h1>
          <p className="tempest-page-subtitle">142 ativos · 8 convites pendentes</p>
        </div>
        <div className="tempest-cluster">
          <Button variant="secondary">Exportar</Button>
          <Button>Convidar</Button>
        </div>
      </header>

      <div className="tempest-toolbar tempest-toolbar-sticky">
        <SearchBar className="tempest-fill" placeholder="Buscar por nome ou e-mail" />
        <Select className="tempest-fixed" options={papeis} />
      </div>

      <div className="tempest-card tempest-scroll-x">
        <DataTable data={usuarios} columns={colunas} />
      </div>

      <div className="tempest-grid-auto" style={{ "--tempest-grid-min": "220px" } as React.CSSProperties}>
        <Stat label="Ativos" value={142} />
        <Stat label="Convidados" value={8} />
        <Stat label="Bloqueados" value={3} />
      </div>
    </div>
  );
}
```

Note o `style={{ "--tempest-grid-min": "220px" }}`: os hooks locais são custom properties, então dá pra ajustar **por instância** sem escrever CSS nem criar variante de classe.

### Form de duas colunas

```tsx
<Form className="tempest-form-grid" onSubmit={form.handleSubmit(onSubmit)}>
  <FormField name="nome" label="Nome" required><Input /></FormField>
  <FormField name="email" label="E-mail" required><Input type="email" /></FormField>
  <FormField name="cpf" label="CPF"><CPFInput /></FormField>
  <FormField name="telefone" label="Telefone"><PhoneInput /></FormField>

  <FormField name="observacoes" label="Observações" className="tempest-form-span">
    <Textarea rows={4} />
  </FormField>

  <FormActions align="end" className="tempest-form-span">
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>
```

Uma coluna no celular, duas a partir de 640px, e `.tempest-form-span` para o que ocupa a linha inteira.

---

## Responsive — mobile / tablet / desktop

### Breakpoints

| Token              | Pixels | Device esperado |
| ------------------ | ------ | --------------- |
| `--tempest-bp-xs`  | 480px  | Phones pequenos |
| `--tempest-bp-sm`  | 640px  | Phones large    |
| `--tempest-bp-md`  | 768px  | Tablets         |
| `--tempest-bp-lg`  | 1024px | Laptops         |
| `--tempest-bp-xl`  | 1280px | Desktop padrão  |
| `--tempest-bp-2xl` | 1536px | Ultrawide       |

Convenção `useBreakpoint()` / `<Show>` / `<Hide>`:

- **mobile** = `< md` (`< 768px`)
- **tablet** = `md..lg-1` (`768..1023px`)
- **desktop** = `>= lg` (`>= 1024px`)

### `useBreakpoint()` hook

```tsx
import { useBreakpoint } from "tempest-react-sdk";

const bp = useBreakpoint();
bp.current; // "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
bp.width; // pixels (0 no SSR)
bp.above("md"); // boolean
bp.below("lg"); // boolean
bp.isMobile; // < md
bp.isTablet; // md..lg-1
bp.isDesktop; // >= lg
```

SSR-safe — no servidor retorna `xs` / `width: 0`, atualiza no mount.

### `<Show>` / `<Hide>` components

```tsx
<Show above="md">Desktop nav</Show>
<Show below="md">Mobile menu</Show>
<Show only="xl">Wide-only banner</Show>
<Show only={["md", "lg"]}>Tablet + laptop</Show>

<Hide above="lg">Hide on desktop</Hide>
```

### Utility classes (CSS-only, sem JS)

```html
<div class="tempest-hide-mobile">desktop apenas</div>
<div class="tempest-show-only-mobile">mobile apenas</div>
<div class="tempest-hide-tablet">esconde em tablets</div>
<div class="tempest-show-only-touch">touch devices apenas</div>
<div class="tempest-hide-print">não imprimir</div>
```

### Componentes responsive — props

#### `<Container>` — padding responsivo automático

`space-4` mobile / `space-6` tablet / `space-8` desktop.

#### `<Stack>` / `<Grid>` — props aceitam objeto

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

Padding interno e radius já reduzem abaixo de 640px.

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
    { key: "name", header: "Nome" }, // sempre visível
    { key: "email", header: "E-mail", priority: "tablet" }, // some < 768px
    { key: "role", header: "Cargo", priority: "desktop" }, // some < 1024px
  ]}
  data={users}
/>
```

#### `<ToastProvider>` — position

```tsx
<ToastProvider position="top-right" />        // padrão
<ToastProvider position="bottom-center" />    // mobile-friendly default
```

Em telas `< 480px`, container estica `left: 0; right: 0` automaticamente.

### Touch targets

- `data-tempest-density="touch"` — força altura mínima 44px em todos os controles.
- `@media (pointer: coarse)` aplica auto-bump no `xs`/`sm`/`md` quando o usuário está em dispositivo touch (a menos que `density="compact"` explícito).
- `Button iconOnly` size `xs`/`sm` ganha hit-slop invisível de 8px em todos os lados em pointer coarse.

### Safe-area (iOS notch / Android gestures)

Tokens disponíveis:

```css
--tempest-safe-area-top
--tempest-safe-area-right
--tempest-safe-area-bottom
--tempest-safe-area-left
```

Toast, Modal overlay padding e Drawer já consomem automaticamente. Lembre-se de incluir no HTML:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### Dynamic viewport (iOS Safari address bar bug)

Modal e Drawer usam `dvh` com fallback `vh`. Apps que precisam de altura cheia podem fazer o mesmo:

```css
.app {
  min-height: 100vh;
  min-height: 100dvh;
}
```

### Fluid type

Para headings que escalam com viewport:

```css
.hero-title {
  font-size: var(--tempest-text-fluid-5xl); /* clamp(32px, 24px + 4vw, 72px) */
}
```

Tokens: `--tempest-text-fluid-sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl`.

### Hover-only effects

Efeitos `transform` / `box-shadow` em hover (Card interactive lift, Button elevation) ficam atrás de `@media (hover: hover) and (pointer: fine)` — não disparam em tap mobile.

### Print

Tudo embutido em `print.css`:

- Modal, Drawer, Toast, Tooltip ocultos.
- Background grayscale, cards `page-break-inside: avoid`.
- Links recebem `(href)` ao lado.

Classe `tempest-hide-print` para esconder elementos próprios.

---

## Política de versionamento de tokens

Tokens são **API pública**. Mudanças quebram apps consumidores. Política:

- **Adições** (novos tokens) — bump minor.
- **Renames / removals** — bump major. Tokens antigos ficam como alias deprecated por pelo menos 1 minor antes de remoção.
- **Mudanças de valor** que afetam aparência visivelmente (cor primária, radius padrão, font stack) — bump minor + nota no changelog.

---

## Resumo

- Importe `tempest-react-sdk/styles.css` uma vez; tematize sobrescrevendo tokens
  `--tempest-*` no `:root` (ou numa subárvore).
- Dark mode liga por `data-tempest-theme="dark"`; densidade por
  `data-tempest-density` — ambos escopáveis a qualquer subárvore.
- As classes de CSS Module saem prefixadas com `tempest_`, sem colisão com o CSS
  do app nem com Tailwind/Stitches/Linaria.
- Tokens são **API pública** sob semver — adições bumpam minor, renames/removals
  bumpam major.
