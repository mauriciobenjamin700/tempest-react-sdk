# Gallery — catálogo visual + funcional

Demo interativo de todos os componentes e features do SDK. Roda como app Vite + React em [`examples/gallery`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery).

## O que é a gallery?

A gallery é um app Vite + React **real** que consome o SDK exatamente como um app
de produção faria — via `npm install` apontando para `file:../..`. Ela substitui
o Storybook: cada seção monta componentes com props variadas, exercita hooks ao
vivo (SSE, toast, paginação) e serve como banco de provas visual quando você
mexe em estilos ou layout. Se um componente parece certo na gallery, parece certo
nos apps consumidores.

## Como rodar

```bash
# raiz do repo
npm install
npm run build           # gera dist/ do SDK

cd examples/gallery
npm install
npm run dev             # http://127.0.0.1:5173
```

`tempest-react-sdk` é consumido via `file:../..` — qualquer rebuild da raiz aparece na gallery após reload.

!!! tip "Rode `npm run dev` na raiz em paralelo"
    A gallery serve o `dist/` do SDK. Para ver mudanças no SDK na hora, deixe um
    `npm run dev` (vite build --watch) rodando na raiz numa aba e o
    `npm run dev` da gallery em outra — cada rebuild recarrega a página.

!!! note "Valide UI nos dois breakpoints"
    A gallery é o lugar pra conferir responsividade: redimensione para ≤ 430px
    (mobile) e ≥ 1024px (desktop) antes de dar uma mudança visual como pronta.
    Stack/Grid/Modal/Drawer/Table todos têm comportamento responsivo aqui.

## Capturas nas páginas de documentação

Cada seção da gallery tem uma captura versionada em `docs/assets/gallery/`, e é
ela que aparece nas páginas de componente. Dois comandos mantêm isso em dia:

```bash
npm run e2e:build          # build do SDK + da gallery (pré-requisito)
npm run docs:shots         # captura uma imagem por seção
npm run docs:gallery       # coloca as imagens nas páginas .md
```

`docs:shots` sobe o build de produção da gallery, percorre cada
`section.gallery-section[id]` e grava `docs/assets/gallery/<id>.webp`. As seções
em que o tema é o assunto ganham também um `<id>.dark.webp`.

!!! tip "Rodar de novo não suja o diff"
    O arquivo só é escrito quando os bytes mudam. Numa gallery intocada, uma
    segunda execução deixa `git status` limpo — o diff só aparece quando o
    componente mudou de verdade.

!!! note "Por que WebP versionado, e não artefato de build"
    A imagem precisa aparecer **no site MkDocs e no `.md` que o GitHub
    renderiza**. Artefato gerado só na publicação atende o primeiro e deixa o
    segundo com imagem quebrada. WebP corta ~50% dos bytes contra PNG e é
    encodado pelo próprio Chromium do Playwright, sem dependência nova.

`docs:gallery` insere um bloco marcado (`<!-- gallery:<id> -->`) sob o primeiro
componente de cada seção nas páginas de `docs/components/`, nas duas línguas.
Passe `--check` para falhar sem escrever — é o que o guard de docs usa.

## Seções

