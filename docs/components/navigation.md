# Navegação

Top bars, side navs, bottom nav, tabs, breadcrumbs, paginação, segmented control.

## O que é esta categoria

Componentes que ajudam o usuário a **se localizar e se mover** pelo app. Eles se dividem por escopo:

- **Navegação primária** (entre seções do app): `Navbar` (topo), `Sidebar` (lateral desktop), `BottomNavigation` (rodapé mobile) — tipicamente os três slots de um `AppShell`.
- **Navegação local** (dentro de uma tela): `Tabs`, `SegmentedControl`, `Stepper`.
- **Orientação e travessia**: `Breadcrumbs` (onde estou) e `Pagination` (próxima/anterior em listas).

**Quando usar:** escolha pelo escopo — não use `Tabs` para navegar entre rotas de nível superior (isso é `Navbar`/`Sidebar`), nem `Navbar` para alternar visões de uma mesma tela (isso é `Tabs`/`SegmentedControl`).

!!! tip "Padrão responsivo Sidebar + BottomNavigation"
    A combinação idiomática: `Sidebar` dentro de `<Show above="md">` no desktop e `BottomNavigation` dentro de `<Hide above="md">` no mobile, ambos compartilhando o mesmo `value`/`onChange`. O `AppShell` já faz essa troca automaticamente quando você passa os dois slots.

## `Navbar`

**Quando usar:** barra superior persistente com marca + ações globais (busca, avatar, notificações). É a navegação de mais alto nível.

App bar superior. Três slots (`logo` / `nav` / `actions`). Sticky por padrão.

```tsx
<Navbar
  logo={<img src="/logo.svg" alt="App" />}
  nav={
    <>
      <NavLink to="/orders">Pedidos</NavLink>
      <NavLink to="/products">Produtos</NavLink>
    </>
  }
  actions={
    <>
      <Button variant="ghost" iconOnly aria-label="Buscar">
        <Search />
      </Button>
      <Avatar src={user.photo} />
    </>
  }
/>
```

| Prop       | Tipo                                      | Default     |
| ---------- | ----------------------------------------- | ----------- |
| `logo`     | `ReactNode`                               | —           |
| `nav`      | `ReactNode`                               | —           |
| `actions`  | `ReactNode`                               | —           |
| `sticky`   | `boolean`                                 | `true`      |
| `tone`     | `"surface" \| "primary" \| "transparent"` | `"surface"` |
| `bordered` | `boolean`                                 | `true`      |

**Safe-area**: aplica `padding-top: max(space-3, env(safe-area-inset-top))` automático.

## `AppBar`

**Quando usar:** app bar **mobile-first de PWA** — o padrão "voltar + título + ação" que toda tela de detalhe repete. Use `AppBar` em apps mobile/PWA; use `Navbar` quando precisar do nav horizontal de desktop (três slots).

Layout em grade: slot **leading** (botão voltar + marca) · **título** (`<h1>`) · **actions** (à direita). Sticky + safe-area por padrão. O botão voltar é acessível e, sem `onBack`, cai em `window.history.back()` — com router, passe `onBack={() => navigate(-1)}`.

```tsx
// Tela de detalhe: voltar + ação
<AppBar
  title="Perfil"
  showBack
  onBack={() => navigate(-1)}
  actions={
    <Button variant="ghost" iconOnly aria-label="Ajustes" onClick={openSettings}>
      <Settings />
    </Button>
  }
/>

// Tela inicial: marca à esquerda, sem voltar
<AppBar brand="Famachapp" actions={<Avatar src={user.photo} />} />

// Título centralizado (estilo iOS)
<AppBar title="Histórico" showBack centered />
```

| Prop        | Tipo                                      | Default     |
| ----------- | ----------------------------------------- | ----------- |
| `title`     | `ReactNode`                               | —           |
| `leading`   | `ReactNode` (substitui voltar + marca)    | —           |
| `showBack`  | `boolean`                                 | `false`     |
| `onBack`    | `() => void`                              | `history.back()` |
| `backLabel` | `string` (aria-label do botão)            | `"Go back"` |
| `backIcon`  | `ReactNode`                               | seta ←      |
| `brand`     | `ReactNode`                               | —           |
| `actions`   | `ReactNode`                               | —           |
| `centered`  | `boolean`                                 | `false`     |
| `sticky`    | `boolean`                                 | `true`      |
| `tone`      | `"surface" \| "primary" \| "transparent"` | `"surface"` |
| `bordered`  | `boolean`                                 | `true`      |
| `safeArea`  | `boolean`                                 | `true`      |

!!! tip "Customização visual"
    O SDK entrega só o layout + comportamento. Cor, altura e tipografia saem dos tokens `--tempest-*` (sobrescreva no `:root`). Para um ícone/menu customizado no lado direito, passe qualquer node em `actions`; para substituir o lado esquerdo inteiro (ex.: avatar no lugar do voltar), use `leading`.

## `Sidebar`

Side nav desktop. `items: SidebarItem[]`, slots `header`/`footer`, modo `collapsed` (apenas ícones).

