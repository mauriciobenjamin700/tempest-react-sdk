# Componentes UI

Catálogo curto + convenções. Todos usam CSS Modules com prefix `tempest_`, então conflitos com seus estilos de app são impossíveis.

## Lista

### Entrada de dados

| Componente                                         | Para que                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Input`                                            | Texto. Forward ref, `label`, `helperText`, `error`, `leftIcon`/`rightIcon`, `size`.  |
| `Textarea`                                         | Multi-linha. Mesma API do Input.                                                     |
| `Select`                                           | `<select>` nativo. `options: SelectOption[]` ou `<option>` filhos.                   |
| `Combobox`                                         | Select com busca + filtro (keyboard nav).                                            |
| `Checkbox`                                         | Single + indeterminate state.                                                        |
| `Radio` / `RadioGroup`                             | Radio standalone ou agrupado com value único.                                        |
| `Switch`                                           | Toggle on/off.                                                                       |
| `ChipInput`                                        | Lista de tags com adição via Enter + dedup automático.                               |
| `SearchBar`                                        | Input de busca com clear button.                                                     |
| `DatePicker`                                       | Date input nativo + label/error.                                                     |
| `FileUpload`                                       | Drag-and-drop + click-to-upload com lista de arquivos.                               |
| `RangeSlider`                                      | Dual-thumb slider, clamp low ≤ high, format callback.                                |
| `RatingStars`                                      | Radio group de estrelas, sizes, readonly.                                            |
| `Form` / `FormSection` / `FormRow` / `FormActions` | Layout wrapper com variantes (`stack`/`inline`/`grid`). Veja [forms.md](./forms.md). |
| `FormField`                                        | Wrapper RHF `Controller` + zod auto, injeta `value/onChange/error/label` no filho.   |

### Ação

| Componente      | Para que                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | `variant: primary/secondary/success/danger/soft/outline/ghost/link`, `size: xs/sm/md/lg/xl`, `loading`, `iconOnly`, `pill`, `leftIcon`/`rightIcon`. |
| `ConfirmDialog` | Prompt destrutivo. Composto de Modal + Button.                                                                                                      |
| `Tooltip`       | Hover tooltip com `placement`, `delay`.                                                                                                             |
| `DropdownMenu`  | Menu suspenso de ações. Entries `item`/`separator`/`label`, keyboard nav.                                                                           |
| `Popover`       | Painel flutuante genérico (anchor + outside-click + Esc dismiss).                                                                                   |

### Navegação

| Componente         | Para que                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `Navbar`           | App bar superior (logo / nav / actions slots). Sticky default, tones `surface/primary/transparent`. |
| `Sidebar`          | Side nav desktop. `items: SidebarItem[]`, `collapsed`, slots `header`/`footer`.                     |
| `BottomNavigation` | Tab bar fixa no rodapé pra mobile. `items` 3-5, `value` + `onChange`, badges, safe-area padding.    |
| `Tabs`             | Tabs controlled/uncontrolled. Fade-edge mask em overflow horizontal.                                |
| `Stepper`          | Wizard linear com steps numerados.                                                                  |
| `Breadcrumbs`      | Navegação hierárquica.                                                                              |
| `Pagination`       | Numeric com siblings + `pageSize` opcional.                                                         |

### Overlay

| Componente      | Para que                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `Modal`         | Portal + backdrop + Esc. `size: sm/md/lg/xl/2xl/3xl`, `fullscreen`, `fullscreenOnMobile`. |
| `Drawer`        | Side drawer com `placement: left/right/top/bottom`, `mobilePlacement` auto-switch.        |
| `BottomSheet`   | Slide-up modal mobile com drag handle, safe-area, `dismissOnBackdrop/Esc`.                |
| `ConfirmDialog` | Confirmação destrutiva pré-montada.                                                       |

### Layout

| Componente          | Para que                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `AppShell`          | Composer: `navbar` + `sidebar` + `main` + `bottomNav` + `footer` responsivo.              |
| `Page`              | Page wrapper com `title`/`eyebrow`/`description`/`actions`/`toolbar`/`footer` slots.      |
| `Container`         | Max-width wrapper. `size: sm/md/lg/xl/full`.                                              |
| `Stack`             | Flex vertical/horizontal com `gap`, `align`, `justify`, `wrap`. Aceita `ResponsiveValue`. |
| `Grid`              | CSS Grid wrapper. `columns: number \| string` (aceita `ResponsiveValue`), `gap`.          |
| `Divider`           | Separador. `orientation`, `variant: solid/dashed/dotted`, label inline com `align`.       |
| `Spacer`            | Flex push (`axis="both\|x\|y"`).                                                          |
| `Center`            | Centraliza children (`axis="both\|horizontal\|vertical"` + `minHeight`).                  |
| `AspectRatio`       | Preserva proporção pra media (`ratio={16/9}` default).                                    |
| `SafeArea`          | `env(safe-area-inset-*)` padding por edge (top/right/bottom/left).                        |
| `<Show>` / `<Hide>` | Conditional render por breakpoint (`above`/`below`/`only`). SSR-safe.                     |

### Dados

| Componente    | Para que                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Table<T>`    | `columns: TableColumn<T>[]`, `data`, `rowKey`, `onRowClick`. `priority="tablet\|desktop"` esconde por viewport, `stackOnMobile` rows → cards. |
| `VirtualList` | Virtualização para listas grandes — overscan + dynamic row height via ResizeObserver.                                                         |
| `Accordion`   | Single/multiple mode, controlled/uncontrolled.                                                                                                |

