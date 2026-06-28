# UI Components

The catalogue is split by category to make navigation easier. Each file covers
props, examples, and accessibility notes.

➡️ **[Start with Data entry](./components/inputs.md)**

## Categories

- **[Data entry](./components/inputs.md)** — Input, Textarea, Select, Combobox, MultiSelect, Checkbox, Radio, Switch, ChipInput, SearchBar, DatePicker, DateRangePicker, FileUpload, Slider, RangeSlider, RatingStars, PinInput, PasswordInput, StepperInput, Form\*
- **[Actions](./components/actions.md)** — Button, Tooltip, DropdownMenu, Popover, ConfirmDialog
- **[Navigation](./components/navigation.md)** — Navbar, Sidebar, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl
- **[Overlay](./components/overlay.md)** — Modal, Drawer, BottomSheet
- **[Layout](./components/layout.md)** — AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show, Hide
- **[Status & feedback](./components/feedback.md)** — Alert, Banner, Badge, Tag, Stat, Progress, Spinner, Skeleton, Toast, EmptyState, ErrorState
- **[Identity & micro](./components/identity.md)** — Avatar, Card, Kbd

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
