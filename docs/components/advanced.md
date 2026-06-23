# Overlays & avançados

Componentes em paridade com a shadcn/ui: toggles, label, regiões expansíveis, menus contextuais, paleta de comandos, áreas roláveis, painéis redimensionáveis, calendário, menus de navegação e uma tabela de dados stateful. Todos importados de `tempest-react-sdk`.

## Essenciais

### `Toggle`

Botão de dois estados — como um checkbox estilizado de botão. Controlado (`pressed` + `onPressedChange`) ou não-controlado (`defaultPressed`).

```tsx
import { Toggle } from "tempest-react-sdk";

<Toggle
  defaultPressed
  variant="outline"
  size="md"
  onPressedChange={(pressed) => console.log(pressed)}
>
  Negrito
</Toggle>;
```

| Prop              | Tipo                         | Default     | Descrição                                           |
| ----------------- | ---------------------------- | ----------- | --------------------------------------------------- |
| `pressed`         | `boolean`                    | —           | Estado controlado. Quando definido, vira controlado |
| `defaultPressed`  | `boolean`                    | `false`     | Estado inicial no modo não-controlado               |
| `onPressedChange` | `(pressed: boolean) => void` | —           | Disparado com o próximo estado ao ativar            |
| `size`            | `"sm" \| "md" \| "lg"`       | `"md"`      | Tamanho visual                                      |
| `variant`         | `"default" \| "outline"`     | `"default"` | Estilo visual                                       |

Demais props de `<button>` são repassadas.

!!! info "A11y"
Renderiza um `<button type="button">` nativo expondo o estado via `aria-pressed` e `data-state="on"|"off"`.

### `ToggleGroup` (+ `ToggleGroupItem`)

Conjunto de toggles que compartilham estado de seleção via contexto. Modo `single` (valor `string`) ou `multiple` (valor `string[]`).

```tsx
import { ToggleGroup, ToggleGroupItem } from "tempest-react-sdk";

<ToggleGroup type="single" defaultValue="left" onValueChange={(value) => console.log(value)}>
  <ToggleGroupItem value="left">Esquerda</ToggleGroupItem>
  <ToggleGroupItem value="center">Centro</ToggleGroupItem>
  <ToggleGroupItem value="right">Direita</ToggleGroupItem>
</ToggleGroup>;
```

`ToggleGroup`:

| Prop            | Tipo                                  | Default    | Descrição                                                 |
| --------------- | ------------------------------------- | ---------- | --------------------------------------------------------- |
| `type`          | `"single" \| "multiple"`              | `"single"` | `single` mantém um valor; `multiple` mantém um conjunto   |
| `value`         | `string \| string[]`                  | —          | Valor controlado (`string` para single, `string[]` multi) |
| `defaultValue`  | `string \| string[]`                  | —          | Valor inicial não-controlado                              |
| `onValueChange` | `(value: string \| string[]) => void` | —          | Disparado com o próximo valor                             |
| `children`      | `ReactNode`                           | —          | Itens `ToggleGroupItem`                                   |

`ToggleGroupItem`:

| Prop       | Tipo        | Default | Descrição                           |
| ---------- | ----------- | ------- | ----------------------------------- |
| `value`    | `string`    | —       | Valor estável que identifica o item |
| `disabled` | `boolean`   | —       | Desabilita o item                   |
| `children` | `ReactNode` | —       | Conteúdo do item                    |

!!! note "Single mode"
Em `single`, `onValueChange` recebe `""` (string vazia) quando nada está selecionado.

### `Label`

Um `<label>` de formulário. Associe a um controle via `htmlFor`. Com `required`, anexa um asterisco decorativo (`aria-hidden`).

```tsx
import { Label } from "tempest-react-sdk";

<Label htmlFor="email" required>
  E-mail
</Label>;
```

| Prop       | Tipo      | Default | Descrição                                                      |
| ---------- | --------- | ------- | -------------------------------------------------------------- |
| `required` | `boolean` | `false` | Anexa um asterisco em cor de perigo marcando campo obrigatório |

Demais props de `<label>` (incl. `htmlFor`) são repassadas.

### `Collapsible`

