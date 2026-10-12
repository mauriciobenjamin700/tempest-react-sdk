# Content-Security-Policy (`tempestCsp`)

A Content-Security-Policy tells the browser where the page may load scripts,
styles and images from — and **where it may connect to**. It is one of the
cheapest defences against XSS, and every serious PWA has one.

The problem is how it fails. When the app calls an origin missing from
`connect-src`, the browser blocks the request **before a connection opens**:

- the **Network** tab shows no red request;
- the **server logs nothing**;
- the app gets `TypeError: Failed to fetch`, the same as offline, bad DNS or CORS;
- `curl` works, because `curl` does not enforce CSP;
- and since a hand-written CSP is usually an `apply: "build"` plugin, **dev never
  breaks**. Only production does.

The only place that tells you what happened is the browser console, with the app
open:

```text
Connecting to 'https://sso.example.com/realms/app/protocol/openid-connect/token'
violates the following Content Security Policy directive:
"connect-src 'self' https://api.example.com". The action has been blocked.
```

`tempestCsp` closes both ends: it derives `connect-src` from **the same
environment variables the runtime reads**, and enforces the policy **under
`vite dev` too** — so a forgotten origin breaks on your machine on the first
reload, not on a user's phone weeks later. 🚀

## The minimal example

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestCsp()],
});
```

With this `.env`:

```text
VITE_API_URL=https://api.example.com/v1
VITE_OIDC_ISSUER=https://sso.example.com/realms/app
```

the build prints what entered the policy, and where it came from:

```text
tempest-csp: connect-src 'self' blob: data: https://api.example.com https://sso.example.com wss://api.example.com wss://sso.example.com
  https://api.example.com  ← env VITE_API_URL
  https://sso.example.com  ← env VITE_OIDC_ISSUER
  wss://api.example.com  ← sockets (https://api.example.com)
  wss://sso.example.com  ← sockets (https://sso.example.com)
```

And `dist/index.html` ships the `<meta http-equiv="Content-Security-Policy">`
right after `<meta charset>`, before any script.

!!! tip "The scaffold already does this"
    `create-tempest-app` (with or without `--pwa`) wires `tempestCsp()` into
    `vite.config.ts`. You only need to keep the origins in `.env`.

## Where the origins come from

### From `.env` (the default)

By default (`env: true`), every variable Vite exposes on `import.meta.env` — the
`envPrefix` ones, `VITE_` by default — **whose value is an absolute
`http(s)`/`ws(s)` URL** enters `connect-src`. VAPID keys, flags and text are
ignored, because they are not URLs.

That is the structural bridge: adding `VITE_OIDC_ISSUER` for a new call already
puts the origin in the policy. There is no second list to forget.

Rather be explicit? Pass the names. A name that resolves to nothing becomes a
**build warning** instead of silently vanishing:

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestCsp({ env: ["VITE_API_URL", "VITE_OIDC_ISSUER"] })],
});
```

### From `connect` (a literal URL)

For an origin that does not come from `.env`:

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [
        tempestCsp({
            connect: ["https://uploads.example.com/files/", "wss://realtime.example.com/socket"],
        }),
    ],
});
```

Three rules apply to `connect` and to `.env` alike:

- **Origin, not URL.** `https://sso.example.com/realms/app` enters as
  `https://sso.example.com`. A source with a path matches **that path only**, and
  the call to `/realms/app/protocol/openid-connect/token` would be blocked anyway.
- **Empty values vanish.** `undefined`, `null`, `false` and `""` do not leave a
  hole in the directive: they are skipped with a build warning.
- **Invalid values fail the build.** `api.example.com` (no scheme) throws during
  `vite build` — it fails on your machine, not in production. A relative path
  (`/api`) is same-origin and already covered by `'self'`.

!!! warning "A literal fallback in code is invisible"
    `import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"` calls an origin that
    **is not in `.env`**. When the variable is unset, the plugin cannot know about
    the fallback — and `vite dev` will show the block in the console. Create the
    `.env` (`cp .env.example .env`) or list the origin in `connect`.

