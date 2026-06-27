# Gallery — catálogo visual + funcional

Demo interativo de todos os componentes e features do SDK. Roda como app Vite + React em [`examples/gallery`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery).

## O que é a gallery?

A gallery é um app Vite + React **real** que consome o SDK exatamente como um app
de produção faria — via `npm install` apontando para `file:../..`. Ela substitui
o Storybook: cada seção monta componentes com props variadas, exercita hooks ao
vivo (SSE, toast, paginação) e serve como banco de provas visual quando você
mexe em estilos ou layout. Se um componente parece certo na gallery, parece certo
nos apps consumidores.

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

!!! tip "Rode `npm run dev` na raiz em paralelo"
    A gallery serve o `dist/` do SDK. Para ver mudanças no SDK na hora, deixe um
    `npm run dev` (vite build --watch) rodando na raiz numa aba e o
    `npm run dev` da gallery em outra — cada rebuild recarrega a página.

!!! note "Valide UI nos dois breakpoints"
    A gallery é o lugar pra conferir responsividade: redimensione para ≤ 430px
    (mobile) e ≥ 1024px (desktop) antes de dar uma mudança visual como pronta.
    Stack/Grid/Modal/Drawer/Table todos têm comportamento responsivo aqui.

## Seções

Cada seção é um arquivo em [`examples/gallery/src/sections/`](https://github.com/mauriciobenjamin700/tempest-react-sdk/tree/main/examples/gallery/src/sections) e cada exemplo é embrulhado pelo wrapper [`<Example>`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/Example.tsx) (demo + código + botão copiar).

| #   | Seção                                  | Componentes / Features                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Buttons                                | `Button` (variantes, tamanhos, loading, fullWidth)                               |
| 2   | Form fields                            | `Input`, `Select`, `Textarea`, `SearchBar`                                        |
| 3   | Checkbox · Radio · Switch              | `Checkbox`, `RadioGroup`, `Switch`                                                |
| 4   | Toggle · Rating · Range · Combobox     | `Toggle`, `ToggleGroup`, `RatingStars`, `RangeSlider`, `Combobox`, `Label`       |
| 5   | Feedback                               | `Badge`, `Card`, `Spinner`, `Skeleton`                                            |
| 6   | Stat · Tag · Money · Banner            | `Stat`, `Tag`, `Banner`, `Money`, `RelativeTime`, `TruncateText`, `DataList`, `DescriptionList`, `CopyButton` |
| 7   | Avatar · Image · Carousel              | `Avatar`, `Image` (fallback), `AspectRatio`, `Carousel`                          |
| 8   | Modal & Toast                          | `Modal`, `ConfirmDialog`, `ToastProvider`, `useToast`                            |
| 9   | Overlays                               | `Popover`, `DropdownMenu`, `HoverCard`, `ContextMenu`, `Menubar`, `Command` (⌘K) |
| 10  | Disclosure                             | `Accordion`, `Collapsible`, `ScrollArea`                                          |
| 11  | Navigation                             | `Breadcrumbs`, `Tabs`, `Tooltip`, `Drawer`                                        |
| 12  | Stepper · Progress · VirtualList       | `Stepper`, `Progress`, `ChipInput`, `FileUpload`, `VirtualList`                   |
| 13  | Table & Pagination                     | `Table`, `Pagination`, `EmptyState`, `ErrorState`, `usePagination`               |
| 14  | DataTable                              | `DataTable` (busca, ordenação, paginação client-side)                            |
| 15  | Forms (zod)                            | `useZodForm`, `zodResolver`                                                       |
| 16  | BR Forms                               | `CPFInput`, `CNPJInput`, `PhoneInput`, `MoneyInput`, `CEPInput`, `useViaCEP`     |
| 17  | Store (Zustand)                        | `createStore`, `createSelectors` (contador persistido)                           |
| 18  | Tema + i18n                            | `ThemeProvider`, `useTheme`, `I18nProvider`, `useI18n`                           |
| 19  | Network · Clipboard · Share            | `useOnline`, `useClipboard`, `share`, `useKeyboardShortcut`, `useIntersectionObserver` |
| 20  | SSE · Push · Audio                     | `useEventStream` (SSE vivo), `isPushSupported`, `playAudio`                      |
| 21  | PWA: Install · Push                    | `useBeforeInstallPrompt`, `usePushSubscription`, `isPushSupported`               |
| 22  | Utils                                  | `formatCurrency`, `formatDate`, `formatPhone`, `formatCPF`, `formatPercent`      |

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

Cada exemplo aparece **lado a lado com o código-fonte** (botão "Copiar"), então a
gallery é também uma referência copia-e-cola. Capturas do app rodando:

### Visão geral

![Visão geral da gallery](assets/gallery/gallery-overview.png)

### Avatar · Image · AspectRatio · Carousel

![Componentes de mídia](assets/gallery/gallery-display-media.png)

### Stat · Tag · Banner · Money · listas

![Componentes de dados](assets/gallery/gallery-data-display.png)

### Toggle · Rating · Range · Combobox · Calendar

![Inputs avançados](assets/gallery/gallery-inputs-advanced.png)

### Popover · Dropdown · HoverCard · ContextMenu · Menubar · Command

![Overlays](assets/gallery/gallery-overlays.png)

### DataTable

![DataTable com busca, ordenação e paginação](assets/gallery/gallery-data-table.png)

### Store (Zustand): createStore + createSelectors

![Foundation / store](assets/gallery/gallery-foundation.png)

### PWA: install prompt + web push

![PWA](assets/gallery/gallery-pwa.png)

## Resumo

- A gallery é um app Vite + React real que consome o SDK via `file:../..` — faz
  o papel de Storybook.
- Rode com `npm run build` na raiz, depois `npm run dev` em `examples/gallery`
  (porta `5173`).
- 22 seções cobrem componentes, overlays, mídia/imagens, inputs avançados,
  DataTable, store, tema/i18n, integrações ao vivo, PWA e utils — cada exemplo
  com código copia-e-cola ao lado.
- Use-a pra validar UI nos breakpoints mobile e desktop antes de fechar uma
  mudança visual.

## Veja também

- [README do app gallery](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/README.md)
- [Arquitetura](./architecture.md)
- [Componentes](./components.md)