Uma única região expandir/recolher — alternativa mais leve ao `Accordion` para um bloco. Controlado (`open` + `onOpenChange`) ou não-controlado (`defaultOpen`).

```tsx
import { Collapsible } from "tempest-react-sdk";

<Collapsible trigger="Ver detalhes" defaultOpen={false}>
  <p>Conteúdo revelado ao expandir.</p>
</Collapsible>;
```

| Prop           | Tipo                      | Default | Descrição                                           |
| -------------- | ------------------------- | ------- | --------------------------------------------------- |
| `open`         | `boolean`                 | —       | Estado controlado. Quando definido, vira controlado |
| `defaultOpen`  | `boolean`                 | `false` | Estado inicial não-controlado                       |
| `onOpenChange` | `(open: boolean) => void` | —       | Disparado com o próximo estado ao ativar o gatilho  |
| `trigger`      | `ReactNode`               | —       | Conteúdo renderizado dentro do botão gatilho        |
| `children`     | `ReactNode`               | —       | Conteúdo recolhível, oculto enquanto fechado        |

!!! info "A11y"
O gatilho é um `<button aria-expanded aria-controls>` ligado a uma `role="region"` de mesmo id; a região fica `hidden` enquanto fechada.

### `ContextMenu`

Menu de clique direito. Abre na posição do cursor via `onContextMenu` (menu nativo suprimido), renderizado por um `Portal`. Fecha no clique fora, Escape ou seleção.

```tsx
import { ContextMenu } from "tempest-react-sdk";

<ContextMenu
  items={[
    { label: "Editar", onSelect: () => edit() },
    { label: "Duplicar", onSelect: () => duplicate() },
    { separator: true },
    { label: "Excluir", danger: true, onSelect: () => remove() },
  ]}
>
  <div>Clique direito aqui</div>
</ContextMenu>;
```

| Prop        | Tipo                | Default | Descrição                                              |
| ----------- | ------------------- | ------- | ------------------------------------------------------ |
| `items`     | `ContextMenuItem[]` | —       | Entradas do menu — itens selecionáveis e separadores   |
| `children`  | `ReactNode`         | —       | Área de gatilho; clique direito em qualquer parte abre |
| `className` | `string`            | —       | Classes extras repassadas ao elemento do menu          |

`ContextMenuItem` = `{ label: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }` ou `{ separator: true }`.

!!! tip "Teclado"
Setas ↑/↓ movem o foco entre itens selecionáveis; Enter ativa o item focado.

### `HoverCard`

Pré-visualização de conteúdo exibida ao passar o mouse ou focar o gatilho. Abre após `openDelay`, fecha após `closeDelay`.

```tsx
import { HoverCard } from "tempest-react-sdk";

<HoverCard trigger={<a href="/u/maria">@maria</a>} placement="bottom">
  <div>
    <strong>Maria Silva</strong>
    <p>Engenheira de software · 2.3k seguidores</p>
  </div>
</HoverCard>;
```

| Prop         | Tipo                                     | Default    | Descrição                                       |
| ------------ | ---------------------------------------- | ---------- | ----------------------------------------------- |
| `trigger`    | `ReactNode`                              | —          | Elemento que o usuário foca/aponta para revelar |
| `children`   | `ReactNode`                              | —          | Conteúdo do card                                |
| `openDelay`  | `number` (ms)                            | `300`      | Atraso antes de abrir em `mouseenter`/`focus`   |
| `closeDelay` | `number` (ms)                            | `150`      | Atraso antes de fechar em `mouseleave`/`blur`   |
| `placement`  | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"` | Ancoragem do card relativa ao gatilho           |

!!! info "A11y"
O card é uma `role="dialog"` rotulada; o gatilho permanece focável por teclado.

### `Command` (paleta ⌘K)

Paleta de comandos estilo ⌘K: diálogo em overlay com input que filtra itens por substring (label + keywords), agrupa resultados e suporta navegação por teclado (↑/↓, Enter, Escape). Prende o foco enquanto aberto.

