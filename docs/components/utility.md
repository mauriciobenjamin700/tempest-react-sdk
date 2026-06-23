# Utilitários & headless

Componentes pequenos e focados: alguns renderizam pedaços de UI (`Money`, `RelativeTime`, `CopyButton`), outros são **headless** — controlam comportamento/lógica sem opinar sobre o visual (`Portal`, `ClickOutside`, `For`). Todos importados de `tempest-react-sdk`.

## Display

### `CopyButton`

Botão que copia uma string pra clipboard e mostra um estado transiente de "copiado".

```tsx
import { CopyButton } from "tempest-react-sdk";

<CopyButton value="npm i tempest-react-sdk" />;

<CopyButton value={token} timeout={3000} onCopied={() => toast("Token copiado")}>
  Copiar token
</CopyButton>;
```

| Prop       | Tipo          | Default             | Notas                                                        |
| ---------- | ------------- | ------------------- | ------------------------------------------------------------ |
| `value`    | `string`      | —                   | Texto escrito no clipboard.                                  |
| `timeout`  | `number` (ms) | `2000`              | Quanto tempo o estado "copiado" fica ativo.                  |
| `children` | `ReactNode`   | `"Copy"`/`"Copied"` | Label fixo nos dois estados; sem `children` o texto alterna. |
| `onCopied` | `() => void`  | —                   | Chamado após escrita bem-sucedida.                           |

Estende `ButtonHTMLAttributes`. Falha de clipboard é silenciada; o timer é limpo no unmount.

### `RelativeTime`

Renderiza uma data como string relativa ("5 min atrás") dentro de um `<time>` semântico com `dateTime` legível por máquina.

```tsx
import { RelativeTime } from "tempest-react-sdk";

<RelativeTime date={post.createdAt} />; // pt-BR
<RelativeTime date={post.createdAt} locale="en" />;
```

| Prop     | Tipo                       | Default | Notas                        |
| -------- | -------------------------- | ------- | ---------------------------- |
| `date`   | `Date \| string \| number` | —       | Instante a renderizar.       |
| `locale` | `"pt" \| "en"`             | `"pt"`  | `"pt"` mapeia pra `"pt-BR"`. |

Estende `HTMLAttributes<HTMLTimeElement>`.

### `Money`

Renderiza um valor monetário **em centavos** como string de moeda localizada num `<span>`.

```tsx
import { Money } from "tempest-react-sdk";

<Money cents={1990} />; // "R$ 19,90"
<Money cents={500} currency="USD" locale="en-US" />; // "$5.00"
```

| Prop       | Tipo     | Default   | Notas                              |
| ---------- | -------- | --------- | ---------------------------------- |
| `cents`    | `number` | —         | Valor na menor unidade (centavos). |
| `currency` | `string` | `"BRL"`   | Código ISO 4217.                   |
| `locale`   | `string` | `"pt-BR"` | Locale BCP 47 usado na formatação. |

Estende `HTMLAttributes<HTMLSpanElement>`. Internamente divide `cents` por 100 e usa `Intl.NumberFormat`.

### `TruncateText`

Limita o texto a um número fixo de linhas via CSS line-clamp, com reticências no overflow.

```tsx
import { TruncateText } from "tempest-react-sdk";

<TruncateText lines={2}>{longDescription}</TruncateText>;
```

| Prop       | Tipo        | Default | Notas                                              |
| ---------- | ----------- | ------- | -------------------------------------------------- |
| `lines`    | `number`    | `1`     | Linhas antes de clampar (`--tempest-clamp-lines`). |
| `children` | `ReactNode` | —       | Conteúdo a clampar.                                |

Estende `HTMLAttributes<HTMLDivElement>`.

### `VisuallyHidden`

Conteúdo escondido visualmente mas acessível a leitores de tela — o padrão `sr-only`.

```tsx
import { VisuallyHidden } from "tempest-react-sdk";

<button>
  <Icon />
  <VisuallyHidden>Fechar</VisuallyHidden>
</button>;
```