```tsx
const [tab, setTab] = useState("home");
const [collapsed, setCollapsed] = useState(false);

<Sidebar
  header={<Brand collapsed={collapsed} />}
  items={[
    { key: "home", label: "Início", icon: <Home /> },
    { key: "orders", label: "Pedidos", icon: <Package />, badge: 3 },
    { key: "settings", label: "Ajustes", icon: <Cog /> },
  ]}
  value={tab}
  onChange={setTab}
  footer={<Button onClick={() => setCollapsed(!collapsed)}>Colapsar</Button>}
  collapsed={collapsed}
  width={240}
  collapsedWidth={64}
/>;
```

| Prop             | Tipo                           | Default |
| ---------------- | ------------------------------ | ------- |
| `header`         | `ReactNode`                    | —       |
| `items`          | `SidebarItem[]`                | —       |
| `value`          | `string`                       | —       |
| `onChange`       | `(key: string) => void`        | —       |
| `footer`         | `ReactNode`                    | —       |
| `collapsed`      | `boolean`                      | `false` |
| `width`          | `number \| string` (px ou CSS) | `240`   |
| `collapsedWidth` | `number \| string`             | `64`    |

Tipo `SidebarItem = { key, label, icon?, badge?, disabled?, href? }`.

**Mobile**: esconda com `<Show above="md">` e exponha via `<Drawer>` no menu hambúrguer.

## `NavigationRail`

**Quando usar:** coluna de navegação vertical e compacta para desktop/tablet — uma alternativa mais estreita à `Sidebar` quando você só precisa de ícones empilhados sobre rótulos curtos. Cada item empilha ícone sobre o label; o ativo recebe `aria-current="page"`.

`items: NavigationRailItem[]`, slots `header`/`footer` e controle de rótulos via `labelVisibility`.

```tsx
import { useState } from "react";
import { NavigationRail, FloatingActionButton } from "tempest-react-sdk";
import { Home, Inbox, Settings, Plus } from "lucide-react";

function AppRail() {
  const [tab, setTab] = useState("home");

  return (
    <NavigationRail
      header={<FloatingActionButton icon={<Plus />} aria-label="Novo" position="none" />}
      items={[
        { key: "home", label: "Início", icon: <Home /> },
        { key: "inbox", label: "Caixa", icon: <Inbox />, badge: 3 },
        { key: "settings", label: "Ajustes", icon: <Settings /> },
      ]}
      value={tab}
      onChange={setTab}
      labelVisibility="all"
    />
  );
}
```

| Prop              | Tipo                              | Default |
| ----------------- | --------------------------------- | ------- |
| `items`           | `NavigationRailItem[]`            | —       |
| `value`           | `string` (key selecionada)        | —       |
| `onChange`        | `(key: string) => void`           | —       |
| `header`          | `ReactNode` (topo — ex.: FAB)     | —       |
| `footer`          | `ReactNode` (rodapé)              | —       |
| `labelVisibility` | `"all" \| "selected" \| "none"`   | `"all"` |

Tipo `NavigationRailItem = { key, label, icon?, badge?, disabled? }`.

!!! tip "`labelVisibility` controla a densidade"
    Use `"selected"` para mostrar só o rótulo do item ativo (rail mais estreito) ou `"none"` para um rail puramente de ícones. Em telas pequenas prefira a `BottomNavigation`.

## `BottomNavigation`

Tab bar fixa no rodapé pra mobile. 3-5 items.

```tsx
<Show below="md">
  <BottomNavigation
    items={[
      { key: "home", label: "Início", icon: <Home /> },
      { key: "search", label: "Buscar", icon: <Search /> },
      { key: "cart", label: "Carrinho", icon: <Cart />, badge: cartCount },
      { key: "profile", label: "Perfil", icon: <User /> },
    ]}
    value={tab}
    onChange={setTab}
  />
</Show>
```

| Prop         | Tipo                           | Default |
| ------------ | ------------------------------ | ------- |
| `items`      | `BottomNavigationItem[]` (3–5) | —       |
| `value`      | `string`                       | —       |
| `onChange`   | `(key: string) => void`        | —       |
| `showLabels` | `boolean`                      | `true`  |

Tipo `BottomNavigationItem = { key, label, icon?, badge?, disabled? }`.

**Safe-area**: aplica `padding-bottom: env(safe-area-inset-bottom)` automático.

## `Tabs`

**Quando usar:** alternar entre painéis de conteúdo **dentro de uma mesma tela** (visão geral / detalhes / logs). Não use para navegar entre rotas.

Tabs controlled/uncontrolled. Fade-edge mask em overflow horizontal. Variantes visuais via `variant` (`"underline"` default ou `"pill"`).

```tsx
<Tabs
  value={tab}
  onChange={setTab}
  items={[
    { key: "overview", label: "Visão geral", content: <Overview /> },
    { key: "details", label: "Detalhes", content: <Details /> },
    { key: "logs", label: "Logs", content: <Logs /> },
  ]}
/>
```

| Prop           | Tipo                    | Default |
| -------------- | ----------------------- | ------- |
| `items`        | `TabItem[]`             | —       |
| `value`        | `string` (controlled)   | —       |
| `defaultValue` | `string` (uncontrolled) | —       |
| `onChange`     | `(key: string) => void` | —       |

