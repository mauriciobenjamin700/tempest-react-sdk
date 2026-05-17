# Componentes UI

Catálogo curto + convenções. Todos usam CSS Modules com prefix `tempest_`, então conflitos com seus estilos de app são impossíveis.

## Lista

### Entrada de dados

| Componente                                         | Para que                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Input`                                            | Texto. Forward ref, `label`, `helperText`, `error`, `leftIcon`/`rightIcon`.          |
| `Textarea`                                         | Multi-linha. Mesma API do Input.                                                     |
| `Select`                                           | `<select>` nativo. `options: SelectOption[]` ou `<option>` filhos.                   |
| `Checkbox`                                         | Single + indeterminate state.                                                        |
| `Radio` / `RadioGroup`                             | Radio standalone ou agrupado com value único.                                        |
| `Switch`                                           | Toggle on/off.                                                                       |
| `ChipInput`                                        | Lista de tags com adição via Enter + dedup automático.                               |
| `SearchBar`                                        | Input de busca com clear button.                                                     |
| `DatePicker`                                       | Date input nativo + label/error.                                                     |
| `FileUpload`                                       | Drag-and-drop + click-to-upload com lista de arquivos.                               |
| `Form` / `FormSection` / `FormRow` / `FormActions` | Layout wrapper com variantes (`stack`/`inline`/`grid`). Veja [forms.md](./forms.md). |

### Ação

| Componente      | Para que                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | Ação primária. `variant: primary/secondary/danger/ghost`, `size: sm/md/lg`, `loading`, `fullWidth`, `leftIcon`/`rightIcon`. |
| `ConfirmDialog` | Prompt destrutivo. Composto de Modal + Button.                                                                              |
| `Tooltip`       | Hover tooltip com `placement`, `delay`.                                                                                     |

### Overlay & navegação

| Componente    | Para que                                                     |
| ------------- | ------------------------------------------------------------ |
| `Modal`       | Portal + backdrop + Esc. `size: sm/md/lg/xl`, slot `footer`. |
| `Drawer`      | Side drawer com `placement: left/right/top/bottom`.          |
| `Tabs`        | Tabs controlled ou uncontrolled.                             |
| `Stepper`     | Wizard linear com steps numerados.                           |
| `Breadcrumbs` | Navegação hierárquica.                                       |
| `Pagination`  | Numeric com siblings + `pageSize` opcional.                  |

### Dados

| Componente    | Para que                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `Table<T>`    | `columns: TableColumn<T>[]`, `data`, `rowKey`, `onRowClick`. Suporta `render` por coluna e `align`. |
| `VirtualList` | Virtualização para listas grandes — overscan + dynamic row height via ResizeObserver.               |

### Status & feedback

| Componente   | Para que                                                              |
| ------------ | --------------------------------------------------------------------- |
| `Badge`      | Status pill. `variant: neutral/success/warning/danger/info`.          |
| `Progress`   | Barra de progresso. `variant: primary/success/danger`.                |
| `Spinner`    | Loader simples.                                                       |
| `Skeleton`   | Placeholder com shimmer. `variant: rect/text/circle`.                 |
| `Toast`      | `ToastProvider` + `useToast()`. Variants: success/warning/error/info. |
| `EmptyState` | "Nada por aqui" centralizado.                                         |
| `ErrorState` | Falha com retry.                                                      |

### Identidade

| Componente | Para que                                                 |
| ---------- | -------------------------------------------------------- |
| `Avatar`   | Foto de usuário com `size: sm/md/lg`, `status` (online). |
| `Card`     | Container com `title` + `actions`. `flush` pra tabelas.  |

### Layout primitives

| Componente  | Para que                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------- |
| `Container` | Max-width wrapper. `size: sm/md/lg/xl/full`.                                              |
| `Stack`     | Flex vertical ou horizontal com `gap` (escala 4px ou string), `align`, `justify`, `wrap`. |
| `Grid`      | CSS Grid wrapper. `columns: number \| string`, `gap`.                                     |

## Convenções

- **Forward ref** em inputs/textarea/select pra integrar com form libs (`react-hook-form`).
- **`className` prop** sempre disponível pra customização local. Cuidado: o prefix `tempest_` evita colisão, mas seu `.module.css` ganha precedência.
- **Acessibilidade baseline** — `aria-invalid` em campos com erro, `aria-label` em close buttons, `aria-current="page"` na paginação, focus trap em Modal/Drawer.
- **Tokens CSS** (`var(--tempest-*)`) — customize cor/raio/sombra alterando o root, não copiando o CSS. Veja [tema](./theme.md).
- **Loading state** em ações destrutivas e submits — `<Button loading>` desabilita + mostra spinner.
- **Error/helper text** — `Input` / `Textarea` / `Select` aceitam `error` (string) e `helperText` (string). `error` toma precedência e adiciona `aria-invalid="true"`.

## Veja também

- [Tema](./theme.md) — tokens CSS disponíveis
- [Forms](./forms.md) — Form layout + zod integration
- [README raiz](../README.md) — exemplos por recipe
- [Gallery](./gallery.md) — demo visual interativa
