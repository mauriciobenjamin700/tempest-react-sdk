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

<!-- gallery:nav-extra -->
[![Navbar · Sidebar · Bottom nav na gallery](../assets/gallery/nav-extra.webp)](../gallery.md)

*Seção `nav-extra` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

**Quando usar:** barra superior persistente com marca + ações globais (busca, avatar, notificações). É a navegação de mais alto nível.

App bar superior. Três slots (`logo` / `nav` / `actions`). Sticky por padrão.

```tsx
import { Avatar, Button, Navbar } from "tempest-react-sdk";
import { NavLink } from "react-router";
import { Search } from "lucide-react";

const user = { photo: "/avatars/ana.jpg" };

export function TopBar() {
    return (
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
                        <Search size={16} />
                    </Button>
                    <Avatar src={user.photo} />
                </>
            }
        />
    );
}
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

<!-- gallery:navigation -->
[![AppBar · Tabs · Tooltip · Drawer na gallery](../assets/gallery/navigation.webp)](../gallery.md)

*Seção `navigation` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

**Quando usar:** app bar **mobile-first de PWA** — o padrão "voltar + título + ação" que toda tela de detalhe repete. Use `AppBar` em apps mobile/PWA; use `Navbar` quando precisar do nav horizontal de desktop (três slots).

Layout em grade: slot **leading** (botão voltar + marca) · **título** (`<h1>`) · **actions** (à direita). Sticky + safe-area por padrão. O botão voltar é acessível e, sem `onBack`, cai em `window.history.back()` — com router, passe `onBack={() => navigate(-1)}`.

```tsx
import { AppBar, Avatar, Button } from "tempest-react-sdk";
import { Settings } from "lucide-react";

const user = { photo: "/avatars/ana.jpg" };

export function Barras({
    navigate,
    openSettings,
}: {
    navigate: (delta: number) => void;
    openSettings: () => void;
}) {
    return (
        <>
            <AppBar
                title="Perfil"
                showBack
                onBack={() => navigate(-1)}
                actions={
                    <Button variant="ghost" iconOnly aria-label="Ajustes" onClick={openSettings}>
                        <Settings size={16} />
                    </Button>
                }
            />

            <AppBar brand="Famachapp" actions={<Avatar src={user.photo} />} />

            <AppBar title="Histórico" showBack centered />
        </>
    );
}
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

!!! warning "A barra some ao rolar?"
    Quase nunca é a `AppBar` — é uma linha do CSS global do seu app:

    ```css
    /* ❌ o clamp horizontal que mata o sticky */
    body {
        overflow-x: hidden;
    }

    /* ✅ clampa igual, sem virar scroll container */
    html,
    body {
        overflow-x: clip;
    }
    ```

    `overflow-x: hidden` no `body` força o `overflow-y` computado a virar `auto` — regra do CSS, não bug de browser — e com isso o `body` vira **scroll container**. Todo elemento sticky passa a se prender ao scrollport do `body` em vez do viewport, e esse scrollport rola junto com o documento. Medido no Chromium a 390px, numa página longa: a barra ficou em `top: -900px` depois de rolar 900px. Ou seja, fora da tela.

    No desktop o sintoma quase não aparece, porque as telas costumam caber sem rolagem. No Chrome Android a barra de URL que encolhe transforma qualquer tela em tela longa — e aí some sempre.

    O `clip` precisa estar nos **dois** elementos: com ele só no `html`, ou só no `body`, o documento continua arrastando na horizontal.

    Em desenvolvimento a própria `AppBar` avisa no console quando detecta esse CSS. 💡

## `Sidebar`

Side nav desktop. `items: SidebarEntry[]` (itens, seções e separadores), slots
`header`/`footer`, modo `collapsed` (apenas ícones).

```tsx
import { useState } from "react";
import { Button, Sidebar } from "tempest-react-sdk";
import { Cog, Home, Package } from "lucide-react";

export function Lateral() {
    const [tab, setTab] = useState("home");
    const [collapsed, setCollapsed] = useState(false);

    return (
        <Sidebar
            header={<strong>{collapsed ? "T" : "Tempest"}</strong>}
            items={[
                { key: "home", label: "Início", icon: <Home size={16} /> },
                { key: "orders", label: "Pedidos", icon: <Package size={16} />, badge: 3 },
                { key: "settings", label: "Ajustes", icon: <Cog size={16} /> },
            ]}
            value={tab}
            onChange={setTab}
            footer={<Button onClick={() => setCollapsed(!collapsed)}>Colapsar</Button>}
            collapsed={collapsed}
            width={240}
            collapsedWidth={64}
        />
    );
}
```

| Prop             | Tipo                           | Default |
| ---------------- | ------------------------------ | ------- |
| `header`         | `ReactNode`                    | —       |
| `items`          | `SidebarEntry[]`               | —       |
| `value`          | `string`                       | —       |
| `onChange`       | `(key: string) => void`        | —       |
| `footer`         | `ReactNode`                    | —       |
| `collapsed`      | `boolean`                      | `false` |
| `width`          | `number \| string` (px ou CSS) | `240`   |
| `collapsedWidth` | `number \| string`             | `64`    |

