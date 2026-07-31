# Pensando em componentes

Componente é a unidade de reuso do React, e é onde a maior parte dos apps
acumula dívida. Não porque as pessoas escrevem componente ruim — porque escrevem
**um** componente onde havia três.

Esta página é sobre encontrar as juntas.

## Duas espécies, e não misture

| Espécie             | Sabe o quê                          | Recebe                     | Testa como           |
| ------------------- | ----------------------------------- | -------------------------- | -------------------- |
| **De apresentação** | como algo **parece**                 | props                      | render + props       |
| **De domínio**      | o que é um "pedido"                  | props + hooks da feature   | render + mock do hook |

O componente de apresentação não sabe de onde vem o dado. O de domínio sabe o
domínio, mas não sabe HTTP (isso é [serviço](data-flow.md)).

```tsx
// Apresentação: reusável em qualquer app, qualquer domínio.
export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <Badge variant={tone}>{children}</Badge>;
}

// Domínio: traduz "pedido" para "aparência".
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}
```

O de apresentação é candidato a subir pro SDK. O de domínio nunca sobe — ele é
do seu app, e está certo assim.

!!! tip "Antes de escrever um componente de apresentação, procure no SDK"
    São 117 componentes. `Badge`, `DataTable`, `Modal`, `Combobox`, `Stepper`,
    `EmptyState`, `Skeleton`, `Toast`… Veja o
    [catálogo](../components.md). Reescrever `Modal` com foco-trap correto é uma
    semana que você não precisa gastar.

## Quando quebrar um componente

Não quebre por tamanho — quebre por **motivo de mudança**. Os quatro sinais:

### 1. O nome tem "e"

`UserCardAndActions`, `TableWithFilters`, `FormAndPreview`. O nome está te
contando que são dois.

### 2. Um pedaço muda por outro motivo

Se o `<header>` da tela muda quando o design muda e a `<table>` muda quando a
API muda, são duas responsabilidades num arquivo.

### 3. Um pedaço se repete

Duas vezes: talvez coincidência. Três: extraia.

### 4. Você precisa de um `if` grande no JSX

```tsx
// ❌ três telas num componente
{isLoading ? <Spinner /> : error ? <ErrorState … /> : orders.length === 0 ? <EmptyState … /> : <table>…</table>}
```

Isso pede um componente de estado ou um `switch` num sub-componente.

!!! warning "Quebrar cedo demais também custa"
    Um componente de 6 linhas usado em um lugar só, com 5 props, é indireção sem
    ganho. A pergunta não é "dá pra quebrar?" — é "**esse pedaço tem vida
    própria?**".

## Props: desenhe a interface, não a passagem de dados

Props são a API pública do componente. As regras que mais economizam dor:

### Máximo 7 props — e conte de verdade

Passar de 7 é o sinal mais confiável de que existem dois componentes ali. A saída
não é "agrupar em um objeto" (isso só esconde), é dividir.

### Prop booleana não escala

=== "❌ Errado"

    ```tsx
    <Button primary secondary danger small large />
    ```

    Oito combinações inválidas representáveis. O que acontece com
    `primary danger`?

=== "✅ Certo"

    ```tsx
    <Button variant="danger" size="sm" />
    ```

    Union de string: o compilador só aceita o que existe. É como todo componente
    do SDK é desenhado.

Regra: **três ou mais booleanas mutuamente exclusivas → vira `union`.**

### Passe `children`, não `content`

```tsx
// ✅ composição: quem chama decide o que vai dentro
<Card>
  <OrderSummary order={order} />
</Card>

// ❌ configuração: o Card precisa conhecer todos os casos
<Card contentType="order-summary" order={order} />
```

Composição é o que evita o componente que cresce uma prop por caso de uso.

### Slots quando precisa de mais de um lugar

```tsx
interface PageProps {
  title: ReactNode;
  actions?: ReactNode; // slot: botão, menu, o que o chamador quiser
  toolbar?: ReactNode;
  children: ReactNode;
}
```

`ReactNode` em slot é melhor que `string`: quem chama pode passar texto, ícone,
ou um componente inteiro, sem que `Page` mude.

### Nunca `...props` sem tipo

```tsx
// ✅ estende o elemento nativo — herda aria-*, data-*, onClick, className
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function Card({ elevated, className, ...rest }: CardProps) {
  return <div className={cn(styles.card, elevated && styles.elevated, className)} {...rest} />;
}
```

