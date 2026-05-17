# Contribuindo com tempest-react-sdk

Obrigado pelo interesse. Este SDK serve múltiplos produtos Tempest — mudanças impactam todos os apps consumidores. Leia este guia antes de abrir PR.

## Setup

```bash
git clone https://github.com/tempest/tempest-react-sdk.git
cd tempest-react-sdk
npm install
npm run typecheck
npm test
npm run build
```

Node ≥ 20.19 ou ≥ 22.12.

## Estrutura

Veja [docs/architecture.md](./docs/architecture.md). Cada módulo (`http/`, `sse/`, `components/`, …) tem barrel `index.ts` que expõe APIs públicas.

## Convenções

- **Strings**: aspas duplas sempre.
- **Tipos**: 100% tipado, sem `any` implícito; preferir `unknown` na borda.
- **Docstrings**: JSDoc em inglês nos exports públicos (parâmetros + retorno + exemplos curtos).
- **CSS Modules**: 1 pasta por componente (`Foo/Foo.tsx` + `Foo.module.css` + `index.ts`).
- **Imports**: alias `@/` da raiz `src/`. `import type` quando importar só tipos.
- **Peer deps**: cada nova lib pesada vira **peer dependency opcional** em `package.json` + `peerDependenciesMeta`. Externalize em `vite.config.ts`.

## Workflow

1. Branch a partir de `main`: `feat/x`, `fix/y`, `ref/z`, `docs/w`.
2. Implementar + adicionar testes para o módulo tocado.
3. Rodar localmente:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
4. Criar changeset:
   ```bash
   npx changeset
   # selecione tipo: patch / minor / major + descreva
   ```
5. Commit seguindo Conventional Commits: `feat: x`, `fix: y`, `ref: z`, `docs: w`, `tests: q`, `chore: r`.
6. Abrir PR em PT-BR seguindo o template em `~/.claude/CLAUDE.md` (tabela + Problema + Solução + …).

## Testes

- **Vitest + @testing-library/react** rodam em jsdom.
- Cobertura mínima para módulos novos: testes do happy path + 1 edge case.
- Testes ficam ao lado do código: `foo.test.ts(x)` no mesmo diretório do arquivo testado.
- `npm run test` para watch, `npm run test:run` para CI.

## Versionamento

Semantic Versioning estrito:

- **patch**: bug fix, refactor interno, docs.
- **minor**: API adicional (nova export, nova prop opcional).
- **major**: breaking change (remoção, renome, mudança de assinatura).

Releases automatizados via `@changesets`. Cada PR funcional precisa de um changeset.

## Componente novo

Checklist:

- [ ] Pasta `src/components/<Name>/` com `<Name>.tsx`, `<Name>.module.css`, `index.ts`.
- [ ] Exporta type props (`<Name>Props`) junto com o componente.
- [ ] Forward ref quando faz sentido (inputs/buttons/triggers).
- [ ] `aria-*` mínimos (`aria-label`, `aria-invalid`, `aria-current`).
- [ ] Usa tokens `var(--tempest-*)` — nunca cor hardcoded.
- [ ] Re-exporta no `src/components/index.ts`.
- [ ] Seção no `examples/gallery/src/sections/`.
- [ ] Atualiza `docs/components.md` + `docs/gallery.md`.
- [ ] Teste de render mínimo.
- [ ] Changeset.

## Reportar bugs

Abra issue com:

- Versão do SDK + versão dos peer deps relevantes.
- Reprodução mínima (CodeSandbox ou repo).
- Comportamento esperado vs observado.
