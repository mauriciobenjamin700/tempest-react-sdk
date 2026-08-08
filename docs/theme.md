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

## `createTheme` — a marca inteira a partir de uma cor

Sobrescrever token por token funciona pra um ajuste pontual. Pra **trocar a marca**, são ~30 valores só de `primary` (dez degraus × claro/escuro, mais os aliases de hover/active/soft) — e é fácil errar a inversão do ramp no dark. `createTheme` gera tudo:

```tsx
import { applyTheme, createTheme } from "tempest-react-sdk";

const theme = createTheme({ primary: "#7c3aed" });

applyTheme(theme);
```

Pronto: os 104 componentes passam a usar a marca nova, no claro e no escuro.

### O que ele gera

```ts
const theme = createTheme({
  primary: "#7c3aed",          // escala 50→900 + hover/active/soft/foreground/focus-ring
  gray: "#6b7280",             // superfícies, bordas e texto
  success: "#16a34a",          // cada status vira -fg / -bg / -border / -solid
  danger: "#dc2626",
  chart: ["#7c3aed", "#0ea5e9", "#22c55e"],  // --tempest-chart-1..N + -count (ver Charts)
  radius: "lg",                // "none" | "sm" | "md" | "lg" | "xl" | "full"
  focusRingAlpha: 0.35,
});

theme.light; // { "--tempest-primary-500": "#7c3aed", … } — a sua cor, exata
theme.dark;  // idem, com o ramp invertido
theme.css;   // ":root { … }\n\n[data-tempest-theme=\"dark\"] { … }"
```

Só as famílias que você passa são geradas — o resto continua vindo do `colors.css` do SDK. Um tema é um **patch**, não um fork da paleta.

!!! check "O degrau `500` é exatamente a cor que você passou"
    A escala é **ancorada** no `500`: a lightness da sua marca vira o ponto fixo e
    as duas metades do ramp são reescaladas em volta dela. Sem isso o `500` era
    forçado na lightness alvo da curva e `#7c3aed` voltava como `#9161fe` — mesma
    matiz, mesma croma, **re-clareado**. Parece bom isolado e está errado de todo
    jeito: a única cor que o designer entregou é justamente a que os botões
    precisam ter. Marca muito clara (amarelo) ou muito escura (navy) simplesmente
    ganha um trecho mais curto do lado apertado, e o ramp continua monótono.

!!! info "Por que OKLCH e não HSL"
    A escala é derivada em OKLCH porque lightness em HSL **não é perceptual**: um amarelo e um azul com o mesmo `L` em HSL têm brilho visivelmente diferente, e é exatamente isso que faz uma paleta gerada parecer "quebrada" em algumas cores. Em OKLCH o degrau `500` de qualquer marca ocupa o mesmo lugar visual.

!!! tip "O passo de texto sobre a tinta soft é medido, não convencionado"
    `--tempest-primary-on-soft` não é fixo no `600`: o SDK **mede** o contraste contra a tinta `50` e desce no ramp até passar de 4.5:1 (AA para texto). Isso não é preciosismo — o azul padrão só alcança 4.37:1 no `500` sobre a própria tinta, e um emerald gerado para em 4.41:1 no `600`. Os dois reprovariam AA por um fio.

### Presets prontos

```tsx
import { applyTheme, createTheme, themePresets } from "tempest-react-sdk";

applyTheme(createTheme(themePresets.violet));

// ou partindo de um e ajustando
applyTheme(createTheme({ ...themePresets.emerald, radius: "full" }));
```

Presets disponíveis: `tempest` (o default do SDK), `violet`, `emerald`, `rose`, `slate`, `amber`. Cada um é um objeto de opções — dado, não CSS —, então dá pra guardar o nome escolhido em `localStorage` e resolver com `getThemePreset(name)` (que devolve `undefined` para nome inválido em vez de explodir no boot).

### Trocando de tema em runtime

```tsx
import { applyTheme, createTheme, getThemePreset } from "tempest-react-sdk";
import { useEffect, useState } from "react";

export function BrandPicker() {
  const [brand, setBrand] = useState(() => localStorage.getItem("brand") ?? "tempest");

  useEffect(() => {
    const preset = getThemePreset(brand);
    if (!preset) return;
    localStorage.setItem("brand", brand);
    return applyTheme(createTheme(preset));
  }, [brand]);

  return (
    <select value={brand} onChange={(event) => setBrand(event.target.value)}>
      {["tempest", "violet", "emerald", "rose", "slate", "amber"].map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
}
```

`applyTheme` é **idempotente**: ele é dono de um `<style id="tempest-theme">` e reescreve o conteúdo, então um seletor de marca pode ser acionado à vontade sem empilhar folhas mortas no `<head>`. O retorno é o disposer (usado como cleanup do effect acima).

!!! tip "Tema escopado numa subárvore"
    Passe `selector`/`darkSelector` no `createTheme` e `id`/`target` no `applyTheme` pra pintar só um pedaço da tela — útil pra preview de marca:

    ```tsx
    applyTheme(
      createTheme({ primary: "#e11d48", selector: ".preview", darkSelector: '.preview[data-tempest-theme="dark"]' }),
      { id: "preview-theme" },
    );
    ```

### Sem JS: cole o CSS gerado

`theme.css` é texto. Se você prefere um tema estático (zero JS no caminho crítico), gere uma vez e cole no CSS global do app:

```bash
node -e "import('tempest-react-sdk').then(({ createTheme }) => console.log(createTheme({ primary: '#7c3aed' }).css))" > src/brand.css
```

### Auditando o contraste da sua marca

```ts
import { contrastRatio, createColorScale, themeContrast } from "tempest-react-sdk";

themeContrast({ primary: "#fde047" }); // 15.2 — texto escuro foi escolhido automaticamente

const scale = createColorScale("#7c3aed");
contrastRatio(scale[500], "#ffffff");  // asserte no seu teste, se a marca é requisito
```

`--tempest-primary-foreground` (e `--tempest-text-on-primary`) é escolhido por contraste medido entre branco e o cinza escuro — hardcodar branco produziria botões ilegíveis em marcas claras (amarelo, lima, ciano).

### As conversões de cor, avulsas

O `createTheme` faz o trabalho todo, mas as conversões que ele usa por dentro
são exportadas para quando você precisa de uma só — clarear um badge, gerar um
overlay, comparar duas cores no seu próprio teste:

```ts
import { hexToOklch, hexToRgb, hexToRgbaString, oklchToHex } from "tempest-react-sdk";

const { l, c, h } = hexToOklch("#7c3aed"); // luminosidade, croma, matiz
oklchToHex({ l: l + 0.1, c, h }); // 10% mais claro, mesma matiz e saturação

hexToRgbaString("#7c3aed", 0.12); // "rgb(124 58 237 / 0.12)" — overlay/hover
hexToRgb("#7c3aed"); // { r, g, b } em 0–1, para cálculo próprio
```

!!! info "Por que OKLCH e não HSL"
    Clarear em HSL muda a cor percebida: `hsl(240 100% 50%)` e
    `hsl(60 100% 50%)` têm a mesma "luminosidade" declarada e brilhos
    completamente diferentes aos olhos. OKLCH é perceptualmente uniforme, então
    `l + 0.1` clareia o mesmo tanto em qualquer matiz — é por isso que a escala
    do `createTheme` sai regular em vez de embolar nos amarelos.
    `oklchToHex` ainda reduz o croma até a cor caber no gamut sRGB, em vez de
    devolver um hex recortado.

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