### Origins the SDK itself calls

`useViaCEP` calls `https://viacep.com.br`. In a build that origin enters **only if
the hook is in the bundle**; in dev, always (the dev server does not know the
module graph yet when it serves `index.html`).

## WebSocket: the `wss:` twin of each origin

Measured in Chromium (Playwright, 23/09/2026) with a `<meta>` CSP page that tries
each connection and listens for `securitypolicyviolation`:

| Policy | Call | Result |
| --- | --- | --- |
| `connect-src 'self' https://example.com` | `new WebSocket("wss://example.com")` | **blocked** |
| `connect-src 'self'` | `new WebSocket("ws://<same origin>")` | allowed |

So `https://api` does **not** cover `wss://api`. An app that derives its socket
URL from the API URL would break. That is why, with `sockets: true` (the
default), every `http(s)` origin gets its `ws(s)` twin. Turn it off with
`sockets: false`.

`vite dev`'s HMR uses the page's own origin and is covered by `'self'`. If you
moved `server.hmr` to another port, add its origin under
`directives: { "connect-src": [...] }`.

## The defaults, and why each one

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | the baseline |
| `script-src` | `'self' 'wasm-unsafe-eval'` | ONNX Runtime (`/vision`, `/tabular`) compiles WebAssembly; without it `WebAssembly.compile` throws `CompileError` |
| `style-src` | `'self' 'unsafe-inline'` | `applyTheme` injects a `<style>` |
| `img-src` | `'self' data: blob:` | image previews through object URLs |
| `font-src` | `'self' data:` | embedded fonts |
| `media-src` | `'self' blob:` | recorded audio/video |
| `connect-src` | `'self' blob: data:` + origins | `decodeImage` accepts `blob:`/`data:` URLs |
| `worker-src` | `'self' blob:` | the service worker and `blob:` workers |
| `manifest-src` | `'self'` | the PWA web manifest |
| `object-src` | `'none'` | no plugins |
| `base-uri`, `form-action` | `'self'` | stop `<base>` and form hijacking |

!!! info "React's `style` prop does **not** need `'unsafe-inline'`"
    In the same measurement, `element.style.color = "…"` (what React does with the
    `style` prop) passed under `style-src 'self'`: the CSSOM is not governed by
    CSP. What gets blocked is a `<style>` element and a `style=""` attribute. If
    the app never calls `applyTheme`, pass `inlineStyles: false` and `style-src`
    stays `'self'` — inline `<style>` blocks in `index.html` then enter by hash.
    Under `vite dev` the style `'unsafe-inline'` stays, because that is how Vite
    injects CSS.

Tune any directive with `directives`: an array **adds** sources, `false`
**removes** the directive.

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [
        tempestCsp({
            directives: {
                "img-src": ["https://tiles.example.com"],
                "frame-src": ["https://www.youtube.com"],
            },
        }),
    ],
});
```

## Inline scripts enter by hash

An inline `<script>` in `index.html` — the `themeInitScript()` anti-flash script,
say — is allowed by the **SHA-256 of its content**, never by `'unsafe-inline'`.
The plugin runs as a `post` transform, so it sees the final HTML. In dev, the
React Refresh preamble is allowed the same way.

!!! note
    A plugin that rewrites inline scripts **after** `tempestCsp` invalidates the
    hash. Keep it last in `plugins`.

## The app already had a CSP

If `index.html` already declares a `<meta http-equiv="Content-Security-Policy">`,
the plugin **merges, it does not overwrite**:

the result is never more permissive than the policy you wrote. Each directive
falls into one of these rows:

| The directive in your `<meta>` | What the plugin emits | Example |
| --- | --- | --- |
| declared | **exactly as written**; sources in `directives` for it are **not** added and become a build warning; `false` in `directives` removes it (removing is your explicit choice) | `script-src 'self'` stays `script-src 'self'`, no hash, no `'wasm-unsafe-eval'` |
| `connect-src` declared | your value **+** the resolved origins; with a list that matches nothing — `'none'` in any letter case (`'NONE'` too) or an empty one —, declared or inherited from `default-src`, nothing is added and the build warns about each origin left out | `connect-src 'self'` → `connect-src 'self' https://api.example.com` |
| not declared, but inherited through the CSP3 fallback chain (`img-src` → `default-src`; `worker-src` → `child-src` → `script-src` → `default-src`) | **nothing** — it keeps falling back to the inherited value | with `default-src 'none'`, no `img-src 'self' data: blob:` appears |
| `connect-src` inherited | the inherited value **+** the resolved origins; nothing when there is no origin | `default-src 'self'` → `connect-src 'self' https://api.example.com` |
| inherited, with sources in `directives` | the inherited value **+** the `directives` sources | `default-src 'self'` + `{ "img-src": ["https://tiles.example.com"] }` → `img-src 'self' https://tiles.example.com` |
| inherited, with a `'none'` default (`object-src`) | the default, which only restricts | `object-src 'none'` |
| no fallback (`base-uri`, `form-action`) | the default, which only restricts | `base-uri 'self'` |
| nothing in your `<meta>` governs it | the default | without `default-src`, `img-src` comes out as `'self' data: blob:` |

