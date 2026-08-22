# Avançados: dados

Tabela stateful, assistente em passos, markdown, mural, tour guiado, transferência entre listas, barra de filtros e kanban. Cada um resolve uma tela inteira.

## `DataTable<T>`

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

## `Wizard`

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

## `Markdown`

> **Quando usar**: renderizar texto que veio de gente — comentário, descrição de ticket, release notes, corpo de mensagem.

Subconjunto de Markdown: headings, parágrafos, listas (aninhadas e numeradas), citação, código cercado (via [`CodeBlock`](utility.md#codeblock)), regra, tabela GFM com alinhamento, e o inline usual (`**forte**`, `*itálico*`, `` `código` ``, `~~riscado~~`, link, imagem, autolink, quebra forçada).

```tsx
import { Markdown } from "tempest-react-sdk";

<Markdown source={comentario.corpo} linkProps={{ target: "_blank", rel: "noreferrer" }} />;
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `source` | `string` | — | O Markdown. |
| `headingOffset` | `number` | `2` | Nível que o `#` do documento vira. |
| `highlightCode` | `boolean` | `true` | Código cercado via `CodeBlock` (copiar, número de linha). |
| `showLineNumbers` | `boolean` | `false` | Número de linha no código cercado. |
| `linkProps` | `AnchorHTMLAttributes` | — | Props extras em **todo** link. |

!!! danger "A segurança é estrutural, não uma promessa de escape"
    `dangerouslySetInnerHTML` **não existe** neste componente. O parser produz uma árvore de nós e o render vira elementos React — e um filho de React só pode ser texto. Então `<script>alert(1)</script>` num comentário renderiza como os caracteres que a pessoa digitou, e `<img src=x onerror=...>` também.

    Isso não é "HTML sanitizado": **é texto**. É por isso que não há sanitizador aqui, nem lista de tags permitidas — não há caminho por onde markup entre.

!!! danger "URL passa por allowlist de esquema, não blocklist"
    Link aceita `http`, `https`, `mailto`, `tel`, `sms` e relativo. Imagem aceita os mesmos, mais `data:image/` **raster** (png/jpeg/gif/webp/avif) — `data:image/svg+xml` fica fora de propósito: um SVG é um documento, carrega `<script>` e handler de evento.

    `[clique](javascript:alert(1))` renderiza **"clique"** como texto: o link cai, as palavras ficam. Blocklist teria que enumerar `javascript:`, `JaVaScRiPt:`, `java\tscript:`, `\u0001javascript:` — e erraria a que ninguém pensou. A allowlist não tem essa dívida.

!!! warning "É um subconjunto, e isso é o teto escolhido"
    Não tem HTML embutido, nota de rodapé, definition list, referência de link (`[a][b]`), nem lista de tarefa. Se o seu caso precisa de CommonMark completo com plugins, use `react-markdown` + `remark` direto — são 40 KB e uma cadeia de plugins que o SDK inteiro não paga. O escopo aqui é o que um comentário de usuário usa.

!!! info "`#` vira `h2` por default"
    Um comentário renderizado numa página cujo `h1` é o título da página não pode emitir um segundo `h1`. O `headingOffset` desloca a escala inteira e o componente nunca passa de `h6`, então a outline continua válida.

!!! check "Tabela larga rola na própria caixa, e a caixa é alcançável"
    A parada de tabulação aparece **só enquanto** o transbordo é real — área que rola sem nada focável dentro é inalcançável por teclado, e adicionar a parada sempre poluiria a ordem de tabulação com uma entrada por tabela.

## `Masonry`

> **Quando usar**: cards de **altura desigual** que não têm ordem entre si — mural de notas, galeria de fotos, cartões de dashboard.

Mede os cards e joga cada um na coluna mais curta, então a borda de baixo fica o mais reta que o conteúdo permite.

```tsx
import { Masonry, Card } from "tempest-react-sdk";

<Masonry items={notas} itemKey={(nota) => nota.id} columns={{ 0: 1, 640: 2, 1024: 3 }}>
  {(nota) => <Card title={nota.titulo}>{nota.corpo}</Card>}
</Masonry>;
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `items` | `T[]` | — | O que distribuir. |
| `children` | `(item: T, index: number) => ReactNode` | — | Render de um card. |
| `columns` | `number \| Record<number, number>` | `{ 0: 1, 640: 2, 1024: 3 }` | Número fixo, ou mapa **largura → colunas**. |
| `itemKey` | `(item: T, index: number) => string \| number` | índice | Chave estável por item. |
| `gap` | `string` | `--tempest-space-4` | Espaço entre cards. |

!!! info "Por que não é uma linha de CSS"
    `columns` do CSS **quebra o card** na fronteira da coluna, e `grid-auto-flow: dense` mantém cada linha na altura da célula mais alta — que é exatamente a borda serrilhada que se usa masonry pra evitar. As duas são uma linha de CSS e nenhuma faz este trabalho.

!!! warning "A ordem de leitura desce a coluna, não atravessa a linha"
    Card 2 fica **embaixo** do card 1, não ao lado. É por isso que este layout serve pra itens **independentes**: uma lista em que o item 2 precisa vir depois do 1 quer um grid, não isto. Se a ordem importa pro seu conteúdo, não use masonry — nem aqui, nem em CSS puro.

!!! check "O mapa de breakpoints é sobre o contêiner, não sobre o viewport"
    Um masonry dentro de um drawer ou de uma página de duas colunas é mais estreito que a janela, e uma media query daria a ele três colunas com 300px de largura. Um `ResizeObserver` é o que faz `{ 0: 1, 640: 2 }` significar "deste contêiner", que é a única leitura útil.

!!! info "Coluna mais curta, não round-robin"
    `index % colunas` é o caminho óbvio e produz colunas desiguais no primeiro momento em que os itens têm alturas diferentes — que é o único motivo pra usar masonry.

!!! tip "Imagem que carrega depois é re-medida"
    Cada card é observado individualmente: altura medida na montagem erra justamente no caso da imagem que ainda estava baixando. O primeiro paint usa peso 1 pra todos (nunca aparece vazio) e o passe medido redistribui.

## `Tour`

> **Quando usar**: apresentar uma tela nova — onboarding de primeiro acesso, um recurso que mudou de lugar, um fluxo que ninguém acha sozinho.

Escurece a página, destaca um elemento por vez e explica. O elemento destacado **continua clicável**.

```tsx
import { Tour } from "tempest-react-sdk";
import { useState } from "react";

export function Pedidos() {
  const [aberto, setAberto] = useState(!storage.get("tour-pedidos-v1"));

  return (
    <>
      {/* … a tela … */}
      <Tour
        open={aberto}
        steps={[
          { target: "#novo-pedido", title: "Comece aqui", body: "Todo pedido nasce deste botão." },
          { target: "[data-tour='filtros']", body: "E filtre por período aqui.", placement: "right" },
        ]}
        onClose={() => setAberto(false)}
        onFinish={() => storage.set("tour-pedidos-v1", true)}
      />
    </>
  );
}
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `steps` | `TourStep[]` | — | As paradas, em ordem. |
| `open` | `boolean` | — | Controlado pelo app. |
| `onClose` | `() => void` | — | `Esc`, botão de fechar, "pular" ou clique no escuro. |
| `onFinish` | `() => void` | — | Depois do último passo, antes do `onClose`. |
| `index` / `onIndexChange` | `number` / `(i) => void` | interno | O app dirige o passo atual, se quiser. |
| `spotlightPadding` | `number` | `4` | Folga em volta do elemento destacado. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Rótulos. |

`TourStep = { target?, title?, body, placement? }` · `placement` ∈ `"top" | "bottom" | "left" | "right" | "center"`.

!!! check "O elemento destacado continua clicável — e é isso que faz um coachmark útil"
    O escuro são **quatro retângulos** em volta do alvo, não um overlay com buraco de `box-shadow`. Motivo: sombra **não é hit-testável**, então um buraco feito assim não bloquearia clique nenhum — o resto da página continuaria clicável e o alvo, não. Com quatro retângulos é o contrário, que é o que "aperte este botão" precisa.

!!! info "O alvo é um **seletor**, não um ref"
    Assim um tour pode ser declarado como dado — num arquivo de config, vindo do backend, ao lado da cópia — sem cada tela ter que passar refs pra quem renderiza o tour.

!!! warning "Passo cujo alvo não existe aparece centralizado, não desaparece"
    É o caso real: um recurso escondido por permissão, um botão que só existe com dado. Sumir com o passo esconderia a mensagem em silêncio, e pular pro seguinte poderia pular o tour inteiro.

!!! check "Teclado: setas andam, `Esc` sai, foco vai pro card"
    O card é `role="dialog"` + `aria-modal`, nomeado pelo título e descrito pelo corpo, com armadilha de foco (`useFocusTrap`) e "Passo 2 de 5" visível. O `Esc` é tratado **no card**, não na `window`: um tour aberto sobre um modal não fecha os dois.

!!! info "O card vira de lado quando não cabe — e vai pro centro quando nada cabe"
    Tenta o lado preferido, depois o **oposto** (vira relação de leitura com o alvo; pular pro lado moveria o card pela tela sem motivo visível), depois os outros. Card metade fora da tela é pior que card no meio — e isso acontece de verdade quando o alvo é mais alto que o viewport.

!!! tip "Persistir 'já viu' é do app"
    O componente recebe `open` e emite `onClose`/`onFinish`. Gravar a flag é uma linha no app (`storage.set`) e seria um default errado aqui — a chave tem versão, escopo por usuário, e às vezes mora no backend.

## `Transfer`

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

## `FilterBar`

> **Quando usar**: filtrar uma lista de admin — pedidos por status e período, usuários por papel, títulos por vencimento.

Chips com os filtros aplicados, e um editor pequeno pra adicionar outro. Os filtros são combinados com **E**, achatados.

```tsx
import {
  FilterBar,
  filtersFromSearchParams,
  filtersToSearchParams,
  type Filter,
  type FilterField,
} from "tempest-react-sdk";

const CAMPOS: FilterField[] = [
  { name: "titulo", label: "Título", type: "text" },
  { name: "total", label: "Total", type: "number" },
  { name: "criadoEm", label: "Criado em", type: "date" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "paid", label: "Pago" },
      { value: "sent", label: "Enviado" },
    ],
  },
];

export function Pedidos() {
  // O conjunto vem da URL, então um link compartilhado abre com os mesmos filtros.
  const [filtros, setFiltros] = useState<Filter[]>(() =>
    filtersFromSearchParams(new URLSearchParams(location.search), CAMPOS),
  );

  const { data } = useQuery({
    queryKey: ["pedidos", filtros],
    queryFn: () => api.get(`/pedidos?${filtersToSearchParams(filtros)}`),
  });

  return <FilterBar fields={CAMPOS} value={filtros} onChange={setFiltros} />;
}
```

| Prop | Tipo | Default | O que faz |
| --- | --- | --- | --- |
| `fields` | `FilterField[]` | — | Campos que podem ser filtrados. |
| `value` | `Filter[]` | — | Filtros aplicados. **Controlado.** |
| `onChange` | `(filters: Filter[]) => void` | — | Próximo conjunto, combinado com E. |
| `actions` | `ReactNode` | — | Ao lado dos controles — "salvar visão", contador. |
| `locale` | `"pt-BR" \| "en"` | `"pt-BR"` | Rótulos e descrições. |

`FilterField = { name, label, type, options?, operators?, placeholder? }` · `type` ∈ `"text" | "number" | "date" | "select" | "boolean"`
`Filter = { field, operator, value? }` · `operator` ∈ `eq · ne · contains · gt · gte · lt · lte · between · in · empty · notEmpty`

**Helpers exportados**: `applyFilters`, `filtersToQueryParams`, `filtersToSearchParams`, `filtersFromSearchParams`, `describeFilter`, `operatorsFor`.

#### Aplicando os filtros

O `FilterBar` **produz** `Filter[]`; quem avalia é você. O SDK dá as duas saídas, e você escolhe uma pelo tamanho da lista, não pelo gosto.

**Lista inteira na memória** — `applyFilters` roda os onze operadores:

```tsx
import { FilterBar, applyFilters, type Filter } from "tempest-react-sdk";

export function Pedidos({ pedidos }: { pedidos: Pedido[] }) {
  const [filtros, setFiltros] = useState<Filter[]>([]);
  const visiveis = useMemo(() => applyFilters(pedidos, filtros), [pedidos, filtros]);

  return (
    <>
      <FilterBar fields={CAMPOS} value={filtros} onChange={setFiltros} />
      <DataTable data={visiveis} columns={COLUNAS} />
    </>
  );
}
```

**Listagem paginada no servidor** — `filtersToQueryParams`, que fala o dialeto do `tempest-fastapi-sdk`:

```tsx
const params = filtersToQueryParams(filtros);
params.set("page", String(pagina));
params.set("page_size", "20");

const { data } = useQuery({
  queryKey: ["pedidos", filtros, pagina],
  queryFn: () => api.get(`/pedidos?${params}`),
});
```

| Operador | Param enviado |
| --- | --- |
| `eq` | `campo` (ou `campo__iexact` na coluna `name`) |
| `ne` | `campo__ne` |
| `contains` | `campo__icontains` |
| `gt` `gte` `lt` `lte` | `campo__gt` … `campo__lte` |
| `between` | `campo__between` duas vezes, menor primeiro |
| `in` | `campo__in`, uma vez por valor |
| `empty` / `notEmpty` | `campo__isnull=true` / `=false` |

!!! tip "O dialeto é o **default**, não uma lei"
    A tabela acima é o dialeto do `tempest-fastapi-sdk`. Backend diferente passa
    `options` em vez de reescrever o encoder:

    ```tsx
    // A coluna pesquisável é `razao_social`, e `ne` se escreve à moda Django.
    const params = filtersToQueryParams(filtros, {
      substringColumns: ["razao_social"],
      operatorSuffix: { ne: "__exclude" },
    });
    ```

    - `substringColumns` — as colunas cujo `eq` sai como `coluna__iexact`. Default
      `["name"]`, que é o caso especial de `build_filter_condition`. Passe `[]` se o
      seu backend não trata nenhuma coluna assim e um `eq` deve sair puro.
    - `operatorSuffix` — mesclado **sobre** o default, então o override nomeia só os
      operadores que diferem.

    Até a v0.44.0 os dois eram constantes fechadas no módulo. Quem tinha a coluna
    chamada `nome` ou `titulo` não conseguia o tratamento, e quem não tinha o caso
    especial recebia um `__iexact` que ninguém pediu.

!!! danger "O backend precisa **declarar** cada chave, senão o filtro falha calado"
    `BasePaginationFilterSchema.get_conditions()` só repassa campos que a subclasse declara. Um `status__ne` que o schema não menciona é descartado pelo FastAPI antes do repositório ver — sem erro, sem filtro, e a lista volta inteira parecendo que "o filtro não pegou". Declare `status__ne: str | None = None` no schema de filtro para cada operador que a tela oferece.

!!! warning "`applyFilters` e o backend discordam em dois pontos, de propósito"
    **`ne` casa linha sem valor.** No SQL, `coluna <> 'x'` é `NULL` quando a coluna é `NULL` e a linha some. No cliente, "não é pago" mostra também os pedidos sem status — que é o que o chip promete.
    **`empty` casa texto em branco.** `__isnull` no servidor só casa `NULL`; coluna que guarda `""` em vez de `NULL` responde diferente dos dois lados.
    Se a mesma tela alterna entre os dois modos, escolha um e fique nele por campo.

!!! info "`eq` é sensível a maiúscula; `contains` não é"
    É o alinhamento com o servidor: `eq` vira `WHERE coluna = valor`, e um cliente insensível discordaria dele. `contains` vira `icontains` e é insensível dos dois lados — e como é o operador **default** de campo de texto, o comportamento amigável é o que se ganha sem pedir.

!!! tip "Data compara por **dia**, e `between` é inclusivo nas duas pontas"
    Linha carimbada `2026-03-05T13:00:00Z` casa `eq 2026-03-05`, e um `between` invertido (data maior primeiro) é **normalizado** em vez de não casar nada — quem escolheu a data final primeiro quis o intervalo, não uma lista vazia.

!!! warning "É **E** achatado, não árvore com OU — e isso é o teto escolhido"
    Grupos aninhados (`(a OU b) E c`) são outro componente: exigem UI de árvore com operador por nó e outra serialização. Tentar ser os dois produz um builder desengonçado justamente no caso de 95% — "status é pago, criado depois de março, título contém nota". Se você precisa de OU aninhado, o que você quer é um query builder de verdade, e ele não cabe atrás desta API.

!!! check "O conjunto de filtros cabe na URL — e volta dela"
    `filtersToSearchParams` escreve `status=eq:paid&total=between:10|90`; `filtersFromSearchParams` lê de volta, e tem teste de **round-trip**. Filtro que não sobrevive a um reload é filtro que a pessoa redigita toda vez que abre um link que alguém mandou.

!!! danger "O que não parseia é **descartado**, não adivinhado"
    URL editada à mão é a forma normal desse dado chegar. Um operador que o campo não oferece (`total=contains:1`), um campo desconhecido, um `between` com uma ponta só — tudo cai fora. Renderizar um chip que o backend não consegue avaliar mostraria uma lista que não corresponde ao que o chip afirma.

!!! check "O chip lê em palavras, e é o mesmo texto que o leitor de tela ouve"
    "Status é Pago" — com o **label** da opção, não a chave (`paid`). O botão de remover usa a mesma frase no `aria-label` ("Remover filtro: Status é Pago"), porque um chip que diz uma coisa pra quem vê e outra pra quem ouve são duas verdades diferentes.

!!! info "O input segue o **campo**, não o operador"
    Campo de data ganha date picker mesmo no `between` (dois deles). Digitar data em caixa de texto é o caminho mais rápido pra produzir filtro que o backend não entende.

!!! tip "Filtro incompleto só desabilita o Aplicar"
    Não é erro pra gritar — é formulário meio preenchido. Trocar o operador limpa o valor, porque valor carregado entre operadores produz filtro que ninguém quis escrever.

## `Kanban`

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

- **Dados**: `DataTable<T>` envolve o `Table` headless com busca, ordenação e paginação client-side.
- Todos seguem os mesmos padrões controlado/não-controlado, expõem A11y por teclado e importam de `tempest-react-sdk`.
