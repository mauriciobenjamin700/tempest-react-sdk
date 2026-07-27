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
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"`   | Qual eixo rola                        |
| `scrollLabel` | `string`                               | `"Área rolável"` | Nome acessível da região rolável    |

Demais props de `<div>` são repassadas.

!!! info "Enquanto transborda, vira um grupo focável"
    Uma área cujo conteúdo é texto puro não tem nada focável dentro. Sem um ponto de tabulação próprio, quem navega por teclado vê a barra de rolagem e não tem como movê-la — o foco nunca pousa onde as setas rolariam. Por isso a área recebe `tabIndex={0}` + `role="group"` + `aria-label` **só enquanto o conteúdo de fato transborda**, e o perde de volta quando cabe. Uma área que não rola nunca adiciona parada de tab. `role` e `tabIndex` passados pelo chamador continuam vencendo.

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

### `Scheduler`

Agenda: eventos posicionados numa grade de tempo ao longo de dias consecutivos. O `Calendar` acima é um **seletor de data** — responde "qual dia?". Este responde "o que tem nesses dias, e quando", o que exige estrutura diferente: eixo vertical de tempo, evento dimensionado pela duração e eventos sobrepostos lado a lado.

```tsx
import { Scheduler, type SchedulerEvent } from "tempest-react-sdk";

const events: SchedulerEvent[] = [
  { id: "1", title: "Daily", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 9, 15) },
  { id: "2", title: "Cliente", start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 10, 30) },
  { id: "3", title: "Feriado", start: new Date(2026, 6, 29), end: new Date(2026, 6, 30), allDay: true },
];

<Scheduler
  events={events}
  days={7}
  startHour={7}
  endHour={21}
  onEventClick={(event) => abrir(event.id)}
  onSlotClick={(start) => criarEm(start)}
/>;
```

| Prop              | Tipo                                    | Default   | Descrição                                              |
| ----------------- | --------------------------------------- | --------- | ------------------------------------------------------ |
| `events`          | `SchedulerEvent[]`                      | —         | Eventos; instantes lidos no fuso local                 |
| `anchor`          | `Date`                                  | hoje      | Qualquer dia dentro do intervalo a mostrar             |
| `days`            | `number`                                | `7`       | Dias consecutivos — `1` é visão de dia                 |
| `startHour`       | `number`                                | `8`       | Primeira hora visível                                  |
| `endHour`         | `number`                                | `20`      | Última hora visível                                    |
| `snapMinutes`     | `number`                                | `30`      | Granularidade do clique em espaço vazio                |
| `onEventClick`    | `(event: SchedulerEvent) => void`       | —         | Evento ativado                                         |
| `onSlotClick`     | `(start: Date) => void`                 | —         | Clique em espaço vazio, já snapado                     |
| `renderEvent`     | `(event: SchedulerEvent) => ReactNode`  | —         | Conteúdo do evento                                     |
| `locale`          | `string`                                | `"pt-BR"` | Rótulos de dia e hora                                  |
| `showCurrentTime` | `boolean`                               | `true`    | Linha de agora                                         |
| `now`             | `Date`                                  | relógio   | "Agora" fixo — use em teste e demo pra determinismo     |

Evento: `{ id, title, start, end, allDay?, data? }`.

!!! info "Sobreposição é o que quase toda implementação erra"
    Eventos sobrepostos são agrupados em **clusters de sobreposição mútua** — uma
    cadeia onde cada evento sobrepõe ao menos um outro — e **todos no cluster
    compartilham a mesma contagem de colunas**. É isso que faz as larguras baterem;
    atribuir coluna par a par produz o layout esfarrapado onde dois eventos ocupam
    metade cada e um terceiro cobre um deles silenciosamente.

    A coluna é **reaproveitada assim que libera**: `9–10`, `9–10`, `10–11` usa duas
    colunas, não três. E encostar não é sobrepor — `9–10` seguido de `10–11` ficam os
    dois com largura cheia.

    O layout é puro e mora em `scheduler-layout.ts`, com teste próprio.

