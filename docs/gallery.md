# Gallery — catálogo visual + funcional

Demo interativo de todos os componentes e features do SDK. Roda como app Vite + React em [`examples/gallery`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery).

## Como rodar

```bash
# raiz do repo
npm install
npm run build           # gera dist/ do SDK

cd examples/gallery
npm install
npm run dev             # http://127.0.0.1:5173
```

`tempest-react-sdk` é consumido via `file:../..` — qualquer rebuild da raiz aparece na gallery após reload.

## Seções

| #   | Seção              | Componentes / Features                                                                               | Arquivo                                                                             |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Buttons            | `Button`                                                                                             | [ButtonsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ButtonsSection.tsx)           |
| 2   | Form fields        | `Input`, `Select`, `Textarea`, `SearchBar`                                                           | [FormFieldsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FormFieldsSection.tsx)     |
| 3   | Feedback           | `Badge`, `Card`, `Spinner`, `Skeleton`                                                               | [FeedbackSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FeedbackSection.tsx)         |
| 4   | Modal & Toast      | `Modal`, `ConfirmDialog`, `ToastProvider`, `useToast`                                                | [ModalSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ModalSection.tsx)               |
| 5   | Table & Pagination | `Table`, `Pagination`, `EmptyState`, `ErrorState`, `useDebounce`, `useClientFilter`, `usePagination` | [TableSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/TableSection.tsx)               |
| 6   | Forms (zod)        | `useZodForm`, `zodResolver`                                                                          | [FormsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FormsSection.tsx)               |
| 7   | Tema + i18n        | `ThemeProvider`, `useTheme`, `I18nProvider`, `useI18n`                                               | [ThemeI18nSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ThemeI18nSection.tsx)       |
| 8   | Integrações        | `useEventStream` (SSE vivo), `isPushSupported`, `playAudio`                                          | [IntegrationsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/IntegrationsSection.tsx) |
| 9   | Utils              | `formatCurrency`, `formatDate`, `formatPhone`, `formatCPF`, `formatPercent`, `formatDateTime`        | [UtilsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/UtilsSection.tsx)               |

## Matriz de variantes

### Button

| Prop      | Valores                                      |
| --------- | -------------------------------------------- |
| `variant` | `primary` · `secondary` · `danger` · `ghost` |
| `size`    | `sm` · `md` · `lg`                           |
| Flags     | `loading`, `fullWidth`, `disabled`           |
| Slots     | `leftIcon`, `rightIcon`                      |

### Badge

| `variant` | Uso típico          |
| --------- | ------------------- |
| `neutral` | Tag genérica        |
| `success` | Pago, ativo, online |
| `warning` | Pendente, degradado |
| `danger`  | Falha, bloqueado    |
| `info`    | Em revisão, beta    |

### Modal

| Prop   | Valores                                            |
| ------ | -------------------------------------------------- |
| `size` | `sm` · `md` · `lg` · `xl`                          |
| Flags  | `closeOnBackdrop`, `closeOnEsc`, `hideCloseButton` |
| Slots  | `title`, `children` (body), `footer`               |

### Toast (via `useToast`)

| Método                                                  | Variante |
| ------------------------------------------------------- | -------- |
| `toast.success(text)`                                   | success  |
| `toast.error(text)`                                     | error    |
| `toast.warning(text)`                                   | warning  |
| `toast.info(text)`                                      | info     |
| `toast.show({ title, description, variant, duration })` | custom   |

### Table

| Coluna (`TableColumn<T>`) | Descrição                         |
| ------------------------- | --------------------------------- |
| `key`                     | identificador único               |
| `header`                  | label do cabeçalho                |
| `render(row, i)`          | célula custom; default `row[key]` |
| `align`                   | `left` · `right` · `center`       |
| `width`                   | string ou número                  |

### Spinner / Skeleton

| Spinner `size`     | Skeleton `variant`         |
| ------------------ | -------------------------- |
| `sm` · `md` · `lg` | `rect` · `text` · `circle` |

### Theme modes

| Mode     | Comportamento                                         |
| -------- | ----------------------------------------------------- |
| `light`  | força claro, ignora OS                                |
| `dark`   | força escuro, ignora OS                               |
| `system` | escuta `prefers-color-scheme`, atualiza em tempo real |

## Screenshots

Os screenshots não são commitados — gere localmente abrindo o app em `dev`. Sugestão de páginas a salvar:

- `gallery-light.png` — visão geral no tema claro
- `gallery-dark.png` — mesmo conteúdo no tema escuro
- `gallery-mobile.png` — viewport ≤ 430px

## Veja também

- [README do app gallery](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/README.md)
- [Arquitetura](./architecture.md)
- [Componentes](./components.md)
