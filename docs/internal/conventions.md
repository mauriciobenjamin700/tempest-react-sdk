# Convenções de código e de teste

Leia antes de escrever código, teste ou docstring neste repo.

## Estilo

- **Aspas duplas** em toda string. Tipagem total: parâmetro, retorno, anotação.
- **JSDoc em inglês** em todo export público: o que faz, os parâmetros, o
  retorno, e — a parte que importa — **por que** é assim.
- **Zero comentário inline explicativo.** O porquê, o caveat e o passo não-óbvio
  vão na docstring da função que os contém. Exceção só para marcador de máquina
  (`// eslint-disable-next-line`, `// @ts-expect-error`, banner de codegen).
- PT-BR no resto da documentação; código e commit em inglês.
- **Sem wrapper pass-through**: função cujo corpo só repassa argumentos ou é
  inlined no call site, ou tem o adapter justificado (hook de framework, facade
  público, implementação de interface).
- **`**kwargs`/`...options` é só passthrough.** No instante em que a função lê uma
  chave de dentro, aquela chave é parâmetro real: promova a nomeada.

## Componentes

- Um componente por pasta, com `index.ts`, `<Nome>.tsx`, `<Nome>.module.css` e
  `<Nome>.test.tsx`.
- **CSS Modules com prefixo `tempest_`** é a única estratégia de estilo. Não
  existe modo headless nem `data-tempest-classname`.
- **Tokens `--tempest-*`** são a única forma de tema. Tema escuro por
  `data-tempest-theme="dark"`, nunca `class="dark"`.
- Componente é **apresentacional e controlado**: recebe dados, emite intenção. De
  onde vêm os dados fica com o app.
- Pedaço pesado entra por `lazy()` quando nem todo consumidor o alcança — foi o
  que manteve a thread de texto do `<Chat>` no tamanho que tinha depois de ele
  ganhar mídia e menu.

## Acessibilidade e contraste

- Texto deve 4,5:1; indicador não-textual (anel de foco, borda de estado) deve
  3:1 — WCAG 2.2 SC 1.4.11.
- **Token de texto validado contra um fundo não vale sobre outro.**
  `--tempest-text-subtle` é resolvida contra `--tempest-bg`/`--tempest-surface` e
  reprova sobre `--tempest-primary-soft`. Sobre superfície tingida, use o
  foreground daquela superfície e de-enfatize por **tamanho**, não por cor.
- O `axe` do jsdom **desliga** `color-contrast` (não há paint). Contraste só se
  verifica em browser real.

## Testes

`vitest` + `@testing-library/react` + `jsdom` + `fake-indexeddb`.

- Todo comportamento novo ganha teste **nomeado pelo que ele garante**, não pelo
  método que exercita.
- **Teste que fixa uma regressão se reescreve, não se apaga.** Quando a decisão é
  revista de propósito, inverta a asserção e escreva o porquê no corpo — apagá-la
  perde a história.
- Escreva um teste para toda propriedade que precisa **sobreviver à próxima
  geração** de código vendorizado (`src/vision/`): o teste é o único guard que a
  árvore gerada tem.
- Pisos de cobertura no CI: **99 linhas / 98 statements / 99 funções / 95
  branches**. 100% não é alvo — o que sobra é inalcançável por construção
  (guarda de SSR dentro de React, default defensivo atrás de validação,
  `default:` de união fechada).

Armadilhas já pagas:

- `vi.fn(() => obj)` **não** funciona como mock de construtor. Use
  `class Mock { … }` quando o código faz `new X(...)`.
- jsdom não calcula layout: `offsetParent` é sempre `null`.
- `tsc -b` checa os testes — `@types/vitest/globals` e `@testing-library/jest-dom`
  ficam no `types` do tsconfig.
- Dexie funciona com `fake-indexeddb/auto`; `await db.delete()` no `afterEach`.
- Handler de service worker chama `getSwScope()` (retorna `globalThis`); o teste
  precisa manter as props no `globalThis` durante toda a execução do listener.
- `vi.stubGlobal("window", undefined)` **derruba o react-dom** — guarda de SSR
  dentro de componente não é testável; em módulo sem React o mesmo stub funciona.
- **Mock do gate esconde que o gate é inalcançável.** Toda função cuja resposta
  depende do ambiente do build ganha também um teste **sem mock nenhum**, que
  reproduz o ambiente real e afirma o que o consumidor vê.

## Validação visual

Mudança que afeta pixel — CSS, `.module.css`, layout JSX, tema,
responsividade, animação — é validada em **browser real** (Playwright MCP ou
Chrome DevTools MCP) antes de ser reportada como concluída. Type-check e lint
verificam código, não pixel. Sem MCP disponível: diga isso explicitamente, em vez
de afirmar que a mudança funciona.

Checklist: subir a gallery buildada → navegar → redimensionar (≤430 px e
≥1024 px) → snapshot/screenshot → exercitar o fluxo → ler o console.

Antes de medir cor, **desligue `transition` e `animation`**
(`*{transition:none!important}`) e confira que ida-e-volta (claro → escuro →
claro) devolve o mesmo número. Se não devolver, a medição está errada, não o CSS.