!!! warning "Horário local, e DST não duplica dia"
    `start`/`end` são instantes lidos no fuso do navegador. O intervalo de dias é
    montado **incrementando o dia do calendário**, não somando 24 h em milissegundos:
    num limite de horário de verão o dia tem 23 ou 25 horas, e a aritmética de
    milissegundo produziria data duplicada ou pulada.

!!! check "Evento cruzando meia-noite aparece nas duas colunas"
    Uma reserva 23:00–01:00 é dividida em dois segmentos, cada um clipado à janela
    visível do seu dia. Sem isso ela ou desaparece ou é desenhada fora da coluna.

!!! note "Dia inteiro tem faixa própria"
    Evento com `allDay` sai numa faixa acima da grade, atravessando os dias que
    cobre — posição vertical não significaria nada pra ele. A faixa não é renderizada
    quando não há nenhum.

!!! tip "Clique em espaço vazio cria; clique no evento não"
    O `onSlotClick` só dispara quando o clique caiu na coluna, não num evento dentro
    dela — o instante vem snapado em `snapMinutes` e clampado à janela.

!!! warning "Não é `role="grid"`"
    Uma grade ARIA exige filhos `row`, e aqui os eventos são **irmãos** das colunas
    dentro de um único CSS grid: um wrapper `row` faria as colunas deixarem de ser
    itens do grid e o layout colapsaria. Cada dia é um `group` rotulado — o leitor de
    tela tabula os botões de evento e o nome do grupo dá o dia. Verificado com `axe`.

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

### `Wizard`

Fluxo multi-passo: indicador, um corpo por vez e navegação que respeita **validação por passo**. O `Stepper` desenha o indicador; o `Wizard` é dono do que todo app reescrevia — índice ativo, gate assíncrono antes de avançar, botões desabilitados/pendentes e a chamada de conclusão.

```tsx
import { Button, FormActions, FormField, Input, Wizard, useZodForm } from "tempest-react-sdk";
import { FormProvider } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  cep: z.string().min(9, "CEP incompleto"),
});

export function CadastroEmEtapas() {
  const form = useZodForm(schema, { defaultValues: { nome: "", email: "", cep: "" } });

  return (
    <FormProvider {...form}>
      <Wizard
        nextLabel="Avançar"
        backLabel="Voltar"
        finishLabel="Concluir"
        onComplete={form.handleSubmit((values) => console.log(values))}
        steps={[
          {
            id: "dados",
            label: "Dados",
            description: "Quem é o cliente",
            validate: () => form.trigger(["nome", "email"]),
            content: (
              <>
                <FormField name="nome" label="Nome" required><Input /></FormField>
                <FormField name="email" label="E-mail" required><Input type="email" /></FormField>
              </>
            ),
          },
          {
            id: "endereco",
            label: "Endereço",
            validate: () => form.trigger(["cep"]),
            content: <FormField name="cep" label="CEP" required><Input /></FormField>,
          },
          {
            id: "revisao",
            label: "Revisão",
            content: ({ back }) => (
              <>
                <pre>{JSON.stringify(form.getValues(), null, 2)}</pre>
                <Button variant="ghost" onClick={back}>Corrigir</Button>
              </>
            ),
          },
        ]}
      />
    </FormProvider>
  );
}
```