!!! warning "Inheriting from `default-src` turns off what the default allowed"
    With `default-src 'self'` and no `script-src`, the `'wasm-unsafe-eval'` that
    `/vision` needs and the inline-script hash are **not** added: they would loosen
    your policy. An inline `<script>` your policy blocks — judged by
    `script-src-elem` when you declare it, since that is what governs `<script>` — becomes a **build
    warning**, with the hash ready to paste into `script-src`. If the app needs
    WebAssembly, declare the directive in the `<meta>` or pass the sources in
    `directives` — for example `directives: { "script-src": ["'wasm-unsafe-eval'"] }`.
    The build cannot see the `<style>` that `applyTheme` injects at runtime: with
    a `default-src` lacking `'unsafe-inline'`, declare a `style-src` that allows it.

Two CSP `<meta>` tags on the same page fail the build: the browser enforces the
**intersection** of both, and merging them into one would loosen the policy.

## HTTP header: `frame-ancestors` and friends

`frame-ancestors`, `report-uri` and `sandbox` are **ignored** when the policy
arrives by `<meta>`. Declare them in `directives` and they go to `header` only,
which you receive in `onPolicy` to write into the server (nginx, `_headers`, …):

```ts
// vite.config.ts
import { writeFileSync } from "node:fs";
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [
        tempestCsp({
            directives: { "frame-ancestors": ["'none'"] },
            onPolicy: (policy) => {
                if (policy.command === "build") writeFileSync("dist/csp-header.txt", policy.header);
            },
        }),
    ],
});
```

## Options reference

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `connect` | `(string \| null \| undefined \| false)[]` | `[]` | URLs called at runtime; only the origin enters |
| `env` | `boolean \| string[]` | `true` | reads origins from `import.meta.env` |
| `sockets` | `boolean` | `true` | adds the `ws(s)` twin of each `http(s)` origin |
| `wasm` | `boolean` | `true` | `'wasm-unsafe-eval'` in `script-src` |
| `inlineStyles` | `boolean` | `true` | `'unsafe-inline'` in `style-src` (always in dev) |
| `directives` | `Record<string, string[] \| false>` | `{}` | adds sources or removes directives |
| `dev` | `boolean` | `true` | enforces the policy under `vite dev` too |
| `log` | `boolean` | `true` | prints `connect-src` and the source of each entry |
| `onPolicy` | `(policy) => void` | — | receives `meta`, `header`, `directives`, `connect` and `command` |

## Recap

- An origin the app calls at runtime **must** be in `connect-src`; when it is
  missing, the symptom is `TypeError: Failed to fetch` with no request in Network.
- `tempestCsp()` reads origins from `.env`, reduces them to the origin, skips
  empty values and fails the build on invalid ones.
- The policy applies **in dev too** — the error shows up on your machine.
- `https://api` does not cover `wss://api`; the twin is added for you.
- A CSP the app already had is merged, never loosened.
- ✅ The build prints each origin and where it came from.