```tsx
import { Command } from "tempest-react-sdk";
import { useState } from "react";

const [open, setOpen] = useState(false);

<Command
  open={open}
  onOpenChange={setOpen}
  placeholder="Digite um comando…"
  items={[
    { id: "new", label: "Novo documento", group: "Arquivo", onSelect: () => create() },
    {
      id: "open",
      label: "Abrir…",
      group: "Arquivo",
      keywords: ["recente"],
      onSelect: () => openFile(),
    },
    { id: "theme", label: "Alternar tema", group: "Preferências", onSelect: () => toggleTheme() },
  ]}
/>;
```

| Prop           | Tipo                      | Default             | Descrição                                            |
| -------------- | ------------------------- | ------------------- | ---------------------------------------------------- |
| `open`         | `boolean`                 | —                   | Se a paleta está visível                             |
| `onOpenChange` | `(open: boolean) => void` | —                   | Próximo estado (Escape, seleção, clique no backdrop) |
| `items`        | `CommandItem[]`           | —                   | Candidatos a filtrar e exibir                        |
| `placeholder`  | `string`                  | `"Type a command…"` | Placeholder do input de busca                        |
| `emptyMessage` | `ReactNode`               | `"No results"`      | Exibido quando nada combina com a busca              |
| `className`    | `string`                  | —                   | Repassado ao elemento de diálogo                     |

`CommandItem` = `{ id: string; label: string; group?: string; keywords?: string[]; onSelect: () => void; icon?: ReactNode }`.

!!! tip "Gatilho global"
Combine com `useKeyboardShortcut("mod+k", () => setOpen(true))` para abrir via ⌘K / Ctrl+K.

## Layout & UX

### `ScrollArea`

Contêiner de rolagem estilizado que transborda no eixo escolhido e renderiza uma barra de rolagem fina (WebKit). Repassa `className`, `style` e `ref` ao `<div>`.

```tsx
import { ScrollArea } from "tempest-react-sdk";

<ScrollArea maxHeight={240} orientation="vertical">
  <ul>
    {items.map((item) => (
      <li key={item.id}>{item.name}</li>
    ))}
  </ul>
</ScrollArea>;
```

| Prop          | Tipo                                   | Default      | Descrição                             |
| ------------- | -------------------------------------- | ------------ | ------------------------------------- |
| `maxHeight`   | `number \| string`                     | —            | Limita a altura; números viram pixels |
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"` | Qual eixo rola                        |

Demais props de `<div>` são repassadas.

### `Resizable`

Layout de dois painéis com divisor arrastável. O primeiro painel é dimensionado via `flex-basis` em porcentagem; o segundo preenche o resto. Arraste com o ponteiro ou foque o divisor e use as setas (passo de 2%).

```tsx
import { Resizable } from "tempest-react-sdk";

<Resizable direction="horizontal" defaultSize={40} min={20} max={80}>
  <aside>Painel lateral</aside>
  <main>Conteúdo principal</main>
</Resizable>;
```

| Prop          | Tipo                         | Default        | Descrição                                          |
| ------------- | ---------------------------- | -------------- | -------------------------------------------------- |
| `direction`   | `"horizontal" \| "vertical"` | `"horizontal"` | `horizontal` coloca os painéis lado a lado         |
| `defaultSize` | `number` (%)                 | `50`           | Tamanho inicial do primeiro painel, em porcentagem |
| `min`         | `number` (%)                 | `10`           | Clamp inferior do primeiro painel                  |
| `max`         | `number` (%)                 | `90`           | Clamp superior do primeiro painel                  |
| `children`    | `[ReactNode, ReactNode]`     | —              | Exatamente dois painéis — `[paneA, paneB]`         |

!!! warning "Exatamente dois filhos"
`children` é uma tupla `[ReactNode, ReactNode]`. O tamanho é sempre fixado em `[min, max]`.

### `Calendar`

Seletor de data em grade mensal. Cabeçalho com mês/ano + botões prev/next, linha de dias da semana e grade 6×7 de botões de dia. Seleção e mês visível controláveis ou não-controlados. Aritmética com `Date` puro — sem bibliotecas externas.

```tsx
import { Calendar } from "tempest-react-sdk";
import { useState } from "react";

const [date, setDate] = useState<Date>();

<Calendar value={date} onChange={setDate} weekStartsOn={1} minDate={new Date(2026, 0, 1)} />;
```

