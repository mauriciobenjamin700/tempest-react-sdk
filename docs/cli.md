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

Faz um diagnóstico do projeto atual e imprime um relatório `[✓] / [!] / [✗]`:

```bash
npx tempest doctor
```

```text
tempest doctor (/caminho/do/seu/app)

  [✓] Node 22.13.0
  [✓] package.json found
  [✓] tempest-react-sdk in dependencies — ^0.7.0
  [✓] tempest-react-sdk installed
  [✓] react + react-dom present
  [✓] vite.config.ts uses createViteConfig
  [✓] tsconfig "@/*" alias
  [✓] src/main.tsx imports styles.css
  [✓] ESLint config present
  [✓] eslint installed
  [✓] prettier installed
  [!] .env — only .env.example — copy it: cp .env.example .env

! 1 warning(s) — usable, but worth fixing.
```

!!! tip "Use no onboarding e na CI"
    Rode `tempest doctor` ao clonar um projeto (confirma que tudo está no lugar)
    e como passo rápido na CI. Ele sai com código **1** se houver qualquer `✗`
    (problema bloqueante); avisos `!` não falham o comando.

O que ele verifica: versão do Node (≥ 20.19), `tempest-react-sdk` declarado e
instalado, `react`/`react-dom`, `vite.config.*` usando `createViteConfig`, alias
`@/*` no `tsconfig`, import do `styles.css` no entry, config + binários de
ESLint e Prettier, e o `.env`.

## `tempest fix`

Arruma o código de uma vez: **organiza imports**, **remove imports não usados**,
**limpa linhas em branco extras e espaços no fim**, e roda o **Prettier**.

```bash
npx tempest fix            # o projeto inteiro
npx tempest fix src/app    # só um caminho
```

Por baixo dos panos roda `eslint --fix` (com as regras `simple-import-sort`,
`unused-imports/no-unused-imports`, `no-multiple-empty-lines`,
`no-trailing-spaces`, `eol-last`) e depois `prettier --write`.

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

`lint` é o relatório read-only; `fix` é o `lint` que corrige + formata.

## Ajuda

```bash
npx tempest --help
npx tempest --version
```

## Recap

- O `bin` **`tempest`** vem dentro do SDK — `npx tempest <comando>`.
- **`doctor`** diagnostica o projeto (estilo `flutter doctor`), sai com código 1 em problemas bloqueantes.
- **`fix`** organiza imports + remove imports mortos + limpa espaçamento + Prettier (ESLint por baixo).
- **`lint`** reporta; **`format`** só formata.
- Veja também: [Scaffold](./scaffold.md) · [Arquitetura](./architecture.md).