### Status & feedback

| Componente   | Para que                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Alert`      | Banner inline. `variant: neutral/info/success/warning/danger`, `appearance: soft/solid/outline`, icon + dismiss. |
| `Banner`     | Banner persistente no topo da página. Variants + dismissible + action slot.                                      |
| `Badge`      | Status pill. `variant`, `appearance: soft/solid/outline`, `shape: pill/square`, `dot`, sizes `sm/md/lg`.         |
| `Tag`        | Chip removível pra filtros aplicados. `variant`, `size`, `onRemove`.                                             |
| `Stat`       | KPI card. `label`, `value`, `delta` (trend up/down inferido), `hint`, `icon`.                                    |
| `Progress`   | Barra de progresso. `variant: primary/success/danger`.                                                           |
| `Spinner`    | Loader simples. Sizes `xs`/`sm`/`md`/`lg`/`xl`.                                                                  |
| `Skeleton`   | Placeholder com shimmer. `variant: rect/text/circle`.                                                            |
| `Toast`      | `ToastProvider` + `useToast()`. Variants: success/warning/error/info. `position` 6-corner. Safe-area aware.      |
| `EmptyState` | "Nada por aqui" centralizado.                                                                                    |
| `ErrorState` | Falha com retry.                                                                                                 |

### Texto inline / micro

| Componente | Para que                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| `Kbd`      | `<kbd>` styled pra atalhos. `size: sm/md/lg`. Compose: `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`. |

### Identidade

| Componente | Para que                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `Avatar`   | Foto de usuário com `size: sm/md/lg`, `status` (online).                                             |
| `Card`     | Container com `title` + `actions`. `elevation: flat/default/raised/elevated`, `interactive`, footer. |

## OAuth (subpath: import from root)

| Export             | Para que                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GoogleSignIn`     | Wrapper sobre `@react-oauth/google`'s `<GoogleLogin>`. Normaliza onSuccess → `OAuthCredential`, onError → `OAuthError`. SDK não inclui Google. |
| `useOAuthCallback` | Hook pra `/callback` route — exchange one-shot com `loading/data/error/status`. StrictMode-safe.                                               |

## Testing helpers (subpath `tempest-react-sdk/testing`)

| Export               | Para que                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `createMockHandlers` | Factory MSW-shaped (`{ method, path, status, body, headers, delayMs }`). MSW peer não declarado. |

## Convenções

- **Forward ref** em inputs/textarea/select pra integrar com form libs (`react-hook-form`).
- **`className` prop** sempre disponível pra customização local. Cuidado: o prefix `tempest_` evita colisão, mas seu `.module.css` ganha precedência.
- **Acessibilidade baseline** — `aria-invalid` em campos com erro, `aria-label` em close buttons, `aria-current="page"` na paginação, focus trap em Modal/Drawer/BottomSheet.
- **Tokens CSS** (`var(--tempest-*)`) — customize cor/raio/sombra alterando o root, não copiando o CSS. Veja [styles.md](./styles.md).
- **Loading state** em ações destrutivas e submits — `<Button loading>` desabilita + mostra spinner.
- **Error/helper text** — `Input` / `Textarea` / `Select` aceitam `error` (string) e `helperText` (string). `error` toma precedência e adiciona `aria-invalid="true"`.
- **Mobile/desktop responsivos** — `Stack.direction`, `Grid.columns`, `Form.layout` aceitam `ResponsiveValue<T>` (`{ base, sm, md, lg, xl }`). `<Show above="md">` / `<Hide below="md">` controlam render.
- **Safe-area aware** — `Navbar`, `BottomNavigation`, `BottomSheet`, `Toast`, `Modal.fullscreen` aplicam `env(safe-area-inset-*)` automaticamente. Use `<SafeArea>` em wrappers customizados.

## Veja também

- [Tema + tokens CSS](./styles.md)
- [Forms](./forms.md) — Form layout + zod integration
- [README raiz](../README.md) — exemplos por recipe
- [Gallery](./gallery.md) — demo visual interativa