| Prop | Tipo                          | Default  | Notas                             |
| ---- | ----------------------------- | -------- | --------------------------------- |
| `as` | `keyof JSX.IntrinsicElements` | `"span"` | Elemento intrínseco a renderizar. |

Estende `HTMLAttributes<HTMLElement>`.

---

## Headless / lógicos

Sem CSS próprio: encapsulam comportamento e te deixam fornecer a marcação.

### `Portal`

Renderiza os filhos em outra parte da árvore DOM via React portal — ideal pra overlays que precisam escapar de `overflow`/stacking contexts.

```tsx
import { Portal } from "tempest-react-sdk";

<Portal>
  <div className="toast">Salvo!</div>
</Portal>;

<Portal container={drawerRoot}>{menu}</Portal>;
```

| Prop        | Tipo              | Default         | Notas                                   |
| ----------- | ----------------- | --------------- | --------------------------------------- |
| `children`  | `ReactNode`       | —               | Conteúdo renderizado através do portal. |
| `container` | `Element \| null` | `document.body` | Nó DOM alvo.                            |

!!! info "SSR-safe"
Renderiza `null` no servidor e no primeiro render do cliente; monta o portal só depois da hidratação.

### `ClickOutside`

Embrulha os filhos num `<div>` e dispara `onOutside` quando um `mousedown`/`touchstart` acontece fora da subárvore. Útil pra fechar popovers e menus.

```tsx
import { ClickOutside } from "tempest-react-sdk";

<ClickOutside onOutside={() => setOpen(false)}>
  <Menu />
</ClickOutside>;
```

| Prop        | Tipo                                        | Default | Notas                         |
| ----------- | ------------------------------------------- | ------- | ----------------------------- |
| `onOutside` | `(event: MouseEvent \| TouchEvent) => void` | —       | Chamado em interação externa. |
| `children`  | `ReactNode`                                 | —       | Conteúdo dentro da fronteira. |

Estende `HTMLAttributes<HTMLDivElement>` (passa props pro `<div>` wrapper).

### `ConditionalWrapper`

Embrulha os filhos com `wrapper` só quando `condition` é `true` — evita duplicar a subárvore só pra adicionar um wrapper opcional (link, tooltip, boundary).

```tsx
import { ConditionalWrapper } from "tempest-react-sdk";

<ConditionalWrapper condition={Boolean(href)} wrapper={(children) => <a href={href}>{children}</a>}>
  <CardBody />
</ConditionalWrapper>;
```

| Prop        | Tipo                                 | Default | Notas                              |
| ----------- | ------------------------------------ | ------- | ---------------------------------- |
| `condition` | `boolean`                            | —       | Quando `true`, aplica o `wrapper`. |
| `wrapper`   | `(children: ReactNode) => ReactNode` | —       | Função de embrulho.                |
| `children`  | `ReactNode`                          | —       | Conteúdo que pode ser embrulhado.  |

### `For`

Renderizador de listas tipado e JSX-friendly, com fallback pra coleção vazia. O tipo do item é inferido de `each`.

```tsx
import { For } from "tempest-react-sdk";

<For each={users} fallback={<p>Nenhum usuário</p>}>
  {(user, index) => (
    <li key={user.id}>
      {index + 1}. {user.name}
    </li>
  )}
</For>;
```

| Prop       | Tipo                                    | Default | Notas                                 |
| ---------- | --------------------------------------- | ------- | ------------------------------------- |
| `each`     | `readonly T[]`                          | —       | Coleção a iterar.                     |
| `children` | `(item: T, index: number) => ReactNode` | —       | Render por item.                      |
| `fallback` | `ReactNode`                             | `null`  | Renderizado quando `each` está vazio. |

### `ErrorText`

Mensagem de erro de campo de formulário como `<p role="alert">`. Renderiza `null` quando não há children — pode ficar fixo abaixo do campo e só aparece quando há erro.

```tsx
import { ErrorText } from "tempest-react-sdk";

<input aria-invalid={Boolean(error)} />
<ErrorText>{error}</ErrorText>;
```

