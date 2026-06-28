# Componentes UI

O catálogo foi dividido por categoria para facilitar navegação. Cada arquivo cobre props, exemplos e notas de acessibilidade.

➡️ **[Começar pela Entrada de dados](./components/inputs.md)**

## Categorias

- **[Entrada de dados](./components/inputs.md)** — Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, ChipInput, SearchBar, DatePicker, TimePicker, FileUpload, RangeSlider, RatingStars, PinInput, PasswordInput, StepperInput, Form\*
- **[Ação](./components/actions.md)** — Button, FloatingActionButton, Tooltip, DropdownMenu, Popover, ConfirmDialog
- **[Navegação](./components/navigation.md)** — Navbar, Sidebar, NavigationRail, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl
- **[Overlay](./components/overlay.md)** — Modal, Drawer, BottomSheet
- **[Layout](./components/layout.md)** — AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show, Hide
- **[Dados](./components/data.md)** — Table, VirtualList, ListTile, Accordion, Timeline
- **[Status & feedback](./components/feedback.md)** — Alert, Banner, Badge, Tag, Stat, Progress, Spinner, Skeleton, RefreshIndicator, Toast, EmptyState, ErrorState
- **[Identidade & micro](./components/identity.md)** — Avatar, Card, Kbd

## Convenções globais

- **CSS Modules** com prefix `tempest_` — não colide com estilos do app.
- **`className` prop** sempre disponível para customização local.
- **Tokens CSS** (`--tempest-*`) — customize via root, não via copy-paste de CSS.
- **Forward ref** em inputs / textarea / select / botões — funciona com `react-hook-form`.
- **A11y baseline** — `aria-invalid` em erro, `aria-label` em close buttons, `aria-current="page"` em nav, focus trap em Modal/Drawer/BottomSheet.
- **Mobile-aware** — Navbar/BottomNavigation/BottomSheet/Toast/Modal.fullscreen aplicam `env(safe-area-inset-*)`.
- **Responsive props** — `Stack.direction`, `Grid.columns`, `Form.layout` aceitam `ResponsiveValue<T>` (`{ base, sm, md, lg, xl }`).

## Veja também

- [Tema + tokens CSS](./styles.md)
- [Forms (zod + Form layout + masked inputs BR)](./forms.md)
- [Hooks](./hooks.md)
- [Testing helpers (subpath)](./testing.md)
- [README raiz](https://github.com/mauriciobenjamin700/tempest-react-sdk#readme)
- [Gallery (demo)](./gallery.md)
