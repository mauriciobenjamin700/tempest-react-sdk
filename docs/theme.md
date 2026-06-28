# Tema (dark / light)

`ThemeProvider` decide o tema efetivo e escreve `data-tempest-theme="dark"` (ou `"light"`) em `<html>`. Os tokens CSS `--tempest-*` reagem a esse atributo, então **trocar o tema é trocar um atributo** — nenhum componente precisa saber que o tema mudou. Veja os tokens em [`src/styles/colors.css`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/src/styles/colors.css).

!!! info "Por que um atributo, e não `class=\"dark\"`?"
    Usar `data-tempest-theme` (em vez da convenção `class="dark"`) evita colisão com classes do app e permite escopo parcial: você pode aplicar um tema diferente em uma subárvore (preview, portal, docs) sem afetar o resto da página. É a única forma de tema suportada pelo SDK.

## Setup

Envolva a árvore com `ThemeProvider`. O modo padrão é `"system"`, que segue a preferência do sistema operacional:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
```

Modos disponíveis: `"light"`, `"dark"`, `"system"`. Em `"system"`, o provider escuta `prefers-color-scheme` e reage a mudanças do SO em tempo real. A escolha do usuário é persistida em `localStorage["tempest-theme"]` (desative com `storageKey={null}`).

## Toggle de tema

`useTheme()` lê e muta o tema. Um botão completo de alternância:

```tsx
import { useTheme } from "tempest-react-sdk";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, toggle } = useTheme();

  return (
    <div>
      <button onClick={toggle}>{resolvedTheme === "dark" ? "🌙 Escuro" : "☀️ Claro"}</button>

      {/* ou controle os três modos explicitamente */}
      <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
        <option value="system">Sistema</option>
      </select>
    </div>
  );
}
```

O que cada campo significa:

- `theme`: a **preferência crua** do usuário — `"light"`, `"dark"` ou `"system"`.
- `resolvedTheme`: o tema **efetivamente aplicado** — sempre `"light"` ou `"dark"` (nunca `"system"`).
- `setTheme(next)`: grava a preferência (e persiste).
- `toggle()`: inverte o `resolvedTheme`. Em modo `"system"`, alterna para o oposto do que está aplicado.

!!! tip "Use `resolvedTheme` para renderizar, `theme` para o seletor"
    Quando precisar decidir qual ícone/imagem mostrar, leia `resolvedTheme` (é sempre concreto). Reserve `theme` para refletir a escolha no seletor de três opções.

## No-flash (evitar o flash do tema errado)

Há um problema clássico: o HTML pinta antes do React montar, então por um instante o usuário vê o tema padrão antes de o `ThemeProvider` corrigir. A solução é um script síncrono inline no `<head>`, **antes de qualquer CSS**, que aplica o atributo na primeira pintura.

`themeInitScript()` devolve exatamente esse trecho. Em um `index.html` Vite:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <!-- Aplica data-tempest-theme antes de pintar. Cole a saída de themeInitScript() aqui. -->
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

Se você renderiza o HTML por SSR/React (Next, Remix, etc.), injete via `dangerouslySetInnerHTML` para manter a string gerada em sincronia com o SDK:

```tsx
import { themeInitScript } from "tempest-react-sdk";

export function Head() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />;
}
```

!!! warning "O script precisa ser síncrono e vir cedo"
    Não use `defer`, `async` nem mova o script para o fim do `<body>` — ele tem que rodar antes da primeira pintura, senão o flash volta. `getInitialTheme()` expõe a mesma lógica de resolução para quando você quiser o tema calculado em JS sem injetar o script.

## Customizando tokens

Os tokens `--tempest-*` são a única API de tema. Sobrescreva-os em qualquer ponto da cascata — um para o tema claro, outro dentro do seletor de tema escuro:

```css
:root {
  --tempest-primary: #ff3366;
  --tempest-radius-md: 6px;
}

[data-tempest-theme="dark"] {
  --tempest-primary: #ff6688;
}
```

!!! note "Tokens são API pública"
    Como apps dependem desses nomes, mudar/remover um token é breaking change — por isso eles seguem o versionamento semântico do SDK.

## Integração com o CSS do app + `theme-color`

Os componentes do SDK leem `data-tempest-theme`. Se o **CSS próprio do seu app** já chaveia o tema em outro atributo (ex.: `[data-theme="dark"]`), você não precisa de um effect de sincronização — passe um array em `attribute` e o provider escreve o tema resolvido em **todos**:

```tsx
<ThemeProvider attribute={["data-tempest-theme", "data-theme"]}>
  <App />
</ThemeProvider>
```

Para sincronizar a barra do navegador / status bar do PWA, passe `themeColor` — o provider atualiza `<meta name="theme-color">` com a cor do tema resolvido (a meta tag precisa existir no `<head>`):

```tsx
<ThemeProvider themeColor={{ light: "#1f7a3f", dark: "#0f1411" }}>
  <App />
</ThemeProvider>
```

!!! tip "Por que isso existe"
    Antes, apps que misturavam CSS próprio + componentes do SDK escreviam um hook só pra espelhar o tema em `data-theme` e atualizar a meta tag. `attribute` (array) + `themeColor` cobrem os dois casos no próprio provider.

## Escopo parcial

Passe `target` para aplicar o tema em uma subárvore específica em vez de `<html>` — útil para um preview ou portal que precisa de tema independente:

```tsx
<ThemeProvider target={() => document.getElementById("preview")} defaultTheme="dark">
  <Preview />
</ThemeProvider>
```

## Recap

- `ThemeProvider` escreve `data-tempest-theme` no `<html>` (ou no elemento de `target`); os tokens `--tempest-*` reagem sozinhos.
- Modos: `"light"`, `"dark"`, `"system"` — o último segue `prefers-color-scheme` ao vivo. A escolha persiste em `localStorage["tempest-theme"]`.
- `useTheme()` dá `theme` (preferência crua), `resolvedTheme` (sempre `light`/`dark`), `setTheme` e `toggle`.
- Inline o `themeInitScript()` **síncrono no `<head>`, antes do CSS**, para eliminar o flash do tema errado.
- Customize o visual sobrescrevendo os tokens `--tempest-*`; use `target` para tema em subárvore.

## Veja também

- [Componentes](./components.md) — todos consomem os tokens
- [Estilos](./styles.md) — catálogo completo dos tokens `--tempest-*`
- [App Providers](./app-providers.md) — montar o tema junto com Query e i18n