| Prop            | Tipo                    | Default | Descrição                                         |
| --------------- | ----------------------- | ------- | ------------------------------------------------- |
| `value`         | `Date`                  | —       | Data selecionada controlada                       |
| `defaultValue`  | `Date`                  | —       | Data inicial no caso não-controlado               |
| `onChange`      | `(date: Date) => void`  | —       | Chamado com a nova data selecionada               |
| `month`         | `Date`                  | —       | Mês visível controlado (qualquer dia dentro dele) |
| `onMonthChange` | `(month: Date) => void` | —       | Chamado quando o mês visível muda (prev/next)     |
| `minDate`       | `Date`                  | —       | Data mínima selecionável (inclusiva)              |
| `maxDate`       | `Date`                  | —       | Data máxima selecionável (inclusiva)              |
| `weekStartsOn`  | `0 \| 1`                | `0`     | Primeira coluna — `0` domingo, `1` segunda        |

!!! tip "Teclado"
Setas movem o foco por dia (←/→) ou por semana (↑/↓); Enter/Espaço seleciona o dia focado.

## Navegação & conteúdo

### `NavigationMenu`

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

### `Menubar`

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

### `Carousel`

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

## Dados

### `DataTable<T>`

Tabela de dados stateful construída sobre o `Table` headless. Adiciona busca client-side, ordenação por clique no cabeçalho e paginação, delegando toda a marcação à `Table` subjacente.

```tsx
import { DataTable, type DataTableColumn } from "tempest-react-sdk";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const columns: DataTableColumn<User>[] = [
  { key: "name", header: "Nome", sortable: true },
  { key: "email", header: "E-mail" },
  { key: "role", header: "Papel", sortable: true, align: "right" },
];

<DataTable
  data={users}
  columns={columns}
  searchable
  pageSize={10}
  initialSort={{ key: "name", direction: "asc" }}
  rowKey={(row) => row.id}
  emptyMessage="Nenhum usuário encontrado"
/>;
```

| Prop           | Tipo                                  | Default | Descrição                                               |
| -------------- | ------------------------------------- | ------- | ------------------------------------------------------- |
| `data`         | `T[]`                                 | —       | Dataset completo; sort/filtro/paginação são client-side |
| `columns`      | `DataTableColumn<T>[]`                | —       | Definições de coluna                                    |
| `pageSize`     | `number`                              | `10`    | Linhas por página                                       |
| `searchable`   | `boolean`                             | `false` | Renderiza um input de busca acima da tabela             |
| `searchKeys`   | `(keyof T)[]`                         | —       | Chaves buscadas; default = colunas string/number        |
| `initialSort`  | `DataTableSort<T>`                    | —       | Ordenação inicial antes de interagir com o cabeçalho    |
| `rowKey`       | `(row: T, index) => string \| number` | índice  | Extrator de chave estável por linha                     |
| `emptyMessage` | `ReactNode`                           | —       | Conteúdo exibido quando nenhuma linha combina           |

`DataTableColumn<T>` = `{ key: keyof T; header: ReactNode; render?: (row: T) => ReactNode; sortable?: boolean; align?: TableAlign; priority?: TablePriority; width?: string | number }`. `DataTableSort<T>` = `{ key: keyof T; direction: "asc" | "desc" }`.

!!! info "Comportamento"
Clicar um cabeçalho ordenável cicla asc → desc → sem ordenação. A busca combina substring case-insensitive nas `searchKeys` (ou em toda coluna string/number quando omitidas). A paginação some quando o resultado cabe em uma única página.

## Recap

- **Essenciais**: `Toggle`/`ToggleGroup` para estados pressionáveis, `Label` para formulários, `Collapsible` para um bloco expansível, `ContextMenu`/`HoverCard` para overlays disparados por interação e `Command` para a paleta ⌘K.
- **Layout & UX**: `ScrollArea` para rolagem estilizada, `Resizable` para painéis divididos e `Calendar` para seleção de datas sem dependências externas.
- **Navegação & conteúdo**: `NavigationMenu` e `Menubar` para navegação com dropdowns, `Carousel` para sliders.
- **Dados**: `DataTable<T>` envolve o `Table` headless com busca, ordenação e paginação client-side.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