```ts
type SidebarItem = {
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    badge?: ReactNode;
    disabled?: boolean;
    href?: string;
};

type SidebarEntry =
    | ({ type?: "item" } & SidebarItem)
    | { type: "section"; key: string; label: ReactNode }
    | { type: "separator"; key: string };
```

`type` é opcional no ramo do item, então **um `SidebarItem[]` continua sendo um
`SidebarEntry[]` válido** — nenhum call site existente muda uma linha.

### Agrupando em seções

Lista corrida funciona até uns 8 itens. Acima disso vira parede: 16 telas sem
rótulo deixam "Diagnósticos" visualmente colado em "Campanhas", e o admin perde a
âncora que dizia em que parte do painel ele está.

Uma seção abre um grupo, e os itens seguintes pertencem a ele **até a próxima
seção ou separador**:

```tsx
import { useState } from "react";
import { Sidebar } from "tempest-react-sdk";
import { Activity, BarChart3, FileText, Settings, Users } from "lucide-react";

function AdminNav() {
  const [tab, setTab] = useState("overview");

  return (
    <Sidebar
      items={[
        { type: "section", key: "monitoring", label: "Monitoramento" },
        { key: "overview", label: "Visão Geral", icon: <BarChart3 /> },
        { key: "activity", label: "Atividade", icon: <Activity /> },
        { key: "reports", label: "Relatórios", icon: <FileText /> },

        { type: "section", key: "users", label: "Gestão de Usuários" },
        { key: "users", label: "Usuários", icon: <Users /> },

        { type: "separator", key: "before-admin" },
        { key: "settings", label: "Configurações", icon: <Settings /> },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
}
```

O que sai no HTML:

```html
<nav aria-label="Navegação lateral">
  <div role="group" aria-labelledby="…-monitoring">
    <div id="…-monitoring" role="presentation">Monitoramento</div>
    <!-- Visão Geral, Atividade, Relatórios -->
  </div>
  <div role="group" aria-labelledby="…-users">…</div>
  <hr />
  <div><!-- Configurações, solto --></div>
</nav>
```

!!! info "Por que `role="group"` e não um item estilizado"
    Usar `disabled: true` como rótulo renderiza `<button disabled>`: passa
    visualmente com CSS, mas o leitor de tela anuncia **"botão indisponível"** no
    lugar de um cabeçalho, e a entrada continua na árvore de navegação. Com
    `role="group"` + `aria-labelledby`, o anúncio é "Monitoramento, grupo, 3
    itens" — sem inventar um botão que não existe.

!!! tip "Itens antes da primeira seção ficam soltos"
    É o comportamento de sempre. Quem não usa seção nenhuma não vê `role="group"`
    no HTML — a lista sai exatamente como saía antes.

!!! warning "No modo `collapsed` o rótulo sai de vista, não da árvore"
    64px não cabe "Gestão de Usuários", então o rótulo vira `clip-path: inset(50%)`
    e o grupo ganha uma linha divisória no topo. O `aria-labelledby` **continua**
    apontando pra ele, para o leitor de tela não perder a estrutura quando o admin
    recolhe a coluna.

### Item que é link

`href` renderiza um `<a>` em vez de `<button>`, e `onChange` continua disparando
no clique:

```tsx
import { useState } from "react";
import { Sidebar } from "tempest-react-sdk";

export function ComLink() {
    const [tab, setTab] = useState("overview");

    return (
        <Sidebar
            items={[{ key: "overview", label: "Visão geral", href: "/overview" }]}
            value={tab}
            onChange={setTab}
        />
    );
}
```

Com isso o middle-click abre em outra aba, o ctrl-click funciona, "copiar endereço
do link" aparece no menu de contexto, e o leitor de tela anuncia link em vez de
botão. Item `disabled` ignora o `href` e continua `<button disabled>`: âncora não
tem estado desabilitado, e tirar o `href` pra simular um deixaria um link que se
anuncia acionável e não é.

**Mobile**: esconda com `<Show above="md">` e exponha via `<Drawer>` no menu hambúrguer.

## `NavigationRail`

<!-- gallery:material -->
[![Material (ListTile · FAB · Rail) na gallery](../assets/gallery/material.webp)](../gallery.md)

*Seção `material` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

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
import { useState } from "react";
import { BottomNavigation, Show } from "tempest-react-sdk";
import { Home, Search, ShoppingCart, User } from "lucide-react";

export function BarraInferior({ cartCount }: { cartCount: number }) {
    const [tab, setTab] = useState("home");

    return (
        <Show below="md">
            <BottomNavigation
                items={[
                    { key: "home", label: "Início", icon: <Home size={20} /> },
                    { key: "search", label: "Buscar", icon: <Search size={20} /> },
                    {
                        key: "cart",
                        label: "Carrinho",
                        icon: <ShoppingCart size={20} />,
                        badge: cartCount,
                    },
                    { key: "profile", label: "Perfil", icon: <User size={20} /> },
                ]}
                value={tab}
                onChange={setTab}
            />
        </Show>
    );
}
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
import { useState } from "react";
import { Tabs } from "tempest-react-sdk";

