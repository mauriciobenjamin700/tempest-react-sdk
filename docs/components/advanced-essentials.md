# Avançados: essenciais

Toggles, label, regiões expansíveis, menus disparados por interação e a paleta de comandos. A fatia que quase toda tela usa em algum momento.

## `Toggle`

<!-- gallery:form-primitives -->
[![Checkbox · Radio · Switch na gallery](../assets/gallery/form-primitives.webp)](../gallery.md)

*Seção `form-primitives` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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

## `ToggleGroup` (+ `ToggleGroupItem`)

<!-- gallery:feedback-extra -->
[![Alert · Timeline · BottomSheet na gallery](../assets/gallery/feedback-extra.webp)](../gallery.md)

*Seção `feedback-extra` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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

## `Label`

<!-- gallery:inputs-extra -->
[![Inputs avançados (Date · Pin · Slider) na gallery](../assets/gallery/inputs-extra.webp)](../gallery.md)

*Seção `inputs-extra` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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

## `Collapsible`

<!-- gallery:disclosure -->
[![Accordion · Collapsible · Scroll na gallery](../assets/gallery/disclosure.webp)](../gallery.md)

*Seção `disclosure` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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

## `ContextMenu`

<!-- gallery:overlays -->
[![Popover · Dropdown · HoverCard na gallery](../assets/gallery/overlays.webp)](../gallery.md)

*Seção `overlays` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

Menu de ações. Abre na posição do ponteiro por clique direito, por **toque longo** e — quando você pede — por clique esquerdo; renderizado por um `Portal`, preso dentro da viewport. Fecha no clique fora, Escape, rolagem, resize ou seleção.

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

| Prop              | Tipo                                     | Default          | Descrição                                                    |
| ----------------- | ---------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `items`           | `ContextMenuItem[]`                      | —                | Entradas do menu — itens selecionáveis e separadores         |
| `children`        | `ReactNode`                              | —                | Área de gatilho; o gesto em qualquer parte dela abre          |
| `className`       | `string`                                 | —                | Classes extras repassadas ao elemento do menu                 |
| `trigger`         | `"contextmenu" \| "click" \| "both"`      | `"contextmenu"`  | Qual gesto de **mouse** abre o menu                           |
| `longPressDelay`  | `number` (ms)                            | `500`            | Duração do toque longo; `0` desliga                           |
| `viewportMargin`  | `number` (px)                            | `8`              | Folga mantida entre o menu e a borda da tela                  |

`ContextMenuItem` = `{ label: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }` ou `{ separator: true }`.

!!! danger "Toque não tem clique direito — e o browser não te dá um substituto"
    Medido no Chrome com emulação de toque (perfis Pixel 7 e iPhone 13), um toque
    segurado por 900 ms num elemento comum produz `pointerdown`, `touchstart`,
    `pointerup`, `touchend` e `click` — e **nenhum** `contextmenu`. Um menu que só
    escutasse `contextmenu` deixaria toda ação atrás dele inalcançável no celular,
    sem erro nenhum: ele simplesmente nunca abre.

    Por isso o toque longo é **default**, e independe de `trigger` (que só decide o
    gesto de mouse). O timer é cancelado quando o dedo anda mais de 10 px — senão
    toda rolagem que começa sobre o gatilho abriria um menu — e o `click` que o dedo
    deixa para trás é engolido, para abrir o menu sobre um balão de conversa não
    abrir também o balão.

!!! tip "O padrão `⋮`"
    Um botão de três pontinhos deve responder ao clique **esquerdo**. Envolva-o com
    `trigger="click"`:

    ```tsx
    <ContextMenu trigger="click" items={items}>
      <Button variant="ghost" aria-label="Mais ações">⋮</Button>
    </ContextMenu>
    ```

    `"both"` mantém os dois botões, para um alvo que aceita as duas formas.

!!! check "Preso dentro da viewport"
    O menu é medido depois de montar e puxado para dentro da tela. Antes disso,
    medido em 320 px de largura: um menu de 180 px aberto em `x=235` ia até 415 —
    **95 px fora da tela**, cortando a borda direita de todo rótulo.

!!! tip "Teclado"
    O menu recebe o foco ao abrir, então o leitor de tela anuncia o menu em vez de
    ficar no gatilho. Setas ↑/↓ percorrem os itens selecionáveis e dão a volta,
    `Home`/`End` vão para as pontas, `Enter` ativa e `Escape` fecha.

## `HoverCard`

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

## `Command` (paleta ⌘K)

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

## Recap

- **Essenciais**: `Toggle`/`ToggleGroup` para estados pressionáveis, `Label` para formulários, `Collapsible` para um bloco expansível, `ContextMenu`/`HoverCard` para overlays disparados por interação e `Command` para a paleta ⌘K.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
