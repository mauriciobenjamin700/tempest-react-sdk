# Dados

Componentes de **dados** apresentam coleções — várias entidades do mesmo tipo — de forma legível e navegável. A escolha depende de _quantos_ itens e de _como_ o usuário os percorre: comparar campos lado a lado (`Table`), rolar milhares de linhas sem travar (`VirtualList`), expandir/colapsar seções de conteúdo (`Accordion`) ou seguir uma sequência de eventos no tempo (`Timeline`).

Use esta página quando precisa **listar/comparar** registros. Para um único registro use um [`Card`](./identity.md); para entrada de dados, [inputs](./inputs.md).

## `Table<T>`

> **Quando usar**: comparar registros estruturados campo a campo em colunas — pedidos, usuários, transações. Tipada por `T`, com prioridade responsiva por coluna e stack opcional em mobile.

```tsx
const columns: TableColumn<Order>[] = [
  { key: "id", header: "ID", align: "right", priority: "always" },
  { key: "customer", header: "Cliente", priority: "always" },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (row) => formatCurrency(row.total, "BRL"),
    priority: "always",
  },
  {
    key: "created_at",
    header: "Data",
    render: (row) => formatDate(row.created_at),
    priority: "tablet",
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    priority: "desktop",
  },
  {
    key: "actions",
    header: "",
    render: (row) => (
      <Button size="sm" onClick={() => edit(row.id)}>
        Editar
      </Button>
    ),
    priority: "desktop",
  },
];

<Table
  columns={columns}
  data={orders}
  rowKey={(row) => row.id}
  onRowClick={(row) => navigate(`/orders/${row.id}`)}
  stackOnMobile
  emptyMessage="Nenhum pedido encontrado."
/>;
```

| Prop            | Tipo                                           | Default                         |
| --------------- | ---------------------------------------------- | ------------------------------- |
| `columns`       | `TableColumn<T>[]`                             | —                               |
| `data`          | `T[]`                                          | —                               |
| `rowKey`        | `(row: T, index: number) => string \| number`  | —                               |
| `onRowClick`    | `(row: T) => void`                             | —                               |
| `emptyMessage`  | `ReactNode` (exibido quando `data` está vazio) | `"Nenhum registro encontrado."` |
| `stackOnMobile` | `boolean` (rows viram cards label/value < md)  | `false`                         |

`TableColumn<T>`:

| Campo       | Tipo                                          | Notas                                                      |
| ----------- | --------------------------------------------- | ---------------------------------------------------------- |
| `key`       | `string`                                      | Identificador + key padrão (lê `row[key]`)                 |
| `header`    | `ReactNode`                                   | Cabeçalho da coluna; vira `data-label` no modo stack       |
| `render`    | `(row: T, index: number) => ReactNode`        | Default = `row[key]`                                       |
| `align`     | `"left" \| "right" \| "center"`               | Default `"left"`                                           |
| `priority`  | `"always" \| "tablet" \| "desktop"`           | `tablet`: escondida em < md. `desktop`: escondida em < lg. |
| `width`     | `string \| number`                            | CSS width (`120px`, `20%`, `auto`)                         |
| `className` | `string`                                      | Classe extra aplicada às células daquela coluna            |

!!! warning "Não existe prop `loading`"
    A `Table` não renderiza skeleton rows por conta própria. Para um estado de carregamento, renderize seu próprio skeleton condicionalmente _antes_ da tabela, ou passe linhas placeholder em `data`. O `emptyMessage` cobre apenas o caso "consulta válida, zero resultados".

**Responsive**:

- `priority="tablet"` → colunas escondidas em viewport `< md` (768px).
- `priority="desktop"` → escondidas em `< lg` (1024px).
- `stackOnMobile` → no `< sm` (640px), cada row vira um card label/value.

## `VirtualList`

> **Quando usar**: rolar listas muito longas (500+ itens) de linhas com **altura fixa** sem inundar o DOM — chats, logs, feeds infinitos.

Renderiza apenas a janela visível + um pequeno buffer de overscan. Cada linha precisa de altura fixa (`itemHeight`); o container precisa de uma altura (`height`).

```tsx
<VirtualList
  items={messages}
  itemHeight={64}
  height={480}
  overscan={5}
  getKey={(message) => message.id}
  renderItem={(message) => <MessageRow message={message} />}
/>
```

| Prop         | Tipo                                           | Default |
| ------------ | ---------------------------------------------- | ------- |
| `items`      | `T[]`                                          | —       |
| `itemHeight` | `number` (altura fixa de cada linha, px)       | —       |
| `height`     | `number \| string` (altura do container)       | —       |
| `renderItem` | `(item: T, index: number) => ReactNode`        | —       |
| `overscan`   | `number` (itens acima/abaixo da viewport)      | `4`     |
| `getKey`     | `(item: T, index: number) => string \| number` | `index` |

