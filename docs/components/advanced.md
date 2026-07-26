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
