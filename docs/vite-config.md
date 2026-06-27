# Vite Config

Todo app frontend Tempest começa com o mesmo `vite.config.ts`: o plugin React, o
alias `@` → `src` e os defaults do dev server. Copiar esse bloco de app em app é
chato, fácil de errar e diverge com o tempo. O helper `createViteConfig` mata esse
boilerplate: você chama uma função, recebe um objeto de config pronto e atribui
direto ao `export default`.

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: { "/api": "http://127.0.0.1:8000" },
});
```

Pronto. Plugin React ligado, `@` resolvendo pra `src`, dev server escutando em
`127.0.0.1:5173` e as chamadas pra `/api` indo pro seu backend local. Tudo isso
em quatro linhas.

## O subpath `tempest-react-sdk/vite`

Repare no import: ele vem de `tempest-react-sdk/vite`, **não** do barrel principal
`tempest-react-sdk`.

```ts
import { createViteConfig } from "tempest-react-sdk/vite";
```

!!! info "Por que um subpath separado?"
    O barrel principal roda no **navegador** (componentes React, hooks). Já o
    `createViteConfig` roda no **Node**, dentro do `vite.config.ts`, durante o
    build. São ambientes diferentes, então o helper mora num subpath dedicado pra
    nunca arrastar código de config pro seu bundle de produção.

### Peer deps

`vite` e `@vitejs/plugin-react` são **peer dependencies opcionais** do SDK. Como
todo app Vite já tem os dois no `devDependencies`, não há nada extra pra instalar
— o helper apenas os reutiliza.

## O exemplo mínimo

Sem nenhuma opção, você ainda ganha os defaults completos:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

Isso te dá:

| Default       | Valor         |
| ------------- | ------------- |
| Plugin React  | ligado        |
| Alias `@`     | → `src`       |
| `server.port` | `5173`        |
| `server.host` | `"127.0.0.1"` |
| `server.open` | `false`       |

## O alias `@` (e o tsconfig que precisa acompanhar)

O default mais útil é o alias `@`: ele aponta pro seu diretório de fontes, então
`@/components/Button` resolve pra `<raiz>/src/components/Button`. Chega de
`../../../components/Button`.

```ts
// src/main.tsx
import { Button } from "@/components/Button";
import { formatBRL } from "@/utils/money";
```

O caminho de origem é resolvido contra `process.cwd()` (a raiz do projeto, de onde
o Vite roda). Quer aliasar outra pasta? Use `srcDir`:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  srcDir: "app", // agora @ → <raiz>/app
});
```

!!! warning "O alias `@` também precisa estar no `tsconfig.json`"
    O Vite e o TypeScript resolvem caminhos de forma **independente**. O
    `createViteConfig` ensina o Vite a resolver `@`, mas o type-checker não sabe
    de nada até você declarar o mesmo alias em `compilerOptions.paths`. Sem isso, o
    `tsc` vai reclamar de "Cannot find module '@/...'" mesmo com o app rodando.

    ```jsonc
    // tsconfig.json — mantenha o alias @ em sincronia com o type-checker
    {
      "compilerOptions": {
        "paths": { "@/*": ["./src/*"] }
      }
    }
    ```

    Se você mudar o `srcDir`, mude o `paths` junto (ex.: `"@/*": ["./app/*"]`).

## Proxy: atalho de string vs. objeto

A opção `proxy` aceita dois formatos. Valores **string** são o atalho mais comum:
você passa só a URL de destino e o helper expande automaticamente pra
`{ target, changeOrigin: true }`.

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: { "/api": "http://127.0.0.1:8000" },
});
// vira { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } }
```

Precisa de controle fino (rewrite de path, websocket, headers)? Passe um **objeto**
— ele segue cru como `ProxyOptions` do Vite, sem nenhuma mágica:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: {
    "/api": "http://127.0.0.1:8000", // atalho string
    "/ws": {
      target: "ws://127.0.0.1:8000", // objeto cru
      ws: true,
      changeOrigin: true,
    },
  },
});
```

!!! tip "Misture os dois à vontade"
    Cada chave do `proxy` é tratada de forma independente: strings são expandidas,
    objetos passam direto. Use o atalho onde der e o objeto onde precisar.

## O escape hatch: `overrides`

Os defaults cobrem a maioria dos apps, mas nenhum helper antecipa tudo. A opção
`overrides` recebe um `UserConfig` arbitrário do Vite e faz **deep-merge por
último**, depois de tudo o que o helper montou.

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  srcDir: "app",
  port: 3000,
  alias: { "~": "/lib" },
  overrides: { build: { target: "es2020" } },
});
```

!!! note "Merge, não substituição"
    Em `overrides`, as chaves `plugins`, `resolve` e `server` são **mescladas** com
    o que o helper já configurou — não sobrescritas. Então um `overrides.server`
    com uma chave nova convive com o `port`/`host` que você passou nas opções de
    primeiro nível, e `overrides.plugins` são acrescentados aos seus. O resto do
    `UserConfig` (`build`, `define`, etc.) entra normalmente.

## Referência das opções

Todas as opções são opcionais.

| Opção       | Tipo                               | Default       | O que faz                                                                          |
| ----------- | ---------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `srcDir`    | `string`                           | `"src"`       | Diretório aliasado pra `@`, resolvido contra `process.cwd()`.                      |
| `port`      | `number`                           | `5173`        | Porta do dev server.                                                               |
| `host`      | `string \| boolean`                | `"127.0.0.1"` | Host do dev server.                                                                |
| `open`      | `boolean`                          | `false`       | Abre o navegador ao iniciar o dev.                                                 |
| `proxy`     | `Record<string, string \| object>` | —             | Proxy do dev. Strings viram `{ target, changeOrigin: true }`; objetos passam crus. |
| `alias`     | `Record<string, string>`           | —             | Aliases extras mesclados por cima do `@` default.                                  |
| `plugins`   | `unknown[]`                        | —             | Plugins Vite acrescentados depois do plugin React.                                 |
| `overrides` | `Record<string, unknown>`          | —             | `UserConfig` arbitrário com deep-merge por último.                                 |

## Recap

- Importe `createViteConfig` de **`tempest-react-sdk/vite`** — subpath dedicado de
  Node, separado do barrel do navegador.
- Chame e atribua: `export default createViteConfig({ ... })`. Sem opções, você já
  ganha o plugin React, o alias `@` → `src` e o dev server em `127.0.0.1:5173`.
- Declare **também** o alias `@` no `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
  — Vite e TS resolvem caminhos de forma independente.
- No `proxy`, strings são atalho (`{ target, changeOrigin: true }`); objetos passam
  crus como `ProxyOptions`.
- `overrides` é o escape hatch: deep-merge por último, mesclando `plugins`/`resolve`/`server`
  em vez de substituí-los.
