import { CodeBlock } from "tempest-react-sdk";
import { Example } from "../Example";

const TS = `import { createApiClient } from "tempest-react-sdk";

/** One client per service, reused across the app. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  onUnauthorized: () => auth.logout(),
});

const pedidos = await api.get<Pedido[]>("/pedidos", { signal });
console.log(\`\${pedidos.length} pedidos\`); // 42
`;

const BASH = `# instalar e rodar
npm install tempest-react-sdk
npx -p tempest-react-sdk create-tempest-app .

export VITE_API_URL="https://api.exemplo.com"
npm run dev -- --host 0.0.0.0`;

const SQL = `SELECT p.id, p.total, u.nome
FROM pedidos p
INNER JOIN usuarios u ON u.id = p.usuario_id
WHERE p.status = 'pago' AND p.criado_em >= '2026-01-01'
ORDER BY p.total DESC
LIMIT 20;`;

const LONG = Array.from(
    { length: 40 },
    (_, i) => `[2026-07-26 21:0${i % 10}:11] request ${1000 + i} concluída em ${12 + i}ms`,
).join("\n");

/**
 * Demo of `CodeBlock`.
 *
 * The long-log example exists to exercise the two things that only show up at
 * size: the capped height with its own tab stop, and horizontal scrolling on a
 * line that does not fit.
 */
export function CodeBlockSection() {
    return (
        <section className="gallery-section" id="codeblock">
            <h3>CodeBlock</h3>
            <Example
                id="codeblock-basic"
                title="Básico"
                note="Cores por scanner de padrões — não é parser. O que ele não reconhece sai como texto normal, nunca errado."
                code={`import { CodeBlock } from "tempest-react-sdk";

<CodeBlock code={snippet} language="ts" filename="src/api.ts" showLineNumbers />`}
                props={[
                    {
                        name: "code",
                        type: "string",
                        description: "A fonte. Linhas em branco nas pontas são aparadas.",
                    },
                    {
                        name: "language",
                        type: "string",
                        description:
                            "ts · js · tsx · jsx · json · css · html · bash · python · sql (com apelidos). Desconhecido = texto puro.",
                    },
                    { name: "filename", type: "ReactNode", description: "Mostrado no cabeçalho." },
                    {
                        name: "showLineNumbers",
                        type: "boolean",
                        default: "false",
                        description: "Numera as linhas (decoração: não vai pro clipboard).",
                    },
                    {
                        name: "highlightLines",
                        type: "number[]",
                        description: "Linhas 1-based marcadas como o ponto do trecho.",
                    },
                    {
                        name: "copyable",
                        type: "boolean",
                        default: "true",
                        description: "Botão de copiar no cabeçalho.",
                    },
                    {
                        name: "maxHeight",
                        type: "number | string",
                        description: "Limita a altura; o corpo rola.",
                    },
                    {
                        name: "wrap",
                        type: "boolean",
                        default: "false",
                        description: "Quebra linha em vez de rolar na horizontal.",
                    },
                    { name: "label", type: "string", description: "Nome acessível da região." },
                ]}
            >
                <CodeBlock code={TS} language="ts" filename="src/api.ts" showLineNumbers />
            </Example>

            <Example
                id="codeblock-highlight"
                title="Linhas em destaque"
                note="A marca é barra + fundo tingido, não cor de texto: as cores de sintaxe já carregam significado."
                code={`<CodeBlock code={snippet} language="ts" showLineNumbers highlightLines={[4, 5]} />`}
            >
                <CodeBlock
                    code={TS}
                    language="ts"
                    showLineNumbers
                    highlightLines={[4, 5]}
                    filename="src/api.ts"
                />
            </Example>

            <Example
                id="codeblock-languages"
                title="Outras gramáticas"
                note="bash e sql. Sem gramática conhecida, o bloco renderiza como texto puro em vez de errar a cor."
                code={`<CodeBlock code={comandos} language="bash" />
<CodeBlock code={query} language="sql" />
<CodeBlock code={saida} />  {/* sem language: texto puro */}`}
            >
                <div style={{ display: "grid", gap: "1rem" }}>
                    <CodeBlock code={BASH} language="bash" />
                    <CodeBlock code={SQL} language="sql" />
                </div>
            </Example>

            <Example
                id="codeblock-long"
                title="Log longo, altura limitada"
                note="O <pre> é sempre focável: um bloco de código não tem nada focável dentro, então sem parada de tab quem usa teclado vê a barra de rolagem e não consegue mexer nela."
                code={`<CodeBlock code={log} maxHeight={260} label="Log da última execução" />`}
            >
                <CodeBlock code={LONG} maxHeight={260} label="Log da última execução" />
            </Example>
        </section>
    );
}
