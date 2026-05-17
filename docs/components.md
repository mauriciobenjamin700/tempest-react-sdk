# Componentes UI

Catálogo curto + convenções. Todos usam CSS Modules com prefix `tempest_`, então conflitos com seus estilos de app são impossíveis.

## Lista

| Componente | Para que |
|------------|----------|
| `Button` | Ação primária. `variant: primary/secondary/danger/ghost`, `size: sm/md/lg`, `loading`, `fullWidth`, `leftIcon`/`rightIcon`. |
| `Input` | Texto. Forward ref, `label`, `helperText`, `error`, ícones. |
| `Textarea` | Multi-linha. Mesma API do Input. |
| `Select` | `<select>` nativo. `options: SelectOption[]` ou `<option>` filhos. |
| `Modal` | Portal + backdrop + Esc. `size: sm/md/lg/xl`, slot `footer`. |
| `ConfirmDialog` | Prompt destrutivo. Composto de Modal + Button. |
| `Table<T>` | `columns: TableColumn<T>[]`, `data`, `rowKey`, `onRowClick`. Suporta `render` por coluna e `align`. |
| `Pagination` | Numeric com siblings + `pageSize` opcional. |
| `Badge` | Status pill. `variant: neutral/success/warning/danger/info`. |
| `Card` | Container com header opcional (`title` + `actions`). `flush` pra hospedar tabelas. |
| `Spinner` | Loader simples. |
| `Skeleton` | Placeholder com shimmer. `variant: rect/text/circle`. |
| `EmptyState` | "Nada por aqui" centralizado. |
| `ErrorState` | Falha com retry. |
| `SearchBar` | Controlled search com clear button. |
| `Toast` | Provider + `useToast()`. Variants: success/warning/error/info. |

## Convenções

- **Forward ref** em inputs/textarea/select pra integrar com form libs.
- **`className` prop** sempre disponível pra customização local. Cuidado: o prefix `tempest_` evita colisão, mas seu `.module.css` ganha precedência.
- **Acessibilidade** baseline — `aria-invalid` em campos com erro, `aria-label` em close buttons, `aria-current="page"` na paginação.
- **Tokens CSS** (`var(--tempest-*)`) — customize cor/raio/sombra alterando o root, não copiando o CSS.

## Veja também

- [Tema](./theme.md) — tokens disponíveis
- README raiz — exemplos curtos por componente