| Prop                 | Tipo                                          | Default    | Descrição                                                    |
| -------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `steps`              | `WizardStep[]`                                | —          | Passos do fluxo.                                             |
| `activeIndex`        | `number`                                      | —          | Índice controlado.                                           |
| `defaultActiveIndex` | `number`                                      | `0`        | Índice inicial (não controlado).                             |
| `onStepChange`       | `(index, step) => void`                       | —          | Chamado a cada troca de passo.                               |
| `onComplete`         | `() => void \| Promise<void>`                 | —          | Chamado quando o último passo passa na validação.            |
| `nextLabel`          | `string`                                      | `"Next"`   | Rótulo do botão de avanço.                                   |
| `backLabel`          | `string`                                      | `"Back"`   | Rótulo do botão de voltar.                                   |
| `finishLabel`        | `string`                                      | `"Finish"` | Rótulo no último passo.                                      |
| `optionalLabel`      | `string`                                      | `"(optional)"` | Sufixo do passo opcional no indicador — troque para localizar.  |
| `clickableSteps`     | `boolean`                                     | `false`    | Permite pular clicando no indicador.                         |
| `renderActions`      | `(controls: WizardControls) => ReactNode`     | —          | Substitui a linha de botões padrão.                          |

`WizardStep = { id, label, description?, content, validate?, optional? }` — `content` aceita `ReactNode` **ou** função que recebe os controles.

`WizardControls = { activeIndex, step, validating, isFirst, isLast, next, back, goTo }`.

!!! warning "Só o passo ativo está montado"
    Input não commitado em um passo que você abandona **se perde**, a menos que o estado viva fora (o `FormProvider` do react-hook-form, uma store, um `useState` do pai) — que é onde ele deveria estar de todo jeito, já que o último passo normalmente submete tudo de uma vez.

!!! tip "`validate` assíncrono já vem com estado de pendência"
    Enquanto a promise corre, o botão de avanço fica em `loading` e o de voltar desabilitado. Um `validate` que **lança** conta como "não permitido": um gate ligado a checagem de rede não deve deixar o usuário num fluxo meio-avançado quando a requisição falha.

!!! note "`clickableSteps` é `false` de propósito"
    Um wizard existe porque a **ordem importa**. Com `clickableSteps`, pular pra trás é livre (voltar nunca bloqueia), mas pular pra frente valida **cada passo atravessado** — o primeiro gate que reprovar interrompe o salto ali.

### `Transfer`

> **Quando usar**: escolher um **subconjunto** de um catálogo — permissões de um perfil, cidades de uma rota, membros de um grupo, colunas de um relatório.

Dois painéis, quatro controles de mover, busca em cada lado. Controlado pelos **ids do lado direito**; os dois painéis são derivados.

