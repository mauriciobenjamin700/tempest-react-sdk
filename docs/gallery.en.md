# Gallery — visual + functional catalogue

An interactive demo of every SDK component and feature. Runs as a Vite + React
app in [`examples/gallery`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery).

## How to run

```bash
# repo root
npm install
npm run build           # generates the SDK's dist/

cd examples/gallery
npm install
npm run dev             # http://127.0.0.1:5173
```

`tempest-react-sdk` is consumed via `file:../..` — any rebuild from the root
shows up in the gallery after a reload.

## Sections

| #   | Section            | Components / Features                                                                                | File                                                                                                                                                |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Buttons            | `Button`                                                                                             | [ButtonsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ButtonsSection.tsx)           |
| 2   | Form fields        | `Input`, `Select`, `Textarea`, `SearchBar`                                                           | [FormFieldsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FormFieldsSection.tsx)     |
| 3   | Feedback           | `Badge`, `Card`, `Spinner`, `Skeleton`                                                               | [FeedbackSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FeedbackSection.tsx)         |
| 4   | Modal & Toast      | `Modal`, `ConfirmDialog`, `ToastProvider`, `useToast`                                                | [ModalSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ModalSection.tsx)               |
| 5   | Table & Pagination | `Table`, `Pagination`, `EmptyState`, `ErrorState`, `useDebounce`, `useClientFilter`, `usePagination` | [TableSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/TableSection.tsx)               |
| 6   | Forms (zod)        | `useZodForm`, `zodResolver`                                                                          | [FormsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/FormsSection.tsx)               |
| 7   | Theme + i18n       | `ThemeProvider`, `useTheme`, `I18nProvider`, `useI18n`                                               | [ThemeI18nSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/ThemeI18nSection.tsx)       |
| 8   | Integrations       | `useEventStream` (live SSE), `isPushSupported`, `playAudio`                                          | [IntegrationsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/IntegrationsSection.tsx) |
| 9   | Utils              | `formatCurrency`, `formatDate`, `formatPhone`, `formatCPF`, `formatPercent`, `formatDateTime`        | [UtilsSection.tsx](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/sections/UtilsSection.tsx)               |

## Variant matrix

### Button

| Prop      | Values                                       |
| --------- | -------------------------------------------- |
| `variant` | `primary` · `secondary` · `danger` · `ghost` |
| `size`    | `sm` · `md` · `lg`                           |
| Flags     | `loading`, `fullWidth`, `disabled`           |
| Slots     | `leftIcon`, `rightIcon`                      |

### Badge

| `variant` | Typical use          |
| --------- | -------------------- |
| `neutral` | Generic tag          |
| `success` | Paid, active, online |
| `warning` | Pending, degraded    |
| `danger`  | Failure, blocked     |
| `info`    | In review, beta      |

### Modal

| Prop   | Values                                             |
| ------ | -------------------------------------------------- |
| `size` | `sm` · `md` · `lg` · `xl`                          |
| Flags  | `closeOnBackdrop`, `closeOnEsc`, `hideCloseButton` |
| Slots  | `title`, `children` (body), `footer`               |

### Toast (via `useToast`)

| Method                                                  | Variant |
| ------------------------------------------------------- | ------- |
| `toast.success(text)`                                   | success |
| `toast.error(text)`                                     | error   |
| `toast.warning(text)`                                   | warning |
| `toast.info(text)`                                      | info    |
| `toast.show({ title, description, variant, duration })` | custom  |

### Table

| Column (`TableColumn<T>`) | Description                     |
| ------------------------- | ------------------------------- |
| `key`                     | unique identifier               |
| `header`                  | header label                    |
| `render(row, i)`          | custom cell; default `row[key]` |
| `align`                   | `left` · `right` · `center`     |
| `width`                   | string or number                |

### Spinner / Skeleton

| Spinner `size`     | Skeleton `variant`         |
| ------------------ | -------------------------- |
| `sm` · `md` · `lg` | `rect` · `text` · `circle` |

### Theme modes

| Mode     | Behavior                                                |
| -------- | ------------------------------------------------------- |
| `light`  | forces light, ignores OS                                |
| `dark`   | forces dark, ignores OS                                 |
| `system` | listens to `prefers-color-scheme`, updates in real time |

## Screenshots

Screenshots are not committed — generate them locally by opening the app in
`dev`. Suggested pages to save:

- `gallery-light.png` — overview in the light theme
- `gallery-dark.png` — the same content in the dark theme
- `gallery-mobile.png` — viewport ≤ 430px

## See also

- [Gallery app README](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/README.md)
- [Architecture](./architecture.md)
- [Components](./components.md)