| Prop       | Tipo        | Default | Notas                                               |
| ---------- | ----------- | ------- | --------------------------------------------------- |
| `children` | `ReactNode` | —       | Mensagem; `null`/`""`/`false` → não renderiza nada. |

Estende `HTMLAttributes<HTMLParagraphElement>`. Estilizado com o token `--tempest-danger`.

---

## Mídia / conteúdo

### `Image`

`<img>` com lazy loading nativo e fallback de uma tentativa.

```tsx
import { Image } from "tempest-react-sdk";

<Image src={user.avatarUrl} fallback="/avatar-placeholder.png" alt={user.name} />;
```

| Prop       | Tipo      | Default | Notas                                       |
| ---------- | --------- | ------- | ------------------------------------------- |
| `src`      | `string`  | —       | Fonte primária.                             |
| `fallback` | `string`  | —       | Fonte trocada uma vez se a primária falhar. |
| `alt`      | `string`  | —       | Texto alternativo (obrigatório).            |
| `lazy`     | `boolean` | `true`  | `true` → `loading="lazy"`; `false` → eager. |

Estende `ImgHTMLAttributes` (sem `src`). O fallback é guardado pra não entrar em loop de `onError`.

### `DataList`

Lista genérica tipada que renderiza um `<ul>` com um `<li>` por item, com slot de vazio.

```tsx
import { DataList } from "tempest-react-sdk";

<DataList
  items={notifications}
  keyExtractor={(n) => n.id}
  renderItem={(n) => <NotificationRow notification={n} />}
  empty={<p>Sem novidades</p>}
/>;
```

| Prop           | Tipo                                           | Default | Notas                                  |
| -------------- | ---------------------------------------------- | ------- | -------------------------------------- |
| `items`        | `readonly T[]`                                 | —       | Coleção a renderizar.                  |
| `renderItem`   | `(item: T, index: number) => ReactNode`        | —       | Conteúdo de cada `<li>`.               |
| `keyExtractor` | `(item: T, index: number) => string \| number` | índice  | Key estável por item.                  |
| `empty`        | `ReactNode`                                    | —       | Renderizado quando `items` está vazio. |

Estende `HTMLAttributes<HTMLUListElement>`.

### `DescriptionList`

`<dl>` semântico de pares termo/descrição, com estilização chave/valor baseada em tokens.

```tsx
import { DescriptionList } from "tempest-react-sdk";

<DescriptionList
  items={[
    { term: "Pedido", description: "#1042" },
    { term: "Status", description: <Badge variant="success">Pago</Badge> },
    { term: "Total", description: <Money cents={1990} /> },
  ]}
/>;
```

| Prop    | Tipo                    | Default | Notas                |
| ------- | ----------------------- | ------- | -------------------- |
| `items` | `DescriptionListItem[]` | —       | Pares `<dt>`/`<dd>`. |

`DescriptionListItem = { term: ReactNode; description: ReactNode }`. Estende `HTMLAttributes<HTMLDListElement>`.

---

## Recap

- **Display**: `CopyButton` (clipboard + estado transiente), `RelativeTime` (`<time>` relativo), `Money` (centavos → moeda), `TruncateText` (line-clamp), `VisuallyHidden` (sr-only).
- **Headless/lógicos**: `Portal` (SSR-safe), `ClickOutside`, `ConditionalWrapper`, `For` (lista tipada com fallback), `ErrorText` (erro de campo `role="alert"`).
- **Mídia/conteúdo**: `Image` (lazy + fallback), `DataList` (`<ul>` genérico), `DescriptionList` (`<dl>` termo/valor).
- Componentes "display" e "conteúdo" usam tokens `--tempest-*`; os headless não trazem CSS — você fornece a marcação.

## Veja também

- [Utilitários](../utilities.md) — `Money`/`RelativeTime` são as versões em componente de helpers de formatação.
- [Dados](./data.md) — `Table`/`VirtualList` para coleções maiores.
