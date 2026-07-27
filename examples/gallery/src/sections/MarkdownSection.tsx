import { Markdown } from "tempest-react-sdk";
import { Example } from "../Example";

const RELEASE = `## v0.30.0 — 2026-07-27

Três componentes novos e um \`fix\` que só apareceu no browser.

### Adicionado

- **Chat** — thread que também serve de comentário
- **Transfer** — dual list com busca sem acento
- \`Masonry\` — cards de altura desigual

### Corrigido

1. contraste do timestamp na bolha própria
2. \`urlBase64ToUint8Array\` dentro do service worker

> A rolagem só pula pro fim se você já estava no fim.
> Verificado no browser, não em revisão.

| Superfície | Antes | Depois |
| :-- | --: | --: |
| testes | 3401 | 3462 |
| componentes | 118 | 121 |

Detalhe da API:

\`\`\`ts
<Chat messages={mensagens} currentUserId={me.id} onSend={enviar} />
\`\`\`

Veja o [CHANGELOG](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) ou escreva pra <mailto:contato@tempest.dev>.

---

*Texto com \\* escapado, \`código inline\` e ~~algo removido~~.*`;

const HOSTILE = `Comentário de um usuário qualquer:

<script>alert("xss")</script>

<img src=x onerror="alert('xss')">

[clique aqui](javascript:alert('xss'))

![imagem](javascript:alert('xss'))

<a href="javascript:alert(1)">link cru</a>

Isso tudo acima é **texto**, não markup.`;

/**
 * Demo of `Markdown`.
 *
 * The second example is the point of the component: hostile input rendered inline.
 * Nothing in it executes, because the renderer builds React elements and never an
 * HTML string — the `<script>` is four characters somebody typed.
 */
export function MarkdownSection() {
    return (
        <>
            <Example
                id="markdown-basic"
                title="Um documento de verdade"
                note="Headings, listas (aninhadas e numeradas), tabela com alinhamento, citação, código cercado via `CodeBlock`, links e ênfase. O `#` do documento vira `h2` por default, pra não brigar com o `h1` da página."
                code={`import { Markdown } from "tempest-react-sdk";

<Markdown source={corpoDoComentario} linkProps={{ target: "_blank", rel: "noreferrer" }} />`}
                props={[
                    { name: "source", type: "string", description: "O Markdown." },
                    {
                        name: "headingOffset",
                        type: "number",
                        default: "2",
                        description:
                            "Nível que o `#` do documento vira. Mantém a outline da página válida.",
                    },
                    {
                        name: "highlightCode",
                        type: "boolean",
                        default: "true",
                        description:
                            "Código cercado renderiza com `CodeBlock` (copiar, número de linha).",
                    },
                    {
                        name: "linkProps",
                        type: "AnchorHTMLAttributes",
                        description: "Props extras em todo link — `target`, `rel`, handler.",
                    },
                ]}
            >
                <Markdown source={RELEASE} linkProps={{ target: "_blank", rel: "noreferrer" }} />
            </Example>

            <Example
                id="markdown-safety"
                title="Entrada hostil"
                note="Nada aqui executa: o componente monta elementos React e **nunca** uma string de HTML, e as URLs passam por allowlist de esquema. `<script>` é texto; `javascript:` num link vira o rótulo sem link."
                code={`// O mesmo componente, sem sanitizador nem plugin:
<Markdown source={comentarioDoUsuario} />`}
            >
                <Markdown source={HOSTILE} />
            </Example>
        </>
    );
}
