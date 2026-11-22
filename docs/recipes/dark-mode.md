# Dark mode sem flash

A equipe da Loja Aurora fecha o caixa às dez da noite, e o painel branco cansa a vista.
Você quer três opções, **Claro**, **Escuro** e **Sistema**, que a escolha sobreviva ao
F5 e, principalmente, que a página **não pisque branca** antes de ficar escura. 🌙

O flash acontece porque o HTML pinta antes de o React montar. Por um instante aparece
o tema padrão, e só depois o `ThemeProvider` corrige. A cura é um script pequeno e
síncrono no `<head>`, gerado por
[`themeInitScript()`](../theme.md#no-flash-evitar-o-flash-do-tema-errado), que aplica o
tema **antes da primeira pintura**.

!!! info "Antes de começar"
    Instalação em [instalação manual](../index.md#instalacao-manual). Os componentes do
    SDK já leem os tokens `--tempest-*`, então eles trocam de cor sozinhos.

## O que vamos construir

- 🎛️ Um seletor **Claro / Escuro / Sistema** no topo do painel.
- 💾 A escolha salva no `localStorage`, lida de novo no próximo acesso.
- ⚡ **Zero flash** no carregamento, mesmo com F5 e conexão lenta.
- 🖥️ No modo **Sistema**, o painel acompanha o sistema operacional em tempo real.
- 📱 A barra do navegador no celular acompanha o tema (`theme-color`).

## O código, arquivo por arquivo

### 1. O script no `<head>`

=== "Vite (`index.html`)"

    ```html
    <!-- index.html -->
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ffffff" />
        <title>Painel · Loja Aurora</title>
        <script>
          (function () {
            try {
              var key = "tempest-theme";
              var def = "system";
              var stored = localStorage.getItem(key);
              var mode = stored || def;
              var resolved =
                mode === "dark" || mode === "light"
                  ? mode
                  : matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light";
              document.documentElement.setAttribute("data-tempest-theme", resolved);
            } catch (e) {}
          })();
        </script>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
      </body>
    </html>
    ```

=== "SSR (React no servidor)"

    ```tsx
    // src/Document.tsx
    import type { ReactNode } from "react";
    import { themeInitScript } from "tempest-react-sdk";

    interface DocumentProps {
      children: ReactNode;
    }

    export function Document({ children }: DocumentProps) {
      return (
        <html lang="pt-BR">
          <head>
            <meta charSet="UTF-8" />
            <meta name="theme-color" content="#ffffff" />
            <title>Painel · Loja Aurora</title>
            <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
          </head>
          <body>{children}</body>
        </html>
      );
    }
    ```

### 2. O seletor de tema

```tsx
// src/components/ThemeSwitcher.tsx
import { SegmentedControl, useTheme, type ThemeMode } from "tempest-react-sdk";

const options: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "☀️ Claro" },
  { value: "dark", label: "🌙 Escuro" },
  { value: "system", label: "💻 Sistema" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedControl
      aria-label="Tema do painel"
      size="sm"
      options={options}
      value={theme}
      onChange={setTheme}
    />
  );
}
```

### 3. O app

```tsx
// src/App.tsx
import { AppProviders, AppRouter, Spinner } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders
      theme={{
        defaultTheme: "system",
        themeColor: { light: "#ffffff", dark: "#0b0d12" },
      }}
      errorBoundary={{ fallback: <p>Algo deu errado. Recarregue a página.</p> }}
    >
      <AppRouter routes={routes} fallback={<Spinner />} />
    </AppProviders>
  );
}
```

### 4. O CSS do próprio app

```css
/* src/styles/app.css */
.topbar {
  background: var(--tempest-surface);
  color: var(--tempest-text);
  border-bottom: 1px solid var(--tempest-border);
}

[data-tempest-theme="dark"] .logo {
  filter: invert(1);
}
```

## Pedaço por pedaço

### O script é o que mata o flash

Ele roda **antes do CSS e antes do React**. Lê a escolha salva em
`localStorage["tempest-theme"]`. Se for `"system"` ou não houver nada, pergunta ao
navegador com `prefers-color-scheme`. No fim, escreve `data-tempest-theme="dark"` (ou
`"light"`) no `<html>`. Quando a primeira pintura acontece, os tokens já estão certos.

O conteúdo da aba **Vite** é exatamente o que `themeInitScript()` devolve, só
formatado. Na aba **SSR**, você injeta a própria função, e o script nunca sai de
sincronia com o SDK.

!!! warning "Síncrono e cedo, sempre"
    Nada de `defer`, `async` ou script no fim do `<body>`. Ele precisa rodar antes da
    primeira pintura, senão o flash volta.

!!! check "Com `tempestCsp()`, o script inline já é liberado"
    O plugin de CSP do SDK calcula o SHA-256 de todo script inline do `index.html` e o
    coloca na política. Você não precisa de `'unsafe-inline'`. Veja
    [Script inline entra por hash](../csp.md#script-inline-entra-por-hash).

### O seletor usa o contexto do tema

`useTheme()` devolve:

- `theme`: a escolha crua (`"light"`, `"dark"` ou `"system"`), que é o que o seletor
  mostra;
- `resolvedTheme`: o que está aplicado de fato (`"light"` ou `"dark"`);
- `setTheme(next)`: grava a escolha no `localStorage` e atualiza o `<html>`;
- `toggle()`: alterna entre claro e escuro, para quando um botão só basta.

O `SegmentedControl` recebe `value={theme}` e `onChange={setTheme}` direto, porque os
dois falam o mesmo tipo `ThemeMode`. Veja
[`SegmentedControl`](../components/navigation.md#segmentedcontrol).

### O provider já vem no `<AppProviders>`

O `<AppProviders>` monta o `ThemeProvider` por padrão. A prop `theme` só ajusta:

- `defaultTheme: "system"` vale para quem nunca escolheu nada. No modo sistema, o
  provider escuta `prefers-color-scheme` e troca na hora em que o sistema operacional
  muda.
- `themeColor` atualiza a `<meta name="theme-color">`, que pinta a barra do navegador
  no Android e a barra de status do app instalado. 📱 Ele só **atualiza** a tag: ela
  precisa existir no `<head>`, por isso as duas abas do passo 1 a declaram.

!!! tip "Mesma chave nos dois lados"
    O script e o provider precisam ler a mesma chave do `localStorage`. Os dois usam
    `"tempest-theme"` por padrão. Se você trocar, passe `storageKey` aos dois:
    `themeInitScript({ storageKey: "aurora-theme" })` e
    `theme={{ storageKey: "aurora-theme" }}`.

### O seu CSS usa os mesmos tokens

Os componentes do SDK leem `--tempest-bg`, `--tempest-surface`, `--tempest-text` e os
outros tokens. Use os mesmos no CSS do app, e ele troca junto. Para algo que o token não
resolve, como inverter um logo, o seletor `[data-tempest-theme="dark"]` funciona. O
tema escuro é sempre esse atributo, nunca `class="dark"`. Veja
[Customizando tokens](../theme.md#customizando-tokens).

## Recap

- ✅ O script de `themeInitScript()` no `<head>` aplica o tema antes da primeira
  pintura: sem flash.
- ✅ `useTheme()` dá `theme`, `resolvedTheme`, `setTheme` e `toggle`.
- ✅ `SegmentedControl` + `setTheme` viram o seletor **Claro / Escuro / Sistema**.
- ✅ `<AppProviders theme={{ defaultTheme, themeColor }}>` acompanha o sistema e pinta a
  barra do celular.
- ✅ CSS do app com tokens `--tempest-*` e `[data-tempest-theme="dark"]`.
