# CLI `tempest`

Além da CLI de scaffolding [`create-tempest-app`](./scaffold.md), o pacote
`tempest-react-sdk` instala um segundo `bin` — **`tempest`** — pra cuidar da
saúde e da higiene do seu projeto no dia a dia: um **doctor** (no estilo do
`flutter doctor`) e um **fix/lint/format** que organiza imports, remove imports
mortos e arruma espaçamento.

Como ele vem dentro do SDK, está disponível assim que você instala a lib — rode
com `npx tempest <comando>` ou pelos scripts `npm run doctor` / `npm run fix`
que o scaffold já cria.

## `tempest doctor`

Faz um diagnóstico do projeto atual e imprime um relatório `[✓] / [!] / [✗]`
**agrupado por seção** (estilo `flutter doctor`) — inclusive **problemas
silenciosos** que não quebram o build mas explodem em runtime ou drenam horas de
depuração:

```bash
npx tempest doctor
```

```text
tempest doctor (/caminho/do/seu/app)

Environment
  [✓] Node 22.13.0
  [i] tempest CLI v0.18.0

Project
  [✓] package.json found
  [✓] tempest-react-sdk in dependencies — ^0.18.0
  [✓] tempest-react-sdk installed — v0.18.0
  [✓] react + react-dom present — v19.2.0

Dependency health
  [!] duplicate instance: react — nested copy under tempest-react-sdk;
      rode `npm dedupe`; duas instâncias quebram hooks/context
  [✓] @types/react matches react — v19
  [!] recharts missing (used by charts) — você importa charts mas recharts não
      está instalado — npm i recharts
  [✓] tempest-react-sdk up to date — v0.18.0

TypeScript
  [✓] tsconfig "@/*" alias
  [!] moduleResolution: node — use "bundler" (senão os subpaths
      tempest-react-sdk/br, /charts… não resolvem tipos)
  [✓] jsx: "react-jsx"
  [!] strict mode off — enable "strict": true

Integration
  [✓] vite.config.ts uses createViteConfig
  [✓] src/main.tsx imports styles.css

Tooling
  [✓] ESLint config present
  [✓] eslint installed
  [✓] prettier installed

! 3 warning(s) — usable, but worth fixing.
```

!!! tip "Use no onboarding e na CI"
    Rode `tempest doctor` ao clonar um projeto (confirma que tudo está no lugar)
    e como passo rápido na CI. Ele sai com código **1** se houver qualquer `✗`
    (problema bloqueante); avisos `!` não falham o comando.

### O que ele verifica

**Environment** — Node ≥ 20.19 (e aviso se for uma linha **não-LTS**, major ímpar); versão da CLI; versões do **TypeScript** (≥5) e **Vite** (≥5); `engines.node` do `package.json` satisfeito.

**Project** — `tempest-react-sdk` declarado e instalado (com versão); `react`/`react-dom` presentes; **React major** ≥ 18.

**Dependency health** (os silenciosos):

- **Instância duplicada** de React ou de libs com estado/contexto (`@tanstack/react-query`, `zustand`, `react-hook-form`, `react-router`): uma cópia **aninhada** dentro do `tempest-react-sdk` significa **duas instâncias** no runtime — hooks inválidos, `QueryClient`/contexto de RHF que "somem". Sugere `npm dedupe`. _(Pulado quando o SDK é `file:`/`link:` local.)_
- **Deps declaradas mas não instaladas** (drift entre `package.json` e `node_modules`) → `npm install`.
- **`peerDependencies` do próprio app** não satisfeitas.
- **`@types/react` × `react`** com majors diferentes → erros de tipo fantasma.
- **Peers opcionais de subpaths usados**: se você importa `tempest-react-sdk/charts` sem `recharts`, `/editor` sem `@tiptap/react`, `/vision` sem `onnxruntime-web`, ou passa `tileUrl` no `TrajectoryMap` sem `leaflet` — tudo compila, mas quebra no import lazy em runtime.
- **SDK desatualizado** vs o `latest` no npm (best-effort, com timeout curto; pulado offline).

**TypeScript** — alias `@/*`; **`moduleResolution`** ∈ `bundler`/`node16`/`nodenext` (senão os _subpath exports_ como `tempest-react-sdk/br` não resolvem tipos — silencioso!); **`jsx: "react-jsx"`**; **`strict: true`**; **`skipLibCheck`** ligado; com testes + `vitest`, avisa se o `types` do tsconfig omite `vitest/globals`.

**Integration** — `vite.config.*` usando `createViteConfig`; **`@vitejs/plugin-react`** instalado (JSX/Fast Refresh); import do `styles.css` no entry (e aviso se importado **mais de uma vez**).

**Tooling** — config + binários de ESLint e Prettier; **lockfile** presente, único (npm/yarn/pnpm misturados dessincronizam) e **não desatualizado** (`package.json` mais novo que o lock → `npm install`).

**Env & secrets** — **`.env` no `.gitignore`** (senão segredos vazam no commit); variáveis usadas via `import.meta.env.*` **sem prefixo `VITE_`** (o Vite não expõe pro browser → `undefined` em runtime); `.env` vs `.env.example`.

## `tempest fix`

Arruma o código de uma vez: **converte import relativo pra `@/`**, **organiza
imports**, **remove imports não usados**, **limpa linhas em branco extras e
espaços no fim**, e roda o **Prettier**.

