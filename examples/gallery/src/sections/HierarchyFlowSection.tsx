import { useState } from "react";
import { Badge, Input, TreeView, Wizard, type TreeNode, type WizardStep } from "tempest-react-sdk";
import { Example } from "../Example";

const PERMISSIONS: TreeNode[] = [
    {
        id: "vendas",
        label: "Vendas",
        children: [
            { id: "vendas.ler", label: "Visualizar" },
            { id: "vendas.editar", label: "Editar" },
            { id: "vendas.excluir", label: "Excluir", disabled: true },
        ],
    },
    {
        id: "estoque",
        label: "Estoque",
        children: [
            { id: "estoque.ler", label: "Visualizar" },
            {
                id: "estoque.movimentar",
                label: "Movimentar",
                children: [
                    { id: "estoque.entrada", label: "Entrada" },
                    { id: "estoque.saida", label: "Saída" },
                ],
            },
        ],
    },
    { id: "config", label: "Configurações", children: [] },
    { id: "sobre", label: "Sobre" },
];

/** Live demo of the two flow/hierarchy components added in 0.25.0. */
export function HierarchyFlowSection() {
    const [selected, setSelected] = useState<string | null>(null);
    const [nome, setNome] = useState("");
    const [concluido, setConcluido] = useState(false);

    const steps: WizardStep[] = [
        {
            id: "dados",
            label: "Dados",
            description: "Quem é o cliente",
            validate: () => nome.trim().length >= 2,
            content: (
                <Input
                    label="Nome (mínimo 2 caracteres)"
                    name="wizard-nome"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                    helperText="Tente avançar com o campo vazio: o gate bloqueia."
                />
            ),
        },
        {
            id: "endereco",
            label: "Endereço",
            optional: true,
            content: <Input label="CEP" name="wizard-cep" />,
        },
        {
            id: "revisao",
            label: "Revisão",
            content: ({ back }) => (
                <div className="tempest-stack">
                    <p style={{ margin: 0 }}>
                        Nome informado: <strong>{nome || "—"}</strong>
                    </p>
                    <button type="button" onClick={back} style={{ alignSelf: "flex-start" }}>
                        Corrigir
                    </button>
                </div>
            ),
        },
    ];

    return (
        <section className="gallery-section" id="hierarchy-flow">
            <h3>TreeView · Wizard</h3>
            <p className="description">
                Hierarquia navegável e fluxo multi-passo com validação por etapa — as duas lacunas
                que o catálogo tinha (tudo era plano, e o <code>Stepper</code> era só o indicador).
            </p>

            <Example
                title="TreeView"
                note="Clique numa linha e navegue com o teclado: ↓↑ movem, → expande (ou desce), ← colapsa (ou sobe pro pai), Home/End pulam pras pontas. 'Excluir' está disabled e é pulado."
                code={`<TreeView
  label="Permissões"
  nodes={permissoes}
  defaultExpandedIds={["vendas"]}
  selectedId={selecionado}
  onSelect={(node) => setSelecionado(node.id)}
/>`}
            >
                <div className="tempest-sidebar-layout">
                    <div className="tempest-panel">
                        <TreeView
                            label="Permissões"
                            nodes={PERMISSIONS}
                            defaultExpandedIds={["vendas"]}
                            selectedId={selected}
                            onSelect={(node) => setSelected(node.id)}
                        />
                    </div>
                    <div className="tempest-card">
                        <p style={{ margin: 0 }}>
                            Selecionado:{" "}
                            {selected ? <Badge appearance="soft">{selected}</Badge> : "nada ainda"}
                        </p>
                        <p className="tempest-text-muted" style={{ marginBottom: 0 }}>
                            “Configurações” tem <code>children: []</code> — é um galho vazio, então
                            mostra chevron e anuncia <code>aria-expanded</code>. “Sobre” é folha.
                        </p>
                    </div>
                </div>
            </Example>

            <Example
                title="Wizard com gate por passo"
                note="O passo 1 só libera com 2+ caracteres. Voltar nunca bloqueia. Só o passo ativo está montado — o estado vive fora, aqui num useState do pai."
                code={`<Wizard
  nextLabel="Avançar"
  backLabel="Voltar"
  finishLabel="Concluir"
  optionalLabel="(opcional)"
  onComplete={() => setConcluido(true)}
  steps={[
    { id: "dados", label: "Dados", validate: () => nome.trim().length >= 2, content: <Input … /> },
    { id: "endereco", label: "Endereço", optional: true, content: <Input … /> },
    { id: "revisao", label: "Revisão", content: ({ back }) => … },
  ]}
/>`}
            >
                <div className="tempest-card">
                    <Wizard
                        nextLabel="Avançar"
                        backLabel="Voltar"
                        finishLabel="Concluir"
                        optionalLabel="(opcional)"
                        onComplete={() => setConcluido(true)}
                        steps={steps}
                    />
                    {concluido ? (
                        <p style={{ marginBottom: 0 }}>
                            <Badge appearance="soft">onComplete disparou</Badge>
                        </p>
                    ) : null}
                </div>
            </Example>
        </section>
    );
}