!!! warning "Altura fixa obrigatória"
    O `VirtualList` assume `itemHeight` constante para calcular a janela. Para linhas de altura variável use `@tanstack/react-virtual` ou `react-window` — resolvem o caso geral ao custo de mais setup.

!!! note "Busca nativa (Ctrl+F) só acha o visível"
    Itens fora da viewport não estão no DOM, então o `Ctrl+F` do navegador não os encontra. Abaixo de ~500 itens, prefira renderização normal: o ganho de perf é negligível e você mantém a busca nativa.

## `VirtualTable<T>`

> **Quando usar**: uma tabela de **milhares de linhas** numa única grade rolável — extrato, log de auditoria, exportação bruta. O `Table` renderiza tudo o que recebe e o `DataTable` pagina pra manter esse número pequeno; nenhum dos dois responde "me mostre as 40 000 linhas de uma vez".

Renderiza só a janela visível, como o `VirtualList`, mas continua sendo uma `<table>` de verdade: colunas alinhadas pelo browser, cabeçalho fixo, semântica de grade pra leitor de tela.

```tsx
<VirtualTable
  data={rows}
  columns={[
    { key: "id", header: "#", width: 80, sortable: true },
    { key: "name", header: "Nome", width: 240, sortable: true },
    { key: "total", header: "Total", width: 120, align: "right", sortable: true },
  ]}
  rowHeight={40}
  height={480}
  rowKey={(row) => row.id}
  onRowClick={(row) => open(row.id)}
/>
```

| Prop            | Tipo                                            | Default                            |
| --------------- | ----------------------------------------------- | ---------------------------------- |
| `data`          | `T[]`                                           | —                                  |
| `columns`       | `VirtualTableColumn<T>[]`                       | —                                  |
| `rowHeight`     | `number` (px, **uniforme**)                     | —                                  |
| `height`        | `number \| string` (altura do viewport)         | —                                  |
| `overscan`      | `number`                                        | `4`                                |
| `rowKey`        | `(row: T, index: number) => string \| number`   | `index`                            |
| `initialSort`   | `{ key: keyof T; direction: "asc" \| "desc" }`  | —                                  |
| `onRowClick`    | `(row: T, index: number) => void`               | —                                  |
| `scrollToIndex` | `number`                                        | —                                  |
| `caption`       | `ReactNode` (nome acessível, oculto visualmente) | —                                  |
| `emptyMessage`  | `ReactNode`                                     | `"Nenhum registro encontrado."`    |

Coluna: `{ key, header, render?, sortable?, align?, width? }`.

!!! info "Por que continua uma `<table>`"
    A janela é feita com **duas linhas espaçadoras** — uma acima da fatia visível, outra abaixo — em vez de posicionar linhas com `position: absolute`. Absoluto colapsaria o layout de tabela: cada largura de coluna teria que ser calculada à mão, e o elemento deixaria de ser uma tabela pra tecnologia assistiva. Com espaçadoras, o browser continua fazendo o layout das colunas e o leitor de tela continua anunciando uma grade.

!!! tip "Índice real, não o da janela"
    Como só uma fatia está no DOM, `aria-rowcount` na tabela e `aria-rowindex` em cada linha carregam os números **reais**. Sem isso o leitor de tela anuncia "linha 3 de 20" enquanto o usuário está na linha 5003 de 40 000 — é o detalhe que quase toda tabela virtualizada erra.

!!! warning "`rowHeight` uniforme, e igual ao que o CSS produz"
    É o que mapeia offset de rolagem pra índice de linha. Se o CSS renderizar uma altura diferente da declarada, a janela sai deslocada. Para altura variável use `@tanstack/react-virtual`.

!!! note "Defina `width` em toda coluna"
    Linhas entram e saem do DOM durante a rolagem, então deixar o browser dimensionar as colunas pelo que está renderizado agora faz elas pularem no meio do scroll. O componente usa `table-layout: fixed` justamente pra isso funcionar.

### `VirtualTable` ou `DataTable`?

| Precisa de…                                     | Use            |
| ----------------------------------------------- | -------------- |
| Busca + paginação, dezenas a centenas de linhas | `DataTable`    |
| Uma grade rolável de milhares de linhas         | `VirtualTable` |
| Controle total do markup, poucas linhas         | `Table`        |

Os dois ordenam com o mesmo comparador (`compareValues`), então "ordenado" quer dizer a mesma coisa nos dois — número numericamente, data por timestamp, string com `localeCompare` e `numeric: true`.

## `ListTile`

> **Quando usar**: a linha canônica de lista do Material — um item com slot à esquerda (ícone/avatar), título com subtítulo opcional e slot à direita (ícone, switch, meta). Ideal para listas de configurações, contatos ou menus.

