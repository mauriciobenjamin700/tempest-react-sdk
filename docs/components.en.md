# UI Components

The catalogue is split by category to make navigation easier. Each file covers
props, examples, and accessibility notes.

➡️ **[Start with Data entry](./components/inputs.md)**

!!! tip "Icons by name"
    Need to render an icon whose name only exists at runtime (a menu from the API, a
    CMS field)? See [Icons by slug](./icons.md) — `<Icon name="save" />` covers all
    2024 lucide slugs without `DynamicIcon`'s chunk cost.

## Categories

- **[Data entry](./components/inputs.md)** — Input, Textarea, Select, Combobox, MultiSelect, Checkbox, Radio/RadioGroup, Switch, ChipInput, SearchBar, DatePicker, DateRangePicker, TimePicker, FileUpload, Dropzone, Slider, RangeSlider, RatingStars, PinInput, PasswordInput, StepperInput, Form\*, ImageCropper, SignaturePad
- **[Actions](./components/actions.md)** — Button, FloatingActionButton, Tooltip, DropdownMenu, Popover, ConfirmDialog, InstallButton, InstallBanner
- **[Navigation](./components/navigation.md)** — Navbar, AppBar, Sidebar, NavigationRail, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl
- **[Overlay](./components/overlay.md)** — Modal, Drawer, BottomSheet, ModalsManager, Lightbox
- **[Layout](./components/layout.md)** — AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show, Hide
- **[Data](./components/data.md)** — Table, VirtualList, VirtualTable, DataTable, ListTile, Accordion, Timeline, TreeView, Sparkline
- **[Status & feedback](./components/feedback.md)** — Alert, Banner, Badge, Tag, Stat, Progress, NProgress, Spinner, Skeleton, RefreshIndicator, Toast, EmptyState, ErrorState, OfflineIndicator, SyncStatusBadge, UpdatePrompt
- **[Identity & micro](./components/identity.md)** — Avatar, AvatarGroup, Card, Kbd
- **[Utilities & headless](./components/utility.md)** — CopyButton, RelativeTime, Money, TruncateText, VisuallyHidden, Portal, ClickOutside, ConditionalWrapper, For, ErrorText, Image, DataList, DescriptionList, CodeBlock, QRCode
- **Overlays & advanced** — the components at parity with shadcn/ui, across five pages ([overview](./components/advanced.md)):
    - **[Essentials](./components/advanced-essentials.md)** — Toggle, ToggleGroup, Label, Collapsible, ContextMenu, HoverCard, Command
    - **[Layout & UX](./components/advanced-layout.md)** — ScrollArea, Resizable, Calendar, Scheduler
    - **[Navigation & content](./components/advanced-navigation.md)** — NavigationMenu, Menubar, Carousel
    - **[Data](./components/advanced-data.md)** — DataTable, Wizard, Markdown, Masonry, Tour, Transfer, FilterBar, Kanban
    - **[Chat](./components/advanced-chat.md)** — Chat, AIChat

## Global conventions

- **CSS Modules** with the `tempest_` prefix — no collision with the app's styles.
- **`className` prop** always available for local customization.
- **CSS tokens** (`--tempest-*`) — customize via root, not by copy-pasting CSS.
- **Forward ref** on inputs / textarea / select / buttons — works with `react-hook-form`.
- **A11y baseline** — `aria-invalid` on error, `aria-label` on close buttons, `aria-current="page"` on nav, focus trap in Modal/Drawer/BottomSheet.
- **Mobile-aware** — Navbar/BottomNavigation/BottomSheet/Toast/Modal.fullscreen apply `env(safe-area-inset-*)`.
- **Responsive props** — `Stack.direction`, `Grid.columns`, `Form.layout` accept `ResponsiveValue<T>` (`{ base, sm, md, lg, xl }`).

## See also

- [Theme + CSS tokens](./styles.md)
- [Forms (zod + Form layout + masked BR inputs)](./forms.md)
- [Hooks](./hooks.md)
- [Testing helpers (subpath)](./testing.md)
- [Root README](https://github.com/mauriciobenjamin700/tempest-react-sdk#readme)
- [Gallery (demo)](./gallery.md)
