# Documentação — tempest-react-sdk

Material complementar ao `README.md` da raiz. Cada arquivo abaixo descreve um módulo, com exemplos e referências cruzadas aos diagramas `*.drawio` em [`./diagrams`](./diagrams).

## Índice

| Módulo                               | Documento                                | Diagrama                                              |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| **Gallery (demo vivo)**              | [gallery.md](./gallery.md)               | —                                                     |
| Arquitetura geral                    | [architecture.md](./architecture.md)     | [architecture.drawio](./diagrams/architecture.drawio) |
| HTTP + retry + parse                 | [http.md](./http.md)                     | [request-flow.drawio](./diagrams/request-flow.drawio) |
| SSE                                  | [sse.md](./sse.md)                       | —                                                     |
| WebSocket                            | [websocket.md](./websocket.md)           | —                                                     |
| Web Push + Service Worker            | [push.md](./push.md)                     | [push-flow.drawio](./diagrams/push-flow.drawio)       |
| Auth + Guard                         | [auth.md](./auth.md)                     | —                                                     |
| Query (TanStack)                     | [query.md](./query.md)                   | —                                                     |
| Offline (IndexedDB)                  | [offline.md](./offline.md)               | —                                                     |
| Forms (zod)                          | [forms.md](./forms.md)                   | —                                                     |
| Forms BR (CPF/CNPJ/CEP/Money/ViaCEP) | [forms-br.md](./forms-br.md)             | —                                                     |
| Hooks utilitários                    | [hooks.md](./hooks.md)                   | —                                                     |
| Tema (dark/light)                    | [theme.md](./theme.md)                   | —                                                     |
| i18n                                 | [i18n.md](./i18n.md)                     | —                                                     |
| **Componentes UI**                   | [components/](./components/)             | catálogo por categoria (8 arquivos)                   |
| Áudio                                | [audio.md](./audio.md)                   | —                                                     |
| Error Boundary                       | [error-boundary.md](./error-boundary.md) | —                                                     |
| Telemetry                            | [telemetry.md](./telemetry.md)           | —                                                     |
| Feature Flags                        | [feature-flags.md](./feature-flags.md)   | —                                                     |
| Logger                               | [logger.md](./logger.md)                 | —                                                     |
| Web Share                            | [share.md](./share.md)                   | —                                                     |
| Testing helpers (subpath)            | [testing.md](./testing.md)               | —                                                     |
| Release pipeline + CI                | [release.md](./release.md)               | —                                                     |

## Como editar os diagramas

Os arquivos `.drawio` em `docs/diagrams/` são XML editáveis em:

- **draw.io desktop** — https://www.drawio.com (gratuito, recomendado).
- **VS Code** — extensão `Draw.io Integration` (`hediet.vscode-drawio`).
- **Web** — https://app.diagrams.net (abra > Device > selecione o arquivo).

Salve no mesmo nome para manter os links do `README.md` e dos `.md` por módulo válidos.

## Convenções

- Markdown em **PT-BR**, igual ao `README.md` da raiz.
- Trechos de código em **TypeScript** com aspas duplas.
- Cada documento começa com um parágrafo de "Quando usar" e termina com "Veja também".
- Mantenha exemplos curtos — o leitor já tem o README global; aqui é o que falta entender pra usar bem o módulo.