## `Stepper`

**Quando usar:** mostrar progresso em um fluxo linear de múltiplas etapas (checkout, onboarding, wizard). É indicador de progresso, não um seletor — controle o `current` pela lógica do fluxo.

Wizard linear com steps numerados. `orientation` aceita `"horizontal"` (default) ou `"vertical"`.

```tsx
<Stepper
  current={step}
  steps={[
    { key: "info", label: "Informações" },
    { key: "payment", label: "Pagamento" },
    { key: "review", label: "Revisão" },
  ]}
/>
```

## `Breadcrumbs`

**Quando usar:** sinalizar a posição em uma hierarquia profunda (Home › Pedidos › #12345) e permitir voltar a níveis anteriores. Dispensável em apps de 1-2 níveis.

Navegação hierárquica.

```tsx
<Breadcrumbs
  items={[{ label: "Home", href: "/" }, { label: "Pedidos", href: "/orders" }, { label: "#12345" }]}
/>
```

**A11y**: último item é marcado com `aria-current="page"`.

## `Pagination`

**Quando usar:** percorrer listas grandes em páginas discretas (resultados de busca, tabelas). Para feeds contínuos, prefira scroll infinito (`VirtualList` + `usePoll`/Query).

Numeric com siblings + page-size opcional.

!!! note "`page` é 1-indexed, `total` é contagem de itens"
    `total` é o número **de itens** (não de páginas) — o componente calcula as páginas a partir de `pageSize`. Lembre de resetar `page` para `1` quando o filtro muda, senão você pode parar numa página que não existe mais.

```tsx
<Pagination
  page={page}
  pageSize={size}
  total={data?.total ?? 0}
  onPageChange={setPage}
  onPageSizeChange={setSize}
  siblings={1}
/>
```

| Prop               | Tipo                     | Default |
| ------------------ | ------------------------ | ------- |
| `page`             | `number` (1-indexed)     | —       |
| `pageSize`         | `number`                 | —       |
| `total`            | `number` (item count)    | —       |
| `onPageChange`     | `(page: number) => void` | —       |
| `onPageSizeChange` | `(size: number) => void` | —       |
| `siblings`         | `number` (vizinhos)      | `1`     |

## `SegmentedControl`

**Quando usar:** alternar entre 2-5 visões mutuamente exclusivas da mesma tela (lista/grade/mapa). É mais compacto que `Tabs` e não tem painéis de conteúdo embutidos — você troca a view manualmente pelo `value`.

iOS-style pill bar (2-5 opções).

```tsx
<SegmentedControl
  value={view}
  onChange={setView}
  options={[
    { value: "list", label: "Lista", icon: <List /> },
    { value: "grid", label: "Grade", icon: <Grid /> },
    { value: "map", label: "Mapa", icon: <Map /> },
  ]}
  size="md"
  fullWidth
/>
```

| Prop        | Tipo                       | Default |
| ----------- | -------------------------- | ------- |
| `options`   | `SegmentedControlOption[]` | —       |
| `value`     | `string`                   | —       |
| `onChange`  | `(value: string) => void`  | —       |
| `size`      | `"sm" \| "md" \| "lg"`     | `"md"`  |
| `fullWidth` | `boolean`                  | `false` |

**A11y**: `role="radiogroup"` + `role="radio"` com `aria-checked`.

## A11y geral

- Navbar: use `<nav>` (já incluso); marque ativos com `aria-current="page"`.
- Sidebar/BottomNavigation: keyboard accessible — Tab cycle entre items.
- Tabs: setas ←→ trocam tab quando focada.
- Breadcrumbs: separador (`/`) é decorativo (aria-hidden).

!!! warning "Marque o item ativo com `aria-current`"
    Navbar/Sidebar/BottomNavigation precisam que o item da rota atual carregue `aria-current="page"` — sem isso, leitores de tela não anunciam onde o usuário está. `Breadcrumbs` já faz isso no último item automaticamente.

## Resumo

- Escolha pelo **escopo**: `Navbar`/`Sidebar`/`NavigationRail`/`BottomNavigation` para navegar entre seções; `Tabs`/`SegmentedControl`/`Stepper` para mover-se dentro de uma tela.
- O trio `Navbar` + `Sidebar` + `BottomNavigation` são os slots do `AppShell` — deixe ele orquestrar a troca desktop/mobile.
- `Pagination` para listas paginadas; `Breadcrumbs` para hierarquias profundas.
- Sempre marque o item ativo com `aria-current="page"` na navegação primária.

Páginas relacionadas:

- [Layout](./layout.md) — `AppShell` que compõe `Navbar`/`Sidebar`/`BottomNavigation` + `Page`.
- [Sobreposições](./overlay.md) — `Drawer` para expor a `Sidebar` no menu hambúrguer mobile.
- [Dados](./data.md) — `Table`/`DataTable` que usam `Pagination` no rodapé.
- [Roteamento](../routing.md) — `defineRoutes`/`<AppRouter>`/`<RouteGuard>` que ligam a navegação às rotas.
