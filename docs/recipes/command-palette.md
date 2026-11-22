# Paleta de comandos ⌘K

O painel da Loja Aurora cresceu: Pedidos, Clientes, Produtos, Relatórios, Equipe,
Configurações. A gerente passa o dia nele e não quer caçar item de menu. Ela aperta
**⌘K** (ou **Ctrl+K** no Windows), digita "cli", aperta Enter e está em Clientes. No
celular, onde não há atalho, um botão no topo abre a mesma paleta. ⌨️

As peças são o componente [`Command`](../components/advanced-essentials.md#command-paleta-k),
o hook [`useKeyboardShortcut`](../hooks.md#atalho-global-usekeyboardshortcut), o
`useNavigate` do [roteamento](../routing.md) e o [`Kbd`](../components/identity.md#kbd)
para mostrar o atalho.

!!! info "Antes de começar"
    Esta receita usa o store `useAuth` da receita
    [Fluxo de autenticação completo](auth-flow.md) e o `ThemeProvider` que já vem no
    [`<AppProviders>`](../app-providers.md). Instalação em
    [instalação manual](../index.md#instalacao-manual).

## O que vamos construir

- ⌨️ **⌘K / Ctrl+K** abre a paleta de qualquer tela, inclusive com o foco num campo.
- 🔎 **Busca** por nome e por sinônimo ("painel" acha "Início").
- 🗂️ **Grupos**: Navegação, Ações e Preferências.
- 🔐 **Itens por papel**: só a gerente vê "Equipe".
- 📱 **Botão no topo** com a dica do atalho, que é o caminho no celular.

## O código

```tsx
// src/components/CommandPalette.tsx
import { useState } from "react";
import {
  Button,
  Command,
  Kbd,
  useKeyboardShortcut,
  useNavigate,
  useTheme,
  type CommandItem,
} from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

const isApple: boolean =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function CommandPalette() {
  const [open, setOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const role: string | undefined = useAuth.use.user()?.role;
  const logout: () => void = useAuth.use.logout();

  useKeyboardShortcut(
    { key: "k", mod: true },
    (event) => {
      event.preventDefault();
      setOpen(true);
    },
    { ignoreInput: false },
  );

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
        rightIcon={<Kbd size="sm">{isApple ? "⌘ K" : "Ctrl K"}</Kbd>}
      >
        Buscar
      </Button>
      <Command
        open={open}
        onOpenChange={setOpen}
        placeholder="Ir para tela ou ação…"
        emptyMessage="Nada encontrado. Tente outro termo."
        items={items}
      />
    </>
  );
}
```

E o layout monta a paleta uma vez, no topo:

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

## Pedaço por pedaço

### O `Command` faz o trabalho pesado

Você entrega uma lista de `CommandItem` e controla `open` / `onOpenChange`. O resto é
dele:

- filtra os itens por trecho do texto em `label` **e** em `keywords`, sem diferenciar
  maiúscula de minúscula;
- agrupa os resultados por `group`, na ordem em que os grupos aparecem na lista;
- navega com ↑ / ↓, executa com Enter e fecha com Escape, clique fora ou seleção;
- prende o foco dentro da paleta enquanto ela está aberta.

Cada `onSelect` é a ação do item: `navigate(...)`, `toggle()` ou `logout()`.

!!! tip "`keywords` é onde mora a usabilidade"
    Ninguém lembra se a tela se chama "Clientes" ou "Compradores". Ponha os sinônimos
    em `keywords`, inclusive palavras sem acento ("usuarios") se a sua equipe digita
    assim: a busca compara o texto como ele é, com acento.

### O atalho funciona em qualquer sistema

`useKeyboardShortcut({ key: "k", mod: true }, handler)` casa **Cmd+K no macOS e Ctrl+K
no Windows e no Linux**. O hook recebe um objeto `KeyboardShortcut`, não uma string.

Dois detalhes deixam o atalho pronto para uso real:

- `event.preventDefault()`: Ctrl+K é atalho do próprio navegador (focar a busca no
  Chrome e no Firefox). Sem isso, a paleta abre **e** o navegador rouba o foco.
- `{ ignoreInput: false }`: por padrão o hook ignora teclas digitadas dentro de um
  campo, para não sequestrar a digitação. Para ⌘K isso é o contrário do que se quer:
  a pessoa está com o foco na busca de pedidos e quer pular de tela. Como o atalho
  exige o modificador, não há risco de engolir uma letra digitada.

### Itens por papel

A lista é montada no render, então ela pode depender do usuário. Aqui, `"Equipe"` só
entra para `role === "gerente"`. Esconder o item **não protege a rota**: o guard de
`/equipe` e o backend continuam responsáveis pelo acesso. Veja
[Controle de acesso](../access-control.md).

### O botão com `Kbd`

O botão "Buscar" tem dois papéis. No computador, ele **ensina** o atalho, com a tecla
certa para o sistema de quem está usando. No celular, é **o único jeito** de abrir a
paleta, já que não há teclado físico. 📱

!!! note "Por que detectar a plataforma na mão"
    O `mod` do hook resolve Cmd vs. Ctrl na hora de **ouvir** a tecla. Para
    **mostrar** a tecla, o app decide sozinho, e um teste em `navigator.userAgent`
    basta. O `typeof navigator` evita erro se o módulo for importado fora do
    navegador, num teste em Node, por exemplo.

## Recap

- ✅ `Command` recebe `items`, `open` e `onOpenChange` e cuida de busca, grupos,
  teclado e foco.
- ✅ `useKeyboardShortcut({ key: "k", mod: true }, …, { ignoreInput: false })` abre a
  paleta de qualquer lugar, com `preventDefault` para vencer o atalho do navegador.
- ✅ `keywords` acha a tela pelo sinônimo.
- ✅ A lista depende do usuário, mas a proteção de verdade fica no guard e no backend.
- ✅ Um botão com `Kbd` ensina o atalho e é a porta de entrada no celular.