```tsx
import { Transfer, type TransferItem } from "tempest-react-sdk";
import { useState } from "react";

const PERMISSOES: TransferItem[] = [
  { id: "pedidos.ler", label: "Ler pedidos" },
  { id: "pedidos.criar", label: "Criar pedidos" },
  { id: "auditoria.ler", label: "Ler auditoria", disabled: true },
];

export function PermissoesDoPerfil() {
  const [permissoes, setPermissoes] = useState<string[]>([]);

  return (
    <Transfer
      items={PERMISSOES}
      value={permissoes}
      onChange={setPermissoes}
      sourceTitle="Disponíveis"
      targetTitle="Do perfil"
    />
  );
}
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `items` | `TransferItem[]` | — | O catálogo inteiro. Os dois painéis saem dele. |
| `value` | `string[]` | — | Ids do lado direito. **Controlado.** |
| `onChange` | `(value: string[]) => void` | — | Próximo valor, sempre na ordem do catálogo. |
| `sourceTitle` / `targetTitle` | `ReactNode` | `"Disponíveis"` / `"Selecionados"` | Título de cada painel. |
| `searchable` | `boolean` | `true` acima de 8 itens | Caixa de busca em cada painel. |
| `renderItem` | `(item, side) => ReactNode` | `item.label` | Corpo customizado da linha. |
| `height` | `string` | `"16rem"` | Altura da área de rolagem de cada painel. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Rótulos e anúncios. |
| `disabled` | `boolean` | `false` | Bloqueia todo movimento. |

`TransferItem = { id, label, searchText?, disabled?, data? }`

!!! info "Só os ids do lado direito são estado — os painéis são derivados"
    Guardar duas listas parece mais simples e **deriva** no primeiro momento em que o catálogo muda por baixo: uma permissão removida no servidor fica pendurada no painel que a tinha, e um id que aparece nos dois lados é um bug que ninguém vê. Com um `value` só, `items` manda: o que saiu do catálogo simplesmente desaparece dos dois lados.

!!! check "O botão de mover todos respeita o filtro"
    Filtrar por `sao` e clicar em "mover todos" move **o que você está vendo**, não o painel inteiro. Mover as linhas que o filtro escondeu é o tipo de surpresa que faz a pessoa parar de confiar no botão — e foi um bug real, pego por teste antes do merge.

!!! check "Busca dobra acento, nos dois sentidos"
    `sao` acha "São Paulo" e `são` também. Para um público PT-BR isso não é refinamento: um `includes` cru falharia na metade das buscas.

!!! warning "Linha `disabled` não se move por nenhum caminho"
    A checagem vive no `applyMove`, não em cada um dos quatro botões — é uma permissão obrigatória, um assento travado. Por isso o `»` move "todos os movíveis", não "todos".

!!! info "Depois de mover, as marcações são limpas"
    Senão o próximo clique no botão oposto manda tudo de volta, e o componente parece estar se desfazendo.

!!! info "Os controles ficam no meio pela grade, mas por último no DOM"
    Um teclado que chegasse nos botões antes de ver o que eles movem teria que voltar; e um leitor de tela leria "mover marcados pra direita" sem ideia do que está marcado. Cada painel é uma `region` nomeada pelo título, e cada movimento é anunciado num `role="status"`.

### `Chat`

> **Quando usar**: uma thread de mensagens — suporte, chat interno, comentário de documento, histórico de atendimento.

Agrupa por autor e por dia, marca o lado do usuário atual, mostra estado de entrega, quem está digitando, e traz o composer quando você passa `onSend`.

```tsx
import { Chat, Avatar, type ChatMessage } from "tempest-react-sdk";
import { useState } from "react";

export function Suporte({ me }: { me: { id: string } }) {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);

  /** Insert otimista: a mensagem aparece antes do servidor confirmar. */
  const enviar = async (texto: string) => {
    const id = crypto.randomUUID();
    setMensagens((atual) => [
      ...atual,
      { id, body: texto, authorId: me.id, sentAt: Date.now(), status: "sending" },
    ]);
    await api.post("/mensagens", { body: { id, texto } });
    setMensagens((atual) =>
      atual.map((m) => (m.id === id ? { ...m, status: "sent" } : m)),
    );
  };

  return (
    <Chat
      messages={mensagens}
      currentUserId={me.id}
      onSend={enviar}
      onRetry={(m) => reenviar(m.id)}
      renderAvatar={(m) => <Avatar name={m.authorName ?? m.authorId} size="sm" />}
    />
  );
}
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `messages` | `ChatMessage[]` | — | A thread, **mais antiga primeiro**. Nunca reordenada. |
| `currentUserId` | `string` | — | Autor tratado como "seu": lado, cor e ticks de entrega. |
| `onSend` | `(text: string) => void \| Promise<void>` | — | Renderiza o composer. Recebe o texto já trimado. |
| `onRetry` | `(message: ChatMessage) => void` | — | Liga o botão de retry numa mensagem `"failed"`. |
| `onSendError` | `(error: unknown) => void` | — | Chamado quando `onSend` rejeita. O rascunho fica no campo. |
| `typing` | `string[]` | `[]` | Quem está digitando. Um, dois ou a contagem é fraseado pra você. |
| `renderAvatar` | `(message) => ReactNode` | — | Avatar da **primeira** mensagem de cada bloco. |
| `header` | `ReactNode` | — | Barra acima da thread, dentro do painel. |
| `groupWindowMs` | `number` | `300000` | Intervalo que ainda mantém mensagens no mesmo bloco. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Rótulos ("Hoje", "Você", "Enviando"…). |
| `emptyState` | `ReactNode` | `<EmptyState/>` | Thread vazia. |
| `composerDisabled` | `boolean` | `false` | Sem permissão, thread arquivada, offline. |

