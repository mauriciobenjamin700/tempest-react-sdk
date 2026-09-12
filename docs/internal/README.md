# Regras e padrões do `tempest-react-sdk`

Documentação **interna**, para quem trabalha no SDK. Não faz parte do site
publicado: `mkdocs.yml` exclui `internal/` do build, e os guards de documentação
(`test/docs-guard.test.ts`, `test/docs-anchors.test.ts`, `scripts/gen-llms.mjs`)
pulam esta pasta — ela não precisa de tradução `.en.md` nem de entrada no `nav`.

O `CLAUDE.md` da raiz é o índice operacional e aponta para cá. Ele guarda o que
vale em **toda** tarefa; o detalhe longo mora aqui.

| Antes de | Leia |
| --- | --- |
| criar arquivo, módulo, export ou subpath; mexer em barrel | [`architecture.md`](./architecture.md) |
| escrever código, teste ou docstring | [`conventions.md`](./conventions.md) |
| abrir PR, cortar release, mexer em CI, docs ou budget | [`workflow.md`](./workflow.md) |
| propor mudança que contraria algo já decidido | [`decisions.md`](./decisions.md) |
| medir bytes, contraste, taxa de frame, ou confiar num número | [`lessons.md`](./lessons.md) |
| pegar uma issue | [`working-on-issues.md`](./working-on-issues.md) |

Uma regra sobre estas páginas: **toda afirmação numérica vem com o comando ou a
medição que a produziu**, escrita ao lado. Número sem método não reproduz, e um
número que não reproduz vira folclore na próxima leitura.
