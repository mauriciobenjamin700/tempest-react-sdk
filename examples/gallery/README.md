# Gallery — tempest-react-sdk

App Vite + React que consome o SDK via `file:../..` e renderiza todas as features em uma só página.

## Rodar

A partir da raiz do repo:

```bash
# 1) gerar o build do SDK (só na primeira vez ou após mudanças)
npm run build

# 2) instalar dependências da gallery
cd examples/gallery
npm install

# 3) abrir em http://127.0.0.1:5173
npm run dev
```

## Seções

- **Buttons** — variants, tamanhos, loading.
- **Form fields** — Input, Select, Textarea, SearchBar com erro/helper.
- **Badges, Cards, Skeleton** — feedback visual.
- **Modal & Toast** — portal + lock de scroll + ConfirmDialog.
- **Table & Pagination** — busca debounced + paginação + EmptyState/ErrorState.
- **Forms (zod)** — `useZodForm` + `react-hook-form`.
- **Tema + i18n** — toggle de modo e idioma persistido.
- **SSE, Push, Audio** — integrações vivas (SSE conecta em sse.dev).
- **Utils** — máscaras e formatação PT-BR.

## Estrutura

```text
examples/gallery/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── App.tsx              shell + nav + ordering das seções
    ├── main.tsx             providers (Theme, i18n, Query, Toast, ErrorBoundary)
    ├── gallery.css          layout local
    └── sections/
        ├── ButtonsSection.tsx
        ├── FeedbackSection.tsx
        ├── FormFieldsSection.tsx
        ├── FormsSection.tsx
        ├── IntegrationsSection.tsx
        ├── ModalSection.tsx
        ├── TableSection.tsx
        ├── ThemeI18nSection.tsx
        └── UtilsSection.tsx
```