`ChatMessage = { id, body, authorId, authorName?, sentAt, status?, data? }` · `status` ∈ `"sending" | "sent" | "read" | "failed"`.

O componente é **apresentacional e controlado**, como o resto do SDK: recebe a lista e emite intenção. De onde vêm as mensagens (REST, o `createWebSocket` do SDK, um stream SSE) e como o insert otimista é feito ficam com o app, porque isso muda por backend.

!!! tip "A rolagem só pula pro fim se você já estava no fim"
    Uma thread que sempre rola pra mensagem nova arranca quem está lendo o histórico, toda vez que qualquer pessoa digita. Então o pulo acontece só quando o leitor já estava embaixo (com 48px de folga pra última linha parcialmente visível) — a regra pra qual todo app de chat converge. Verificado no browser: lendo o histórico no topo, três mensagens chegaram e a posição não se moveu.

!!! info "Bloco quebra por autor, por dia **e** por intervalo"
    Repetir avatar e nome em cada linha de uma rajada de cinco transforma conversa em lista de recibos. Mas uma resposta uma hora depois é um novo momento da conversa mesmo que ninguém tenha falado no meio — juntar ao bloco anterior colocaria um timestamp só em mensagens separadas por uma hora. O `groupWindowMs` é esse limite.

!!! warning "Estado de falha não é enfeite"
    Sem `"failed"` + `onRetry`, o usuário redigita o que já está na tela. A bolha que falhou mantém o **texto legível** (borda e meta em vermelho, não o fundo inteiro) justamente porque reler a mensagem é o que a pessoa faz antes de decidir reenviar.

!!! info "A thread é `role=\"log\"` com `aria-live=\"polite\"` e alcançável por teclado"
    Mensagem nova é anunciada sem roubar o foco. O contêiner tem `tabIndex={0}` porque uma área que rola e não tem nada focável dentro é inacessível pelo teclado — o mesmo problema que a [correção de rolagem](./data.md) resolveu no `Table`. Estado de entrega vai em texto (`VisuallyHidden`), não só no glifo: "✓✓" não é lido.

!!! tip "Serve como thread de comentários"
    É o mesmo componente **sem** `currentUserId` e sem `typing`: todos do mesmo lado, nome por bloco. Foi por isso que "quem sou eu" virou uma prop em vez de um campo `own` em cada mensagem — num comentário de documento ninguém quer marcar 200 mensagens.

#### `ChatComposer`

Exportado à parte pra quem monta o próprio layout (composer fixo no rodapé de uma rota, por exemplo). Textarea que cresce com o conteúdo, `Enter` envia, `Shift+Enter` quebra linha.

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `onSend` | `(text: string) => void \| Promise<void>` | — | Recebe o texto trimado. Limpa o campo só se não rejeitar. |
| `onError` | `(error: unknown) => void` | — | Erro do `onSend`. Rascunho preservado de qualquer forma. |
| `actions` | `ReactNode` | — | Antes do botão de enviar — anexo, emoji. |
| `maxRows` | `number` | `6` | Altura máxima, em linhas. |
| `sendLabel` | `string` | locale | Rótulo do botão. |

!!! warning "Ele é **não controlado**, de propósito"
    Rascunho de chat muda a cada tecla, e subir isso pro estado do app re-renderiza a thread inteira por caractere — o único lugar onde "controlado por default" custa algo visível. Quem precisa do rascunho (composer persistido, menu de slash-command) lê pelo `onChange` ou usa o ref (`focus()`, `setValue()`).

!!! danger "IME: `Enter` durante composição não envia"
    Compondo japonês ou coreano, `Enter` confirma a palavra candidata. Enviar ali publica meia palavra e come a confirmação — daí a checagem de `isComposing`.

