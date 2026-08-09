# Componentes UI

O catálogo foi dividido por categoria para facilitar navegação. Cada arquivo cobre props, exemplos e notas de acessibilidade.

➡️ **[Começar pela Entrada de dados](./components/inputs.md)**

!!! tip "Ícone por nome"
    Precisa renderizar um ícone cujo nome só existe em runtime (menu vindo da API,
    campo de CMS)? Veja [Ícones por slug](./icons.md) — `<Icon name="save" />` cobre
    os 2024 slugs do lucide sem o custo de chunk do `DynamicIcon`.

## Categorias

- **[Entrada de dados](./components/inputs.md)** — Input, Textarea, Select, Combobox, MultiSelect, Checkbox, Radio/RadioGroup, Switch, ChipInput, SearchBar, DatePicker, DateRangePicker, TimePicker, FileUpload, Dropzone, Slider, RangeSlider, RatingStars, PinInput, PasswordInput, StepperInput, Form\*, ImageCropper, SignaturePad
- **[Ação](./components/actions.md)** — Button, FloatingActionButton, Tooltip, DropdownMenu, Popover, ConfirmDialog, InstallButton, InstallBanner
- **[Navegação](./components/navigation.md)** — Navbar, AppBar, Sidebar, NavigationRail, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl
- **[Overlay](./components/overlay.md)** — Modal, Drawer, BottomSheet, ModalsManager, Lightbox
- **[Layout](./components/layout.md)** — AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show, Hide
- **[Dados](./components/data.md)** — Table, VirtualList, VirtualTable, DataTable, ListTile, Accordion, Timeline, TreeView, Sparkline
- **[Status & feedback](./components/feedback.md)** — Alert, Banner, Badge, Tag, Stat, Progress, NProgress, Spinner, Skeleton, RefreshIndicator, Toast, EmptyState, ErrorState, OfflineIndicator, SyncStatusBadge, UpdatePrompt
- **[Identidade & micro](./components/identity.md)** — Avatar, AvatarGroup, Card, Kbd
- **[Utilitários & headless](./components/utility.md)** — CopyButton, RelativeTime, Money, TruncateText, VisuallyHidden, Portal, ClickOutside, ConditionalWrapper, For, ErrorText, Image, DataList, DescriptionList, CodeBlock, QRCode
- **[Overlays & avançados](./components/advanced.md)** — Toggle, ToggleGroup, Label, Collapsible, ContextMenu, HoverCard, Command, ScrollArea, Resizable, Calendar, Scheduler, NavigationMenu, Menubar, Carousel, Wizard, Markdown, Masonry, Tour, Transfer, FilterBar, Chat, AIChat, Kanban

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
