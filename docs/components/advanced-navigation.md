# Avançados: navegação & conteúdo

Navegação com dropdowns, barra de menus e carrossel. Três formas de levar a pessoa a outro lugar, ou de mostrar mais do que cabe na tela.

## `NavigationMenu`

Menu de navegação horizontal com submenus dropdown via hover/clique/foco. Itens de topo em `<nav><ul>`; itens com `children` abrem um painel `role="menu"`. Apenas um painel aberto por vez.

```tsx
import { NavigationMenu } from "tempest-react-sdk";

<NavigationMenu
  items={[
    { label: "Início", href: "/" },
    {
      label: "Produtos",
      children: [
        { label: "Analytics", href: "/analytics" },
        { label: "Billing", onSelect: () => openBilling() },
      ],
    },
  ]}
/>;
```

| Prop    | Tipo                   | Default | Descrição                     |
| ------- | ---------------------- | ------- | ----------------------------- |
| `items` | `NavigationMenuItem[]` | —       | Entradas de navegação de topo |

`NavigationMenuItem` = `{ label: ReactNode; href?: string; onSelect?: () => void; children?: NavigationMenuItem[] }`.

!!! note "Fechamento"
    Fecha no clique fora, Escape, ou ao selecionar uma entrada-folha.

## `Menubar`

Barra de menus de aplicação (estilo Arquivo / Editar). `role="menubar"`; cada menu é um botão que abre um dropdown. Setas ←/→ navegam entre menus (com wrap).

```tsx
import { Menubar } from "tempest-react-sdk";

<Menubar
  menus={[
    {
      label: "Arquivo",
      items: [
        { label: "Novo", shortcut: "⌘N", onSelect: () => create() },
        { separator: true },
        { label: "Sair", onSelect: () => quit() },
      ],
    },
  ]}
/>;
```

| Prop    | Tipo            | Default | Descrição                                         |
| ------- | --------------- | ------- | ------------------------------------------------- |
| `menus` | `MenubarMenu[]` | —       | Menus de topo, renderizados da esquerda à direita |

`MenubarMenu` = `{ label: ReactNode; items: MenubarItem[] }`. `MenubarItem` = `{ label: ReactNode; onSelect?: () => void; disabled?: boolean; shortcut?: string }` ou `{ separator: true }`.

## `Carousel`

Slider horizontal de conteúdo mostrando um slide por vez. A track translada pelo índice ativo. Setas prev/next (desabilitadas nas pontas, salvo `loop`) e indicadores em dots. Controlado (`index`) ou não-controlado (`defaultIndex`).

```tsx
import { Carousel } from "tempest-react-sdk";

<Carousel loop showArrows showDots>
  <img src="/1.jpg" alt="" />
  <img src="/2.jpg" alt="" />
  <img src="/3.jpg" alt="" />
</Carousel>;
```

| Prop            | Tipo                      | Default | Descrição                             |
| --------------- | ------------------------- | ------- | ------------------------------------- |
| `children`      | `ReactNode[]`             | —       | Slides — um renderizado por vez       |
| `loop`          | `boolean`                 | `false` | Dá a volta nas pontas em vez de parar |
| `showArrows`    | `boolean`                 | `true`  | Exibe botões de seta prev/next        |
| `showDots`      | `boolean`                 | `true`  | Exibe indicadores em dots             |
| `index`         | `number`                  | —       | Índice ativo controlado               |
| `defaultIndex`  | `number`                  | `0`     | Índice inicial não-controlado         |
| `onIndexChange` | `(index: number) => void` | —       | Chamado quando o índice ativo muda    |

!!! tip "Teclado"
    Setas ←/→ sobre a região focada navegam entre slides.

## Recap

- **Navegação & conteúdo**: `NavigationMenu` e `Menubar` para navegação com dropdowns, `Carousel` para sliders.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