Renderiza como `<div>` estático por padrão; ao receber `onClick` vira um `<button>` de largura total, acessível por teclado.

```tsx
import { useState } from "react";
import { ListTile, Switch } from "tempest-react-sdk";
import { Bell } from "lucide-react";

function NotificationsRow() {
  const [enabled, setEnabled] = useState(true);

  return (
    <ListTile
      leading={<Bell size={20} />}
      title="Notificações"
      subtitle="Receber alertas por push"
      trailing={
        <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      }
    />
  );
}
```

| Prop       | Tipo                                  | Default |
| ---------- | ------------------------------------- | ------- |
| `title`    | `ReactNode`                           | —       |
| `leading`  | `ReactNode` (slot esquerdo)           | —       |
| `subtitle` | `ReactNode` (linha secundária)        | —       |
| `trailing` | `ReactNode` (slot direito)            | —       |
| `onClick`  | `() => void` (torna a tile um botão)  | —       |
| `selected` | `boolean` (destaca a linha ativa)     | `false` |
| `disabled` | `boolean` (esmaecida, não-interativa) | `false` |

!!! note "Botão só quando há `onClick`"
    Sem `onClick`, a `ListTile` é um `<div>` puramente visual. Com `onClick`, ela vira `<button>` com `aria-pressed` (quando `selected`) e respeita `disabled` — não envolva em outro elemento clicável.

## `Accordion`

> **Quando usar**: condensar conteúdo seccionável que o usuário expande sob demanda — FAQs, formulários longos em etapas, painéis de configurações.

Modo single (default) ou `multiple`. Controlado via `value` + `onChange`, ou não-controlado via `defaultValue`.

```tsx
<Accordion
  items={[
    { id: "1", title: "Como cancelo minha assinatura?", children: <p>...</p> },
    { id: "2", title: "Quais formas de pagamento?", children: <p>...</p> },
  ]}
/>;

<Accordion multiple value={openIds} onChange={setOpenIds} items={faqItems} />;
```

| Prop           | Tipo                                 | Default |
| -------------- | ------------------------------------ | ------- |
| `items`        | `AccordionItem[]`                    | —       |
| `multiple`     | `boolean` (permite vários abertos)   | `false` |
| `value`        | `string[]` (ids abertos, controlled) | —       |
| `defaultValue` | `string[]` (ids abertos iniciais)    | `[]`    |
| `onChange`     | `(openIds: string[]) => void`        | —       |

`AccordionItem = { id, title, children, disabled? }`.

!!! note "Acessibilidade já incluída"
    Os cabeçalhos são `<button aria-expanded>` e o conteúdo recebe `aria-hidden` quando fechado. As setas ↑↓ trocam o item focado; Home/End pulam para o primeiro/último.

## `Timeline`

> **Quando usar**: mostrar uma sequência de eventos no tempo — rastreio de pedido, log de auditoria, feed de atividade. Cada entrada tem marker colorido, título, descrição e meta opcionais.

Feed vertical com markers coloridos. Renderiza como `<ol>` semântica (cada item é `<li>`).

```tsx
<Timeline
  items={[
    { id: "1", title: "Pedido criado", meta: "10:24", marker: "primary" },
    { id: "2", title: "Pagamento aprovado", meta: "10:25", marker: "success" },
    {
      id: "3",
      title: "Saiu pra entrega",
      description: "Motorista: João",
      meta: "11:00",
      marker: "warning",
    },
    { id: "4", title: "Entregue", meta: "12:30", marker: "success" },
  ]}
/>
```

| Prop        | Tipo                            | Default |
| ----------- | ------------------------------- | ------- |
| `items`     | `TimelineItem[]`                | —       |
| `connector` | `boolean` (linha entre markers) | `true`  |

`TimelineItem = { id, title, description?, meta?, icon?, marker?: "primary" \| "success" \| "warning" \| "danger" \| "neutral" }`.

## `TreeView`

> **Quando usar**: dados **hierárquicos** — árvore de categorias, permissões por módulo, pastas, organograma. Quando o dado é uma lista plana, `Table` ou `ListTile` servem melhor.

Implementa `role="tree"` com **roving tabindex**: uma única linha é tabulável e as setas movem o foco dentro do widget. É isso que evita uma árvore de 500 nós adicionar 500 paradas na ordem de tabulação da página.

```tsx
import { TreeView, type TreeNode } from "tempest-react-sdk";

const permissoes: TreeNode[] = [
  {
    id: "vendas",
    label: "Vendas",
    children: [
      { id: "vendas.ler", label: "Visualizar" },
      { id: "vendas.editar", label: "Editar" },
      { id: "vendas.excluir", label: "Excluir", disabled: true },
    ],
  },
  { id: "config", label: "Configurações", children: [] },
  { id: "sobre", label: "Sobre" },
];

export function PermissoesDoPapel() {
  const [selecionado, setSelecionado] = useState<string | null>(null);

  return (
    <TreeView
      label="Permissões"
      nodes={permissoes}
      defaultExpandedIds={["vendas"]}
      selectedId={selecionado}
      onSelect={(node) => setSelecionado(node.id)}
    />
  );
}
```

