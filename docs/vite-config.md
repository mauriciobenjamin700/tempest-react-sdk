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

Só o `createViteConfig` precisa do `@vitejs/plugin-react`, e ele só o carrega
quando a config é montada. Os outros helpers deste subpath (`tempestVitest`,
`tempestCsp`, `tempestStyles`, …) funcionam sem ele — numa lib, ou num app com
`@vitejs/plugin-react-swc`. Até a 0.73.0 importar qualquer um deles exigia o
plugin React instalado (`ERR_MODULE_NOT_FOUND`,
[#401](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/401)).

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
| `tempestVitest()` | ligado    |
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

## Testes com Vitest

Cada componente do SDK importa a própria folha de estilo. No app, quem resolve esse
import é o Vite. Numa suíte Vitest, não: o Vitest entrega ao **Node** todo pacote
ESM que vem de `node_modules`, e o Node não sabe carregar `.css`. Qualquer teste que
importe o SDK cai antes de rodar:

```text
TypeError: Unknown file extension ".css" for …/node_modules/tempest-react-sdk/dist/styles/component/Accordion.css
```

Se o seu `vite.config.ts` é o `createViteConfig`, **não há nada a fazer**: ele já
inclui o `tempestVitest()`, que manda o Vitest transformar o SDK pelo pipeline do
Vite, como o app faz. Fora do Vitest o plugin é inerte — o Vite ignora a chave
`test`.

Com um `vitest.config.ts` próprio, adicione o plugin:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { tempestVitest } from "tempest-react-sdk/vite";

export default defineConfig({
  plugins: [tempestVitest()],
  test: { environment: "jsdom" },
});
```

Medido com `tempest-react-sdk@0.70.0` e um teste de uma linha que importa `Button`
(o repro da [#397](https://github.com/mauriciobenjamin700/tempest-react-sdk/issues/397)):

| Vitest | config default                        | com `tempestVitest()` |
| ------ | ------------------------------------- | --------------------- |
| 2.1.9  | ❌ `Unknown file extension ".css"`    | ✅ 1 passed           |
| 3.2.7  | ❌ `Unknown file extension ".css"`    | ✅ 1 passed           |
| 4.1.11 | ❌ `Unknown file extension ".css"`    | ✅ 1 passed           |

!!! info "O que o plugin faz por baixo"
    Ele acrescenta `"tempest-react-sdk"` a `test.server.deps.inline`, somando à
    lista que você já tiver. Se a sua config já usa `inline: true` (inline de
    tudo), o plugin não mexe — juntar os dois quebraria o Vitest 4 com
    `ex.test is not a function`.

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


!!! tip "Content-Security-Policy"
    O `tempestCsp()` mora no mesmo subpath e deriva o `connect-src` das variáveis
    `VITE_*` que o app lê em runtime. Veja [Content-Security-Policy](csp.md).

## Recap

- Importe `createViteConfig` de **`tempest-react-sdk/vite`** — subpath dedicado de
  Node, separado do barrel do navegador.
- Chame e atribua: `export default createViteConfig({ ... })`. Sem opções, você já
  ganha o plugin React, o alias `@` → `src` e o dev server em `127.0.0.1:5173`.
- Declare **também** o alias `@` no `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
  — Vite e TS resolvem caminhos de forma independente.
- No `proxy`, strings são atalho (`{ target, changeOrigin: true }`); objetos passam
  crus como `ProxyOptions`.
- Numa suíte Vitest, o `tempestVitest()` (já incluso) faz o SDK importar sem
  `Unknown file extension ".css"`; com `vitest.config.ts` próprio, adicione-o.
- `overrides` é o escape hatch: deep-merge por último, mesclando `plugins`/`resolve`/`server`
  em vez de substituí-los.
