# Gallery — visual + functional catalogue

An interactive demo of every SDK component and feature. Runs as a Vite + React
app in [`examples/gallery`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery).

## What is the gallery?

The gallery is a **real** Vite + React app that consumes the SDK exactly the way
a production app would — via an `npm install` pointing at `file:../..`. It stands
in for Storybook: each section mounts components with varied props, exercises
hooks live (SSE, toast, pagination) and acts as a visual test bench whenever you
touch styles or layout. If a component looks right in the gallery, it looks right
in consumer apps.

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

!!! tip "Run the root `npm run dev` in parallel"
    The gallery serves the SDK's `dist/`. To see SDK changes instantly, keep an
    `npm run dev` (vite build --watch) running at the root in one tab and the
    gallery's `npm run dev` in another — each rebuild reloads the page.

!!! note "Validate UI at both breakpoints"
    The gallery is where you check responsiveness: resize to ≤ 430px (mobile) and
    ≥ 1024px (desktop) before calling a visual change done. Stack/Grid/Modal/
    Drawer/Table all have responsive behavior here.

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

## Recap

- The gallery is a real Vite + React app that consumes the SDK via `file:../..` —
  it plays the role of Storybook.
- Run it with `npm run build` at the root, then `npm run dev` in
  `examples/gallery` (port `5173`).
- 9 sections cover components, hooks, theme/i18n, live integrations and utils.
- Use it to validate UI at the mobile and desktop breakpoints before closing out
  a visual change.

## See also

- [Gallery app README](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/README.md)
- [Architecture](./architecture.md)
- [Components](./components.md)