```bash
npx tempest fix              # o projeto inteiro
npx tempest fix src/app      # só um caminho
npx tempest fix --dry-run    # mostra o que mudaria, não escreve
npx tempest fix --no-alias    # pula a conversão de import (só ESLint + Prettier)
```

São três passadas, nessa ordem: a conversão de alias, `eslint --fix` (com as
regras `simple-import-sort`, `unused-imports/no-unused-imports`,
`no-multiple-empty-lines`, `no-trailing-spaces`, `eol-last`) e `prettier --write`.
A conversão vem **primeiro** de propósito: trocar `../../services/api` por
`@/services/api` muda o grupo de ordenação do `simple-import-sort`, então rodar o
ESLint depois deixa tudo ordenado num único `fix`.

### A conversão de import

A regra é uma só: **nenhum import sobe de diretório**.

```ts
// antes                                    // depois
import { api } from "../../services/api";   import { api } from "@/services/api";
import { Button } from "../Button";         import { Button } from "@/components/Button";
import { Row } from "./Row";                // inalterado — irmão continua relativo
import cfg from "../../../vite.config";     // inalterado — resolve fora de src/
```

Um import de irmão (`./x`) fica como está: ele já diz "isso mora aqui do lado",
que é informação que o `@/` joga fora. Um caminho que resolve **fora** da base do
alias também fica — é isso que protege `../../../vite.config` e
`../../../scripts/x`.

O que a conversão alcança, além de `import` e `export … from`:

```ts
import type { User } from "../../types/user";       // import type
const m = await import("../../pages/Dashboard");    // import() dinâmico
vi.mock("../../lib/api");                            // vi.mock / vi.doMock
```

E em arquivo `.css` (o Vite resolve alias em CSS também):

```css
@import "../../styles/tokens.css";        /* → @/styles/tokens.css */
.hero {
    background: url(../../assets/bg.png); /* → @/assets/bg.png */
}
```

!!! tip "Rode com `--dry-run` primeiro num projeto grande"
    O `--dry-run` lista arquivo, linha e o antes/depois de cada import sem
    escrever nada — e sem rodar ESLint ou Prettier. É a forma de revisar o
    diff antes de deixar a ferramenta mexer.

    ```console
    $ npx tempest fix --dry-run
    → alias imports (../ → @/) [dry-run]
      src/pages/admin/Users.tsx 2
        1: "../../lib/api" → "@/lib/api"
        2: "../../styles/tokens.css" → "@/styles/tokens.css"
      ✓ would convert 2 import(s) in 1 file(s)
    ```

!!! info "O alias vem do seu `tsconfig.json`, não é chumbado"
    A base é lida de `compilerOptions.paths` — seguindo `extends` e aceitando
    comentário no JSON. Se o seu projeto usa `~/*` ou `#/*` em vez de `@/*`, é
    esse prefixo que sai na conversão; se usa `app/` em vez de `src/`, é essa a
    base.

!!! warning "Sem `paths` no tsconfig, a conversão não roda"
    Isso é de propósito. O `paths` é o que o **type-checker** honra: um alias
    achado ali é um alias que o `tsc --noEmit` aceita depois da conversão.
    Adivinhar `@` → `src` só porque existe um `src/` produziria import que não
    resolve em projeto nenhum que não tenha o alias configurado. Quando não acha,
    o comando avisa e segue pro ESLint sem tocar em nada:

    ```console
    ! no path alias found — skipping alias pass  add "paths": { "@/*": ["./src/*"] } to tsconfig.json
    ```

    A conversão também precisa do `typescript` instalado no projeto: ela usa o
    compilador **do seu projeto** pra achar as posições de import, então uma
    string parecida com caminho dentro de comentário, template literal ou
    variável nunca é reescrita por engano.

!!! warning "Código morto = imports/vars, não funções inteiras"
    O `fix` **remove imports não usados** e **avisa** sobre variáveis não usadas
    (não apaga, pra não arriscar). Ele **não** faz eliminação de dead code mais
    profunda (funções/exports órfãos) — isso exige análise dedicada e é
    arriscado automatizar. Para isso, use uma ferramenta como `knip` à parte.

!!! note "Precisa de ESLint + Prettier no projeto"
    Apps gerados pelo `create-tempest-app` já vêm com tudo configurado. Em um
    projeto pelado, instale: `npm i -D eslint prettier eslint-plugin-simple-import-sort eslint-plugin-unused-imports`.

## `tempest lint` e `tempest format`

```bash
npx tempest lint     # eslint . (só reporta, não altera)
npx tempest format   # prettier --write . (só formatação)
```

`lint` é o relatório read-only; `fix` é o `lint` que corrige + formata. Flags que
você passar são repassadas pro binário (`npx tempest lint --max-warnings 0`), e o
caminho continua sendo posicional.

## Ajuda

```bash
npx tempest --help
npx tempest --version
```

## Recap

- O `bin` **`tempest`** vem dentro do SDK — `npx tempest <comando>`.
- **`doctor`** diagnostica o projeto (estilo `flutter doctor`), sai com código 1 em problemas bloqueantes.
- **`fix`** converte import relativo pra `@/` + organiza imports + remove imports mortos + limpa espaçamento + Prettier. `--dry-run` pra revisar, `--no-alias` pra pular a conversão.
- **`lint`** reporta; **`format`** só formata.
- Veja também: [Scaffold](./scaffold.md) · [Arquitetura](./architecture.md).
