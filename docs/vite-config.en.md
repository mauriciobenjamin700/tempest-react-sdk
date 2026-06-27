# Vite Config

Every Tempest frontend app starts with the same `vite.config.ts`: the React
plugin, the `@` → `src` alias, and the dev-server defaults. Copying that block
from app to app is tedious, easy to get wrong, and drifts over time. The
`createViteConfig` helper kills that boilerplate: you call one function, get a
ready-made config object back, and assign it straight to `export default`.

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: { "/api": "http://127.0.0.1:8000" },
});
```

That's it. React plugin wired, `@` resolving to `src`, dev server listening on
`127.0.0.1:5173`, and `/api` calls forwarded to your local backend — all in four
lines.

## The `tempest-react-sdk/vite` subpath

Look at the import: it comes from `tempest-react-sdk/vite`, **not** the main
barrel `tempest-react-sdk`.

```ts
import { createViteConfig } from "tempest-react-sdk/vite";
```

!!! info "Why a separate subpath?"
The main barrel runs in the **browser** (React components, hooks). But
`createViteConfig` runs in **Node**, inside `vite.config.ts`, during the
build. Different environments — so the helper lives in a dedicated subpath, to
never drag config code into your production bundle.

### Peer deps

`vite` and `@vitejs/plugin-react` are **optional peer dependencies** of the SDK.
Since every Vite app already has both in its `devDependencies`, there's nothing
extra to install — the helper just reuses them.

## The minimal example

With no options at all, you still get the full defaults:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

That gives you:

| Default       | Value         |
| ------------- | ------------- |
| React plugin  | enabled       |
| `@` alias     | → `src`       |
| `server.port` | `5173`        |
| `server.host` | `"127.0.0.1"` |
| `server.open` | `false`       |

## The `@` alias (and the tsconfig that must follow)

The most useful default is the `@` alias: it points at your source directory, so
`@/components/Button` resolves to `<root>/src/components/Button`. No more
`../../../components/Button`.

```ts
// src/main.tsx
import { Button } from "@/components/Button";
import { formatBRL } from "@/utils/money";
```

The source path is resolved against `process.cwd()` (the project root, where Vite
runs from). Want to alias a different folder? Use `srcDir`:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  srcDir: "app", // now @ → <root>/app
});
```

!!! warning "The `@` alias must ALSO live in `tsconfig.json`"
Vite and TypeScript resolve paths **independently**. `createViteConfig` teaches
Vite to resolve `@`, but the type-checker knows nothing until you declare the
same alias in `compilerOptions.paths`. Without it, `tsc` complains "Cannot find
module '@/...'" even though the app runs fine.

    ```jsonc
    // tsconfig.json — keep the @ alias in sync for the type-checker
    {
      "compilerOptions": {
        "paths": { "@/*": ["./src/*"] }
      }
    }
    ```

    If you change `srcDir`, change `paths` too (e.g. `"@/*": ["./app/*"]`).

## Proxy: string shorthand vs. object

The `proxy` option accepts two shapes. **String** values are the common shorthand:
you pass just the target URL and the helper auto-expands it to
`{ target, changeOrigin: true }`.

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: { "/api": "http://127.0.0.1:8000" },
});
// becomes { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } }
```

Need fine control (path rewrite, websocket, headers)? Pass an **object** — it
passes through raw as Vite's `ProxyOptions`, with no magic:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig({
  proxy: {
    "/api": "http://127.0.0.1:8000", // string shorthand
    "/ws": {
      target: "ws://127.0.0.1:8000", // raw object
      ws: true,
      changeOrigin: true,
    },
  },
});
```

!!! tip "Mix the two freely"
Each `proxy` key is handled independently: strings are expanded, objects pass
through. Use the shorthand where you can and the object where you must.

## The escape hatch: `overrides`

The defaults cover most apps, but no helper anticipates everything. The
`overrides` option takes an arbitrary Vite `UserConfig` and **deep-merges it
last**, after everything the helper built.

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

!!! note "Merged, not replaced"
In `overrides`, the keys `plugins`, `resolve`, and `server` are **merged** with
what the helper already configured — not overwritten. So an `overrides.server`
with a new key coexists with the `port`/`host` you passed as top-level options,
and `overrides.plugins` are appended to yours. The rest of the `UserConfig`
(`build`, `define`, etc.) applies normally.

## Options reference

All options are optional.

| Option      | Type                               | Default       | What it does                                                                          |
| ----------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `srcDir`    | `string`                           | `"src"`       | Directory aliased to `@`, resolved against `process.cwd()`.                           |
| `port`      | `number`                           | `5173`        | Dev-server port.                                                                      |
| `host`      | `string \| boolean`                | `"127.0.0.1"` | Dev-server host.                                                                      |
| `open`      | `boolean`                          | `false`       | Open the browser on dev start.                                                        |
| `proxy`     | `Record<string, string \| object>` | —             | Dev proxy. Strings become `{ target, changeOrigin: true }`; objects pass through raw. |
| `alias`     | `Record<string, string>`           | —             | Extra aliases merged on top of the default `@`.                                       |
| `plugins`   | `unknown[]`                        | —             | Vite plugins appended after the React plugin.                                         |
| `overrides` | `Record<string, unknown>`          | —             | Arbitrary `UserConfig` deep-merged last.                                              |

## Recap

- Import `createViteConfig` from **`tempest-react-sdk/vite`** — the dedicated Node
  subpath, separate from the browser barrel.
- Call and assign: `export default createViteConfig({ ... })`. With no options you
  already get the React plugin, the `@` → `src` alias, and a dev server on
  `127.0.0.1:5173`.
- **Also** declare the `@` alias in `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
  — Vite and TS resolve paths independently.
- In `proxy`, strings are shorthand (`{ target, changeOrigin: true }`); objects pass
  through raw as `ProxyOptions`.
- `overrides` is the escape hatch: deep-merged last, merging `plugins`/`resolve`/`server`
  instead of replacing them.
