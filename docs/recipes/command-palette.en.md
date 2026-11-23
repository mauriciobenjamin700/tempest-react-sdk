# Command palette ⌘K

Loja Aurora's dashboard grew: Pedidos, Clientes, Produtos, Relatórios, Equipe,
Configurações. The manager spends the whole day in it and does not want to hunt for
menu items. She presses **⌘K** (or **Ctrl+K** on Windows), types "cli", hits Enter and
she is in Clientes. On a phone, where there is no shortcut, a button at the top opens
the same palette. ⌨️

The pieces are the [`Command`](../components/advanced-essentials.md#command-k-palette)
component, the [`useKeyboardShortcut`](../hooks.md#global-shortcut-usekeyboardshortcut)
hook, `useNavigate` from [routing](../routing.md) and [`Kbd`](../components/identity.md#kbd)
to show the shortcut.

!!! info "Before you start"
    This recipe uses the `useAuth` store from the
    [Full authentication flow](auth-flow.md) recipe and the `ThemeProvider` that
    already ships in [`<AppProviders>`](../app-providers.md). Install in
    [manual install](../index.md#manual-install).

## What we are building

- ⌨️ **⌘K / Ctrl+K** opens the palette from any screen, even with the focus in a field.
- 🔎 **Search** by name and by synonym ("painel" finds "Início").
- 🗂️ **Groups**: Navegação, Ações and Preferências.
- 🔐 **Items per role**: only the manager sees "Equipe".
- 📱 **A button at the top** with the shortcut hint, which is the way in on phones.

## The code

```tsx
// src/components/CommandPalette.tsx
import { useState } from "react";
import {
  Button,
  Command,
  Kbd,
  formatShortcut,
  useKeyboardShortcut,
  useNavigate,
  useTheme,
  type CommandItem,
} from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

export function CommandPalette() {
  const [open, setOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const role: string | undefined = useAuth.use.user()?.role;
  const logout: () => void = useAuth.use.logout();

  useKeyboardShortcut({ key: "k", mod: true }, () => setOpen(true));

  const items: CommandItem[] = [
    {
      id: "home",
      label: "Início",
      group: "Navegação",
      keywords: ["painel", "dashboard"],
      onSelect: () => navigate("/"),
    },
    {
      id: "orders",
      label: "Pedidos",
      group: "Navegação",
      keywords: ["vendas", "compras"],
      onSelect: () => navigate("/pedidos"),
    },
    {
      id: "customers",
      label: "Clientes",
      group: "Navegação",
      keywords: ["compradores", "cpf"],
      onSelect: () => navigate("/clientes"),
    },
    {
      id: "new-order",
      label: "Novo pedido",
      group: "Ações",
      keywords: ["venda", "balcão"],
      onSelect: () => navigate("/pedidos/novo"),
    },
    {
      id: "theme",
      label: "Alternar tema claro/escuro",
      group: "Preferências",
      keywords: ["dark", "noturno"],
      onSelect: () => toggle(),
    },
    {
      id: "logout",
      label: "Sair",
      group: "Preferências",
      keywords: ["logout", "deslogar"],
      onSelect: () => {
        logout();
        navigate("/login", { replace: true });
      },
    },
  ];

  if (role === "gerente") {
    items.splice(3, 0, {
      id: "team",
      label: "Equipe",
      group: "Navegação",
      keywords: ["usuários", "acessos"],
      onSelect: () => navigate("/equipe"),
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        rightIcon={<Kbd size="sm">{formatShortcut({ key: "k", mod: true })}</Kbd>}
      >
        Buscar
      </Button>
      <Command
        open={open}
        onOpenChange={setOpen}
        placeholder="Ir para tela ou ação…"
        label="Ir para tela ou ação"
        emptyMessage="Nada encontrado. Tente outro termo."
        items={items}
      />
    </>
  );
}
```

And the layout mounts the palette once, at the top:

```tsx
// src/layouts/PrivateLayout.tsx
import { Outlet } from "tempest-react-sdk";
import { CommandPalette } from "@/components/CommandPalette";

export function PrivateLayout() {
  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--tempest-border)",
        }}
      >
        <strong>Loja Aurora</strong>
        <CommandPalette />
      </header>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

## Piece by piece

### `Command` does the heavy lifting

You hand over a list of `CommandItem`s and control `open` / `onOpenChange`. The rest is
its job:

- it filters the items by a piece of the text in `label` **and** in `keywords`,
  ignoring case **and accents** — "usuarios" finds "Usuários";
- it groups the results by `group`, in the order the groups appear in the list;
- it navigates with ↑ / ↓, runs with Enter and closes on Escape, click outside or
  selection;
- it traps the focus inside the palette while it is open.

Each `onSelect` is the item's action: `navigate(...)`, `toggle()` or `logout()`.

!!! tip "`keywords` is where usability lives"
    Nobody remembers whether the screen is called "Clientes" or "Compradores". Put the
    synonyms in `keywords`. No unaccented copy is needed: the search already ignores
    accents on both sides.

### The shortcut works on any system

`useKeyboardShortcut({ key: "k", mod: true }, handler)` matches **Cmd+K on macOS and
Ctrl+K on Windows and Linux**. The hook takes a `KeyboardShortcut` object, not a
string.

Because the shortcut carries the modifier, the hook does two things on its own:

- it calls `event.preventDefault()`: Ctrl+K is a browser shortcut of its own (focus the
  search in Chrome and Firefox), and without it the palette opens **and** the browser
  steals the focus;
- it fires with the focus in a field: the person is in the orders search and wants to
  jump screens. A key without Ctrl/Cmd (`"/"`, `"?"`) still belongs to the field it is
  typed in.

To change either, pass `{ preventDefault: false }` or `{ ignoreInput: true }`. See
[`useKeyboardShortcut`](../hooks.md#global-shortcut-usekeyboardshortcut).

### Items per role

The list is built during render, so it can depend on the user. Here, `"Equipe"` only
goes in for `role === "gerente"`. Hiding the item **does not protect the route**: the
`/equipe` guard and the backend remain responsible for access. See
[Access control](../access-control.md).

### The button with `Kbd`

The "Buscar" (search) button has two roles. On a computer, it **teaches** the shortcut,
with the right key for the system in use. On a phone, it is **the only way** to open
the palette, since there is no physical keyboard. 📱

`formatShortcut` takes the same object the hook listens for and returns `⌘K` on Mac,
iPhone and iPad, and `Ctrl+K` everywhere else. The label and the shortcut cannot drift
apart.

## Recap

- ✅ `Command` takes `items`, `open` and `onOpenChange` and handles search, groups,
  keyboard and focus.
- ✅ `useKeyboardShortcut({ key: "k", mod: true }, …)` opens the palette from anywhere,
  including from inside a field, and beats the browser's shortcut.
- ✅ `keywords` finds the screen by synonym.
- ✅ The list depends on the user, but the real protection lives in the guard and the
  backend.
- ✅ A button with `Kbd` and `formatShortcut` teaches the right shortcut for the system
  and is the way in on phones.