Cada seção é um arquivo em [`examples/gallery/src/sections/`](https://github.com/mauriciobenjamin700/tempest-react-sdk/tree/main/examples/gallery/src/sections) e cada exemplo é embrulhado pelo wrapper [`<Example>`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/src/Example.tsx) (demo + código + botão copiar).

<!-- gallery:sections -->
| # | Seção | Âncora | Grupo |
| --- | --- | --- | --- |
| 1 | Buttons | `#buttons` | Componentes |
| 2 | Layout (AppShell · Page · Container) | `#layout` | Componentes |
| 3 | Navbar · Sidebar · Bottom nav | `#nav-extra` | Componentes |
| 4 | Inputs avançados (Date · Pin · Slider) | `#inputs-extra` | Componentes |
| 5 | Alert · Timeline · BottomSheet | `#feedback-extra` | Componentes |
| 6 | Headless & render-props | `#headless` | Componentes |
| 7 | Form fields | `#form-fields` | Componentes |
| 8 | Checkbox · Radio · Switch | `#form-primitives` | Componentes |
| 9 | Toggle · Rating · Range · Combobox | `#inputs-advanced` | Componentes |
| 10 | Badges · Cards · Skeleton | `#feedback` | Componentes |
| 11 | Stat · Tag · Money · Banner | `#data-display` | Componentes |
| 12 | Avatar · Image · Carousel | `#display-media` | Componentes |
| 13 | Modal & Toast | `#modal` | Componentes |
| 14 | Popover · Dropdown · HoverCard | `#overlays` | Componentes |
| 15 | Accordion · Collapsible · Scroll | `#disclosure` | Componentes |
| 16 | AppBar · Tabs · Tooltip · Drawer | `#navigation` | Componentes |
| 17 | Stepper · Progress · VirtualList | `#advanced` | Componentes |
| 18 | TreeView · Wizard | `#hierarchy-flow` | Componentes |
| 19 | SignaturePad · Lightbox · AvatarGroup | `#capture-media` | Componentes |
| 20 | ImageCropper (recorte) | `#image-cropper` | Componentes |
| 21 | Table & Pagination | `#table` | Componentes |
| 22 | DataTable | `#data-table` | Componentes |
| 23 | VirtualTable (40k linhas) | `#virtual-table` | Componentes |
| 24 | Scheduler (agenda) | `#scheduler` | Componentes |
| 25 | BarList (distribuição ranqueada) | `#bar-list` | Componentes |
| 26 | Sparkline (mini-gráfico inline) | `#sparkline` | Componentes |
| 27 | QRCode | `#qrcode` | Componentes |
| 28 | Chat | `#chat` | Componentes |
| 29 | AIChat | `#aichat` | Componentes |
| 30 | Cadeia de voz (microfone) | `#voice-chain` | Componentes |
| 31 | Áudio (gravação) | `#audio-capture` | Componentes |
| 32 | Captura de dispositivo | `#device-capture` | Componentes |
| 33 | Dashboard (CSS) | `#dashboard-layout` | Componentes |
| 34 | FilterBar | `#filterbar` | Componentes |
| 35 | Markdown | `#markdown` | Componentes |
| 36 | Masonry | `#masonry` | Componentes |
| 37 | Tour | `#tour` | Componentes |
| 38 | Transfer | `#transfer` | Componentes |
| 39 | CodeBlock | `#codeblock` | Componentes |
| 40 | Material (ListTile · FAB · Rail) | `#material` | Componentes |
| 41 | Forms (zod) | `#forms` | Componentes |
| 42 | BR Forms (CPF/CNPJ/CEP) | `#br-forms` | Componentes |
| 43 | Hooks — estado | `#hooks-state` | Hooks |
| 44 | Hooks — DOM & timing | `#hooks-dom` | Hooks |
| 45 | Network · Clipboard · Share | `#meta` | Hooks |
| 46 | Formatters | `#utils` | Hooks |
| 47 | HTTP client | `#recipe-http` | Receitas |
| 48 | Upload resumível (tus) | `#recipe-resumable-upload` | Receitas |
| 49 | Passkeys (WebAuthn) | `#recipe-passkeys` | Receitas |
| 50 | Data fetching (TanStack Query) | `#recipe-query` | Receitas |
| 51 | Tempo real (WebSocket) | `#recipe-realtime` | Receitas |
| 52 | Geolocalização (mapas & trajetória) | `#geo` | Receitas |
| 53 | Mapa do Brasil (UF + cidades) | `#brazil-map` | Receitas |
| 54 | Pagamentos BR (Pix · boleto · NFe) | `#br-payments` | Receitas |
| 55 | Auth & Access Control | `#recipe-auth` | Receitas |
| 56 | SSE · Push · Audio | `#integrations` | Receitas |
| 57 | NotificationCenter (inbox) | `#notification-center` | Receitas |
| 58 | PWA: Install · Push | `#pwa` | Receitas |
| 59 | Store (Zustand) | `#foundation` | Fundação |
| 60 | Escalas contínuas (heatmap) | `#dataviz-scales` | Fundação |
| 61 | createTheme · presets · tokens de gráfico | `#theme-factory` | Fundação |
| 62 | Ícones por slug (/icons) | `#icons` | Fundação |
| 63 | utilities.css (camada opt-in) | `#utilities-css` | Fundação |
| 64 | Tema + i18n | `#theme-i18n` | Fundação |
<!-- /gallery -->

## Matriz de variantes

### Button

| Prop      | Valores                                      |
| --------- | -------------------------------------------- |
| `variant` | `primary` · `secondary` · `danger` · `ghost` |
| `size`    | `sm` · `md` · `lg`                           |
| Flags     | `loading`, `fullWidth`, `disabled`           |
| Slots     | `leftIcon`, `rightIcon`                      |

### Badge

| `variant` | Uso típico          |
| --------- | ------------------- |
| `neutral` | Tag genérica        |
| `success` | Pago, ativo, online |
| `warning` | Pendente, degradado |
| `danger`  | Falha, bloqueado    |
| `info`    | Em revisão, beta    |

### Modal

| Prop   | Valores                                            |
| ------ | -------------------------------------------------- |
| `size` | `sm` · `md` · `lg` · `xl`                          |
| Flags  | `closeOnBackdrop`, `closeOnEsc`, `hideCloseButton` |
| Slots  | `title`, `children` (body), `footer`               |

### Toast (via `useToast`)

| Método                                                  | Variante |
| ------------------------------------------------------- | -------- |
| `toast.success(text)`                                   | success  |
| `toast.error(text)`                                     | error    |
| `toast.warning(text)`                                   | warning  |
| `toast.info(text)`                                      | info     |
| `toast.show({ title, description, variant, duration })` | custom   |

### Table

| Coluna (`TableColumn<T>`) | Descrição                         |
| ------------------------- | --------------------------------- |
| `key`                     | identificador único               |
| `header`                  | label do cabeçalho                |
| `render(row, i)`          | célula custom; default `row[key]` |
| `align`                   | `left` · `right` · `center`       |
| `width`                   | string ou número                  |

### Spinner / Skeleton

| Spinner `size`     | Skeleton `variant`         |
| ------------------ | -------------------------- |
| `sm` · `md` · `lg` | `rect` · `text` · `circle` |

### Theme modes

| Mode     | Comportamento                                         |
| -------- | ----------------------------------------------------- |
| `light`  | força claro, ignora OS                                |
| `dark`   | força escuro, ignora OS                               |
| `system` | escuta `prefers-color-scheme`, atualiza em tempo real |

## Screenshots

Cada exemplo aparece **lado a lado com o código-fonte** (botão "Copiar"), então a
gallery é também uma referência copia-e-cola. Capturas do app rodando:

<!-- gallery:screenshots -->
Cada seção tem a própria captura ao lado do componente que documenta; os pares abaixo são aqueles em que o tema é o assunto. As 74 imagens são regeneradas por `npm run docs:shots`.

### Buttons

![Buttons — claro](assets/gallery/buttons.webp)

![Buttons — escuro](assets/gallery/buttons.dark.webp)

### Badges · Cards · Skeleton

![Badges · Cards · Skeleton — claro](assets/gallery/feedback.webp)

![Badges · Cards · Skeleton — escuro](assets/gallery/feedback.dark.webp)

### Stat · Tag · Money · Banner

![Stat · Tag · Money · Banner — claro](assets/gallery/data-display.webp)

![Stat · Tag · Money · Banner — escuro](assets/gallery/data-display.dark.webp)

### Popover · Dropdown · HoverCard

![Popover · Dropdown · HoverCard — claro](assets/gallery/overlays.webp)

![Popover · Dropdown · HoverCard — escuro](assets/gallery/overlays.dark.webp)

### DataTable

![DataTable — claro](assets/gallery/data-table.webp)

![DataTable — escuro](assets/gallery/data-table.dark.webp)

### Dashboard (CSS)

![Dashboard (CSS) — claro](assets/gallery/dashboard-layout.webp)

![Dashboard (CSS) — escuro](assets/gallery/dashboard-layout.dark.webp)

### CodeBlock

![CodeBlock — claro](assets/gallery/codeblock.webp)

![CodeBlock — escuro](assets/gallery/codeblock.dark.webp)

### Store (Zustand)

![Store (Zustand) — claro](assets/gallery/foundation.webp)

![Store (Zustand) — escuro](assets/gallery/foundation.dark.webp)

### createTheme · presets · tokens de gráfico

![createTheme · presets · tokens de gráfico — claro](assets/gallery/theme-factory.webp)

![createTheme · presets · tokens de gráfico — escuro](assets/gallery/theme-factory.dark.webp)

### Tema + i18n

![Tema + i18n — claro](assets/gallery/theme-i18n.webp)

![Tema + i18n — escuro](assets/gallery/theme-i18n.dark.webp)
<!-- /gallery -->

## Resumo

- A gallery é um app Vite + React real que consome o SDK via `file:../..` — faz
  o papel de Storybook.
- Rode com `npm run build` na raiz, depois `npm run dev` em `examples/gallery`
  (porta `5173`).
- 63 seções cobrem componentes, overlays, mídia/imagens, inputs avançados,
  DataTable, store, tema/i18n, integrações ao vivo, PWA e utils — cada exemplo
  com código copia-e-cola ao lado. A tabela acima sai do registry, então não
  envelhece.
- Cada seção tem uma captura versionada em `docs/assets/gallery/`, regenerada
  por `npm run docs:shots` e colocada nas páginas por `npm run docs:gallery`.
- Use-a pra validar UI nos breakpoints mobile e desktop antes de fechar uma
  mudança visual.

## Veja também

- [README do app gallery](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/examples/gallery/README.md)
- [Arquitetura](./architecture.md)
- [Componentes](./components.md)
