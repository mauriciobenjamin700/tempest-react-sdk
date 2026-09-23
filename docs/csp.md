# Content-Security-Policy (`tempestCsp`)

Uma Content-Security-Policy diz ao navegador de onde a página pode carregar
script, estilo, imagem — e **para onde ela pode se conectar**. É uma das defesas
mais baratas contra XSS, e todo PWA sério tem uma.

O problema é o modo como ela falha. Quando o app chama uma origem que não está no
`connect-src`, o navegador bloqueia a requisição **antes de abrir a conexão**:

- a aba **Network** não mostra request nenhum em vermelho;
- o **servidor não registra nada** — o log fica vazio;
- o app recebe `TypeError: Failed to fetch`, igual a offline, DNS errado ou CORS;
- `curl` funciona, porque `curl` não aplica CSP;
- e, como a CSP escrita à mão costuma ser um plugin `apply: "build"`, **dev
  nunca quebra**. Só produção.

O único lugar que diz o que aconteceu é o console do navegador, com o app aberto:

```text
Connecting to 'https://sso.example.com/realms/app/protocol/openid-connect/token'
violates the following Content Security Policy directive:
"connect-src 'self' https://api.example.com". The action has been blocked.
```

O `tempestCsp` fecha as duas pontas: deriva o `connect-src` das **mesmas
variáveis de ambiente que o runtime lê**, e aplica a política **também no
`vite dev`** — então uma origem esquecida quebra na sua máquina, no primeiro
reload, e não no celular do usuário semanas depois. 🚀

## O exemplo mínimo

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestCsp()],
});
```

Com este `.env`:

```text
VITE_API_URL=https://api.example.com/v1
VITE_OIDC_ISSUER=https://sso.example.com/realms/app
```

o build imprime o que entrou na política, e de onde veio:

```text
tempest-csp: connect-src 'self' blob: data: https://api.example.com https://sso.example.com wss://api.example.com wss://sso.example.com
  https://api.example.com  ← env VITE_API_URL
  https://sso.example.com  ← env VITE_OIDC_ISSUER
  wss://api.example.com  ← sockets (https://api.example.com)
  wss://sso.example.com  ← sockets (https://sso.example.com)
```

E o `dist/index.html` sai com a `<meta http-equiv="Content-Security-Policy">`
logo depois do `<meta charset>`, antes de qualquer script.

!!! tip "O scaffold já vem assim"
    `create-tempest-app` (com ou sem `--pwa`) já liga `tempestCsp()` no
    `vite.config.ts`. Você só precisa manter as origens no `.env`.

## De onde vêm as origens

### Do `.env` (o padrão)

Por padrão (`env: true`), toda variável que o Vite expõe em `import.meta.env` — as
do `envPrefix`, `VITE_` por default — **cujo valor é uma URL absoluta
`http(s)`/`ws(s)`** entra no `connect-src`. Chave VAPID, flag e texto são
ignorados, porque não são URL.

Essa é a ponte estrutural: adicionar `VITE_OIDC_ISSUER` para uma chamada nova já
coloca a origem na política. Não existe segunda lista para esquecer.

Prefere ser explícito? Passe os nomes. Um nome que não resolve vira **aviso no
build**, em vez de sumir calado:

```ts
// vite.config.ts
import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";

export default createViteConfig({
    plugins: [tempestCsp({ env: ["VITE_API_URL", "VITE_OIDC_ISSUER"] })],
});
```

### De `connect` (URL literal)

Para uma origem que não vem do `.env`:

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

Três regras valem para `connect` e para o `.env`:

- **Origem, não URL.** `https://sso.example.com/realms/app` entra como
  `https://sso.example.com`. Uma fonte com caminho casa **só aquele caminho**, e a
  chamada para `/realms/app/protocol/openid-connect/token` seria bloqueada igual.
- **Valor vazio some.** `undefined`, `null`, `false` e `""` não viram buraco na
  diretiva: são pulados com um aviso no build.
- **Valor inválido derruba o build.** `api.example.com` (sem esquema) lança erro
  no `vite build` — falha na sua máquina, não em produção. Caminho relativo
  (`/api`) é mesma origem e já está coberto por `'self'`.

!!! warning "Fallback literal no código não aparece"
    `import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"` chama uma origem que
    **não está no `.env`**. Se a variável não estiver definida, o plugin não tem
    como saber do fallback — e o `vite dev` vai mostrar o bloqueio no console.
    Crie o `.env` (`cp .env.example .env`) ou liste a origem em `connect`.

### Origens que o próprio SDK chama

O `useViaCEP` chama `https://viacep.com.br`. No build, essa origem entra **só se o
hook estiver no bundle**; no dev, sempre (o dev server ainda não conhece o grafo
de módulos quando serve o `index.html`).

## WebSocket: o gêmeo `wss:` de cada origem

Medido no Chromium (Playwright, 23/09/2026) com uma página de `<meta>` CSP que
tenta cada conexão e escuta `securitypolicyviolation`:

| Política | Chamada | Resultado |
| --- | --- | --- |
| `connect-src 'self' https://example.com` | `new WebSocket("wss://example.com")` | **bloqueado** |
| `connect-src 'self'` | `new WebSocket("ws://<mesma origem>")` | permitido |

