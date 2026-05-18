# Componentes UI — índice

Catálogo completo dividido por categoria. Cada arquivo cobre: assinatura TypeScript, tabela de props, exemplos curtos, notas de acessibilidade, ressalvas.

Convenções globais (válidas para todos):

- **CSS Modules** com prefix `tempest_` — não colide com estilos do app.
- **`className` prop** sempre disponível para customização local.
- **Tokens CSS** (`--tempest-*`) — customize via root, não via copy-paste de CSS.
- **Forward ref** em inputs / textarea / select / botões — funciona com `react-hook-form`, focus management externo.
- **A11y baseline** — `aria-invalid` em erro, `aria-label` em close buttons, `aria-current="page"` em nav, focus trap em Modal/Drawer/BottomSheet.
- **Mobile-aware** — Navbar/BottomNavigation/BottomSheet/Toast/Modal.fullscreen aplicam `env(safe-area-inset-*)`.
- **Responsive props** — `Stack.direction`, `Grid.columns`, `Form.layout` aceitam `ResponsiveValue<T>` (`{ base, sm, md, lg, xl }`).

## Categorias

| Categoria          | Arquivo                          | Componentes                                                                                                                                                                                                                               |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada de dados   | [inputs.md](./inputs.md)         | Input, Textarea, Select, Combobox, Checkbox, Radio, RadioGroup, Switch, ChipInput, SearchBar, DatePicker, FileUpload, RangeSlider, RatingStars, PinInput, PasswordInput, StepperInput, Form, FormSection, FormRow, FormActions, FormField |
| Ação               | [actions.md](./actions.md)       | Button, Tooltip, DropdownMenu, Popover, ConfirmDialog                                                                                                                                                                                     |
| Navegação          | [navigation.md](./navigation.md) | Navbar, Sidebar, BottomNavigation, Tabs, Stepper, Breadcrumbs, Pagination, SegmentedControl                                                                                                                                               |
| Overlay            | [overlay.md](./overlay.md)       | Modal, Drawer, BottomSheet                                                                                                                                                                                                                |
| Layout             | [layout.md](./layout.md)         | AppShell, Page, Container, Stack, Grid, Divider, Spacer, Center, AspectRatio, SafeArea, Show, Hide                                                                                                                                        |
| Dados              | [data.md](./data.md)             | Table, VirtualList, Accordion, Timeline                                                                                                                                                                                                   |
| Status & feedback  | [feedback.md](./feedback.md)     | Alert, Banner, Badge, Tag, Stat, Progress, Spinner, Skeleton, Toast, EmptyState, ErrorState                                                                                                                                               |
| Identidade & micro | [identity.md](./identity.md)     | Avatar, Card, Kbd                                                                                                                                                                                                                         |

## Subpath modules

| Subpath                     | Documento                      | O que contém                              |
| --------------------------- | ------------------------------ | ----------------------------------------- |
| `tempest-react-sdk/testing` | [../testing.md](../testing.md) | `createMockHandlers` (factory MSW-shaped) |

## Veja também

- [Tema + tokens CSS](../styles.md)
- [Forms (zod + Form layout + masked inputs BR)](../forms.md)
- [Hooks](../hooks.md)
- [README raiz](../../README.md)
- [Gallery (demo)](../gallery.md)