| Prop                 | Tipo                        | Default | O que faz                                                          |
| -------------------- | --------------------------- | ------- | ------------------------------------------------------------------ |
| `nodes`              | `TreeNode[]`                | —       | Nós raiz.                                                          |
| `expandedIds`        | `string[]`                  | —       | Expansão controlada.                                               |
| `defaultExpandedIds` | `string[]`                  | `[]`    | Expansão inicial (não controlada).                                 |
| `onExpandedChange`   | `(ids: string[]) => void`   | —       | Chamado a cada expandir/colapsar.                                  |
| `selectedId`         | `string \| null`            | —       | Seleção controlada.                                                |
| `defaultSelectedId`  | `string \| null`            | `null`  | Seleção inicial.                                                   |
| `onSelect`           | `(node: TreeNode) => void`  | —       | Chamado ao selecionar (clique, `Enter` ou `Espaço`).                |
| `toggleOnSelect`     | `boolean`                   | `true`  | Selecionar um galho também o expande/colapsa.                      |
| `label`              | `string`                    | —       | Nome acessível da árvore.                                          |

`TreeNode = { id, label, children?, icon?, disabled? }`.

**Teclado**: `↓`/`↑` movem · `→` expande (ou desce pro primeiro filho) · `←` colapsa (ou sobe pro pai) · `Home`/`End` primeira/última linha visível · `Enter`/`Espaço` selecionam.

!!! tip "`children: []` é um galho vazio, não uma folha"
    A distinção importa: uma pasta vazia deve mostrar o chevron e anunciar `aria-expanded`. Folha é `children` **ausente**.

!!! note "`toggleOnSelect={false}` quando o galho é uma escolha válida"
    O default (`true`) imita explorador de arquivos: clicar na pasta abre a pasta. Passe `false` quando o galho em si é selecionável — uma categoria que também é destino, por exemplo.

!!! info "O chevron não é um botão"
    Ele é decoração (`aria-hidden`): a linha já carrega `aria-expanded`, então um segundo controle focável ali só adicionaria ruído no leitor de tela, duplicando uma ação que o teclado já tem. Clique nele funciona (com o evento parado, então expande sem selecionar).

## Resumo

| Componente    | Use para                                    | Volume típico      |
| ------------- | ------------------------------------------- | ------------------ |
| `Table<T>`    | Comparar registros em colunas               | dezenas a centenas |
| `VirtualList` | Rolar listas longas de altura fixa          | 500+ itens         |
| `VirtualTable<T>` | Grade rolável de linhas em colunas      | milhares de linhas |
| `ListTile`    | Linha de lista (ícone + título + ação)      | qualquer           |
| `Accordion`   | Seções expansíveis sob demanda (FAQ, steps) | poucas seções      |
| `Timeline`    | Sequência de eventos no tempo               | qualquer           |
| `TreeView`    | Hierarquia navegável (categorias, permissões) | dezenas a centenas |

Pontos-chave de acessibilidade:

- `Table` usa `<th scope="col">` (já incluso); `onRowClick` aplica `role="button"` + `tabIndex={0}`.
- `Table` e `VirtualList` ganham **ponto de tabulação próprio enquanto rolam** (`role="group"`/`role="list"` + `tabIndex={0}`), e o perdem quando o conteúdo cabe. Sem isso o contêiner não tem nada focável dentro e quem usa teclado vê a barra de rolagem sem conseguir movê-la. Nomeie com `scrollLabel` (Table) ou `label` (VirtualList) quando a página tiver vários.
- `VirtualList`: itens fora da viewport não são renderizados — `Ctrl+F` só acha o visível.
- `VirtualTable`: continua uma `<table>` real (espaçadoras em vez de posicionamento absoluto), com `aria-rowcount`/`aria-rowindex` carregando os índices reais e não os da janela; cabeçalho ordenável expõe `aria-sort`.
- `Accordion`: ↑↓ trocam o item focado, Home/End pulam pro primeiro/último.
- `Timeline`: ordem semântica via `<ol>`; cada item é `<li>`.
- `TreeView`: `role="tree"` + roving tabindex (uma parada de tab só); `aria-level` reporta a profundidade e nós desabilitados são pulados na navegação.

Relacionados: [identity](./identity.md) (`Card flush` para hospedar a `Table`) · [feedback](./feedback.md) (`Badge` dentro de células) · [actions](./actions.md) (botões de linha).