Ou seja: `https://api` **não** cobre `wss://api`. App que deriva a URL do socket
da URL da API quebraria. Por isso, com `sockets: true` (o padrão), cada origem
`http(s)` ganha o gêmeo `ws(s)`. Desligue com `sockets: false`.

O HMR do `vite dev` usa a mesma origem da página e fica coberto por `'self'`. Se
você mudou `server.hmr` para outra porta, adicione a origem dele em
`directives: { "connect-src": [...] }`.

## Os defaults, e o motivo de cada um

| Diretiva | Valor | Por quê |
| --- | --- | --- |
| `default-src` | `'self'` | base de tudo |
| `script-src` | `'self' 'wasm-unsafe-eval'` | ONNX Runtime (`/vision`, `/tabular`) compila WebAssembly; sem isso, `WebAssembly.compile` lança `CompileError` |
| `style-src` | `'self' 'unsafe-inline'` | o `applyTheme` injeta um `<style>` |
| `img-src` | `'self' data: blob:` | preview de imagem por object URL |
| `font-src` | `'self' data:` | fonte embutida |
| `media-src` | `'self' blob:` | áudio/vídeo gravado |
| `connect-src` | `'self' blob: data:` + origens | `decodeImage` aceita URL `blob:`/`data:` |
| `worker-src` | `'self' blob:` | service worker e worker por `blob:` |
| `manifest-src` | `'self'` | web manifest do PWA |
| `object-src` | `'none'` | nenhum plugin |
| `base-uri`, `form-action` | `'self'` | impedem desvio de `<base>` e de formulário |

!!! info "A prop `style` do React **não** precisa de `'unsafe-inline'`"
    Na mesma medição, `element.style.color = "…"` (que é o que o React faz com a
    prop `style`) passou com `style-src 'self'`: CSSOM não é governado por CSP. O
    que é bloqueado é elemento `<style>` e atributo `style=""`. Se o app nunca
    chama `applyTheme`, passe `inlineStyles: false` e o `style-src` fica
    `'self'` — os `<style>` inline do `index.html` passam a entrar por hash. No
    `vite dev` o `'unsafe-inline'` de estilo continua, porque é assim que o Vite
    injeta CSS.

Ajuste qualquer diretiva com `directives`: um array **soma** fontes, `false`
**remove** a diretiva.

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

## Script inline entra por hash

Um `<script>` inline no `index.html` — o anti-flash do `themeInitScript()`, por
exemplo — é liberado pelo **SHA-256 do conteúdo**, nunca por `'unsafe-inline'`. O
plugin roda como transform `post`, então enxerga o HTML final. No dev, o preâmbulo
do React Refresh entra do mesmo jeito.

!!! note
    Um plugin que reescreva script inline **depois** do `tempestCsp` invalida o
    hash. Deixe-o por último no `plugins`.

## O app já tinha uma CSP

Se o `index.html` já declara uma `<meta http-equiv="Content-Security-Policy">`, o
plugin **mescla, não sobrescreve**:

- toda diretiva que o app declarou fica **exatamente como está** — o plugin nunca
  afrouxa uma escolha que você escreveu;
- a exceção é o `connect-src`, que **ganha** as origens resolvidas (é a lista que
  o plugin existe para manter);
- diretivas que o app não declarou vêm dos defaults.

Duas `<meta>` de CSP na mesma página derrubam o build: o navegador aplica a
**interseção** das duas, e juntá-las numa só afrouxaria a política.

## Header HTTP: `frame-ancestors` e companhia

`frame-ancestors`, `report-uri` e `sandbox` são **ignorados** quando a política
chega por `<meta>`. Declare-os em `directives` e eles vão só para `header`, que
você recebe em `onPolicy` para escrever no servidor (nginx, `_headers`, …):

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

## Referência das opções

| Opção | Tipo | Padrão | O que faz |
| --- | --- | --- | --- |
| `connect` | `(string \| null \| undefined \| false)[]` | `[]` | URLs chamadas em runtime; entra só a origem |
| `env` | `boolean \| string[]` | `true` | lê as origens do `import.meta.env` |
| `sockets` | `boolean` | `true` | adiciona o gêmeo `ws(s)` de cada origem `http(s)` |
| `wasm` | `boolean` | `true` | `'wasm-unsafe-eval'` em `script-src` |
| `inlineStyles` | `boolean` | `true` | `'unsafe-inline'` em `style-src` (sempre no dev) |
| `directives` | `Record<string, string[] \| false>` | `{}` | soma fontes ou remove diretivas |
| `dev` | `boolean` | `true` | aplica a política também no `vite dev` |
| `log` | `boolean` | `true` | imprime o `connect-src` e a origem de cada entrada |
| `onPolicy` | `(policy) => void` | — | recebe `meta`, `header`, `directives`, `connect` e `command` |

## Recap

- Origem que o app chama em runtime **precisa** estar no `connect-src`; quando
  falta, o sintoma é `TypeError: Failed to fetch` sem request na Network.
- `tempestCsp()` lê as origens do `.env`, reduz a origem, pula vazio e derruba o
  build em valor inválido.
- A política vale **no dev também** — o erro aparece na sua máquina.
- `https://api` não cobre `wss://api`; o gêmeo entra sozinho.
- CSP que o app já tinha é mesclada, nunca afrouxada.
- ✅ O build imprime cada origem e de onde ela veio.