export function Abas() {
    const [tab, setTab] = useState("overview");

    return (
        <Tabs
            activeId={tab}
            onChange={setTab}
            items={[
                { id: "overview", label: "Visão geral", content: <p>Visão geral</p> },
                { id: "details", label: "Detalhes", content: <p>Detalhes</p> },
                { id: "logs", label: "Logs", content: <p>Logs</p> },
            ]}
        />
    );
}
```

| Prop           | Tipo                    | Default |
| -------------- | ----------------------- | ------- |
| `items`        | `TabItem[]`             | —       |
| `activeId`     | `string` (controlado)   | —       |
| `defaultId`    | `string` (não-controlado) | —     |
| `defaultValue` | `string` (uncontrolled) | —       |
| `onChange`     | `(key: string) => void` | —       |

## `Stepper`

<!-- gallery:advanced -->
[![Stepper · Progress · VirtualList na gallery](../assets/gallery/advanced.webp)](../gallery.md)

*Seção `advanced` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

**Quando usar:** mostrar progresso em um fluxo linear de múltiplas etapas (checkout, onboarding, wizard). É indicador de progresso, não um seletor — controle o `current` pela lógica do fluxo.

Wizard linear com steps numerados. `orientation` aceita `"horizontal"` (default) ou `"vertical"`.

```tsx
import { useState } from "react";
import { Stepper } from "tempest-react-sdk";

export function Passos() {
    const [step] = useState(1);

    return (
        <Stepper
            current={step}
            steps={[
                { label: "Informações" },
                { label: "Pagamento" },
                { label: "Revisão" },
            ]}
        />
    );
}
```

## `Breadcrumbs`

**Quando usar:** sinalizar a posição em uma hierarquia profunda (Home › Pedidos › #12345) e permitir voltar a níveis anteriores. Dispensável em apps de 1-2 níveis.

Navegação hierárquica.

```tsx
import { Breadcrumbs } from "tempest-react-sdk";

export function Trilha() {
    return (
        <Breadcrumbs
            items={[
                { label: "Início", href: "/" },
                { label: "Pedidos", href: "/orders" },
                { label: "#12345" },
            ]}
        />
    );
}
```

**A11y**: último item é marcado com `aria-current="page"`.

## `Pagination`

<!-- gallery:table -->
[![Table & Pagination na gallery](../assets/gallery/table.webp)](../gallery.md)

*Seção `table` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

**Quando usar:** percorrer listas grandes em páginas discretas (resultados de busca, tabelas). Para feeds contínuos, prefira scroll infinito (`VirtualList` + `usePoll`/Query).

Numeric com siblings + page-size opcional.

!!! note "`page` é 1-indexed, e quem conta as páginas é você"
    `totalPages` é o número **de páginas** — o componente não o deriva de `pageSize`. `totalItems` é opcional e só alimenta o texto de resumo ("1–20 de 137"). Lembre de resetar `page` para `1` quando o filtro muda, senão você pode parar numa página que não existe mais.

```tsx
import { useState } from "react";
import { Pagination } from "tempest-react-sdk";

export function Paginacao({ totalItems }: { totalItems: number }) {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);

    return (
        <Pagination
            page={page}
            pageSize={size}
            totalPages={Math.max(1, Math.ceil(totalItems / size))}
            totalItems={totalItems}
            onPageChange={setPage}
            onPageSizeChange={setSize}
            siblingCount={1}
        />
    );
}
```

| Prop               | Tipo                     | Default |
| ------------------ | ------------------------ | ------- |
| `page`             | `number` (1-indexed)     | —       |
| `pageSize`         | `number`                 | —       |
| `totalPages`       | `number`                 | —       |
| `totalItems`       | `number` (contagem, opcional) | —  |
| `onPageChange`     | `(page: number) => void` | —       |
| `onPageSizeChange` | `(size: number) => void` | —       |
| `siblingCount`     | `number` (vizinhos)      | `7`     |

## `SegmentedControl`

**Quando usar:** alternar entre 2-5 visões mutuamente exclusivas da mesma tela (lista/grade/mapa). É mais compacto que `Tabs` e não tem painéis de conteúdo embutidos — você troca a view manualmente pelo `value`.

iOS-style pill bar (2-5 opções).

```tsx
import { useState } from "react";
import { SegmentedControl } from "tempest-react-sdk";
import { LayoutGrid, List, Map } from "lucide-react";

export function Visao() {
    const [view, setView] = useState("list");

    return (
        <SegmentedControl
            value={view}
            onChange={setView}
            options={[
                { value: "list", label: "Lista", icon: <List size={14} /> },
                { value: "grid", label: "Grade", icon: <LayoutGrid size={14} /> },
                { value: "map", label: "Mapa", icon: <Map size={14} /> },
            ]}
            size="md"
            fullWidth
        />
    );
}
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