Estender `HTMLAttributes<T>` dá acessibilidade e composição de graça, com
autocomplete. `props: any` dá nada.

!!! info "`cn` é o utilitário pra isso"
    `cn(...)` do SDK junta classes ignorando `false`/`undefined`, e a `className`
    do chamador entra **por último** — então quem consome consegue sobrescrever.
    Veja [Utilitários](../utilities.md).

## Extraia lógica pra hook, não pra componente {#logic-to-hook}

Quando o componente está grande por causa de **lógica**, o corte não é vertical
(dois componentes) — é horizontal (componente + hook):

=== "Antes — 180 linhas"

    ```tsx
    export function OrderTable({ orders }: OrderTableProps) {
      const [sort, setSort] = useState<Sort>({ field: "code", order: "asc" });
      const [selected, setSelected] = useState<Set<string>>(new Set());
      const [page, setPage] = useState(1);

      const toggle = (id: string) => { /* 12 linhas */ };
      const sorted = /* 20 linhas */;
      const paged = /* 8 linhas */;

      return <table>{/* 110 linhas de JSX */}</table>;
    }
    ```

=== "Depois — 40 + 60 linhas"

    ```tsx
    // use-order-table.ts — a lógica, testável sem DOM
    export function useOrderTable(orders: Order[]) {
      const [sort, setSort] = useState<Sort>({ field: "code", order: "asc" });
      const [selected, setSelected] = useState<Set<string>>(new Set());
      const [page, setPage] = useState(1);

      const rows = useMemo(() => paginate(sortBy(orders, sort), page), [orders, sort, page]);

      return { rows, sort, setSort, selected, toggle, page, setPage };
    }

    // OrderTable.tsx — só a marcação
    export function OrderTable({ orders }: OrderTableProps) {
      const { rows, sort, setSort, selected, toggle } = useOrderTable(orders);
      return <table>{/* JSX enxuto */}</table>;
    }
    ```

O hook testa com `renderHook` — sem DOM, sem `screen.getByRole`, rápido. O
componente testa o que importa nele: o que aparece na tela.

!!! tip "O hook customizado é o 'service' do frontend"
    É onde a lógica de tela mora. Mas ele tem [limite](limits.md) também: hook de
    250 linhas é serviço disfarçado — quebre em hooks menores ou mova a parte pura
    pra uma função em `lib/`.

## `React.memo`, `useMemo`, `useCallback`: por medição

React re-renderiza rápido. `memo` em tudo custa comparação de props em cada
render e complica o código com `useCallback` em cascata.

Use quando:

- O componente renderiza **listas grandes** (centenas de itens).
- O profiler mostra um render caro — não "parece caro".
- A prop é objeto/array recriado a cada render **e** o filho é `memo`.

!!! note "Antes de otimizar render, olhe o desenho"
    Lista de 5.000 itens não precisa de `memo` — precisa de
    [`VirtualList`/`VirtualTable`](../components/data.md). O ganho de virtualizar é
    ordens de magnitude maior que qualquer memoização.

## Acessibilidade é parte do componente, não polimento

Um componente interativo sem isso está incompleto:

- Elemento certo: `<button>` pra ação, `<a>` pra navegação. `<div onClick>` não
  recebe foco nem responde a Enter.
- `label` associado a todo campo (`<Label htmlFor>` ou `aria-label`).
- Foco visível — nunca `outline: none` sem substituto.
- Overlay (modal, drawer, popover): foco preso dentro, `Esc` fecha, foco volta pro
  gatilho ao sair.

Os componentes do SDK já implementam isso; o que você escreve por cima é que
precisa de atenção. O CI roda `axe` no gallery — veja
[Estratégia de testes](testing.md).

## Recap

- Duas espécies: **apresentação** (não sabe domínio) e **domínio** (não sabe HTTP).
- Quebre por **motivo de mudança**, não por linha: nome com "e", pedaço repetido,
  `if` grande no JSX.
- ≤ 7 props; booleana exclusiva vira `union`; `children` e slots antes de
  configuração.
- `...rest` tipado via `HTMLAttributes<T>` — acessibilidade e composição de graça.
- Componente grande por **lógica** → extraia **hook**, não outro componente.
- Memoize por medição; lista grande é virtualização, não `memo`.

Próxima: [Limites objetivos](limits.md) — os números.