### `Kanban`

> **Quando usar**: quadro de colunas com cards que mudam de estágio — backlog, pipeline de vendas, ordens de serviço por status.

Reordena dentro da coluna e move entre colunas, por ponteiro **ou** teclado. A máquina de arrasto é o `useSortable` — o quadro não reimplementa nada disso.

```tsx
import { applyKanbanMove, Kanban, type KanbanColumn } from "tempest-react-sdk";
import { useState } from "react";

export function QuadroDoBacklog() {
  const [colunas, setColunas] = useState<KanbanColumn[]>([
    { id: "todo", title: "A fazer", cards: [{ id: "1", content: "Corrigir login" }] },
    { id: "doing", title: "Fazendo", cards: [] },
    { id: "done", title: "Feito", cards: [], locked: true },
  ]);

  return (
    <Kanban
      label="Backlog"
      columns={colunas}
      onMove={(move) => setColunas((atual) => applyKanbanMove(atual, move))}
    />
  );
}
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `columns` | `KanbanColumn[]` | — | Colunas com seus cards, em ordem de exibição. |
| `onMove` | `(move: KanbanMove) => void` | — | Chamado **uma vez** por movimento confirmado. Você aplica. |
| `renderCard` | `(card, column) => ReactNode` | conteúdo do card | Customiza o corpo do card. |
| `label` | `string` | `"Quadro"` | Nome acessível do quadro. |
| `emptyLabel` | `ReactNode` | `"Nenhum card"` | Texto da coluna vazia. |
| `cardRoleDescription` | `string` | instrução de teclado | Anunciado por card — troque para localizar. |
| `disabled` | `boolean` | `false` | Bloqueia todo arrasto. |

`KanbanColumn = { id, title, cards, locked? }` · `KanbanCard = { id, content }` · `KanbanMove = { cardId, fromColumn, toColumn, toIndex }`.

`applyKanbanMove(columns, move)` é o reducer que aplica o movimento devolvendo arrays novos — exportado porque todo consumidor precisa do mesmo, e é onde vive o off-by-one.

!!! info "Coluna `locked` recusa entrada, mas deixa sair"
    É o caso de uma coluna "Feito" que não aceita mais trabalho, mas cujos cards ainda podem voltar atrás.

!!! warning "Movimento por teclado só alcança posição que tem card"
    O movimento caminha pelo espaço de índices dos cards existentes, então **soltar numa coluna vazia funciona por ponteiro, mas não por teclado**. Isso é limitação da implementação atual, não desenho: enquanto teclas de troca de coluna não entrarem, o caminho é mover para uma coluna que já tenha um card e reordenar.

!!! info "ARIA: um `listbox` por coluna, não um por quadro"
    Cada coluna com cards é um `listbox` nomeado pelo título, contendo só `option`. Um listbox único no quadro não sobrevive à marcação que um quadro precisa — `listbox` exige filhos `option`/`group`, e o cabeçalho da coluna no meio quebra essa posse. Coluna **vazia** não é marcada como listbox (zero `option` reprova `aria-required-children`), e o cabeçalho é `div`, não `<header>`: fora de elemento de seccionamento, todo `<header>` vira landmark `banner` — com três colunas, três banners duplicados.

## Recap

- **Essenciais**: `Toggle`/`ToggleGroup` para estados pressionáveis, `Label` para formulários, `Collapsible` para um bloco expansível, `ContextMenu`/`HoverCard` para overlays disparados por interação e `Command` para a paleta ⌘K.
- **Layout & UX**: `ScrollArea` para rolagem estilizada, `Resizable` para painéis divididos e `Calendar` para seleção de datas sem dependências externas.
- **Navegação & conteúdo**: `NavigationMenu` e `Menubar` para navegação com dropdowns, `Carousel` para sliders.
- **Dados**: `DataTable<T>` envolve o `Table` headless com busca, ordenação e paginação client-side.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
