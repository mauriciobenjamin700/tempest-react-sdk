import { useState } from "react";
import { Transfer, type TransferItem } from "tempest-react-sdk";
import { Example } from "../Example";

const PERMISSOES: TransferItem[] = [
    { id: "pedidos.ler", label: "Ler pedidos" },
    { id: "pedidos.criar", label: "Criar pedidos" },
    { id: "pedidos.cancelar", label: "Cancelar pedidos" },
    { id: "estoque.ler", label: "Ler estoque" },
    { id: "estoque.ajustar", label: "Ajustar estoque" },
    { id: "financeiro.ler", label: "Ler financeiro" },
    { id: "financeiro.baixar", label: "Dar baixa em título" },
    { id: "usuarios.ler", label: "Ler usuários" },
    { id: "usuarios.convidar", label: "Convidar usuários" },
    { id: "auditoria.ler", label: "Ler auditoria", disabled: true },
];

const CIDADES: TransferItem[] = [
    { id: "sp", label: "São Paulo" },
    { id: "rj", label: "Rio de Janeiro" },
    { id: "bh", label: "Belo Horizonte" },
    { id: "poa", label: "Porto Alegre" },
    { id: "gyn", label: "Goiânia" },
    { id: "ssa", label: "Salvador" },
    { id: "for", label: "Fortaleza" },
    { id: "cwb", label: "Curitiba" },
    { id: "rec", label: "Recife" },
    { id: "mao", label: "Manaus" },
];

/**
 * Demo of `Transfer`.
 *
 * The first example carries a `disabled` row on purpose — a permission the app
 * refuses to hand over is the case that separates a real dual list from a pair of
 * lists. The second shows accent-insensitive search, which is the reason the filter
 * folds diacritics at all.
 */
export function TransferSection() {
    const [permissoes, setPermissoes] = useState<string[]>(["pedidos.ler", "estoque.ler"]);
    const [cidades, setCidades] = useState<string[]>([]);

    return (
        <section className="gallery-section" id="transfer">
            <h3>Transfer</h3>
            <Example
                id="transfer-basic"
                title="Escolher um subconjunto"
                note="Controlado pelos ids do lado direito — os dois painéis são derivados. `Ler auditoria` está `disabled`: nem o botão de mover todos leva ela."
                code={`import { Transfer } from "tempest-react-sdk";

const [papeis, setPapeis] = useState<string[]>([]);

<Transfer
  items={todosOsPapeis}
  value={papeis}
  onChange={setPapeis}
  sourceTitle="Permissões disponíveis"
  targetTitle="Permissões do perfil"
/>`}
                props={[
                    {
                        name: "items",
                        type: "TransferItem[]",
                        description: "O catálogo inteiro. Os dois painéis saem dele.",
                    },
                    {
                        name: "value",
                        type: "string[]",
                        description: "Ids do lado direito. Controlado.",
                    },
                    {
                        name: "onChange",
                        type: "(value: string[]) => void",
                        description: "Próximo valor, sempre na ordem do catálogo.",
                    },
                    {
                        name: "searchable",
                        type: "boolean",
                        default: "> 8 itens",
                        description: "Caixa de busca em cada painel.",
                    },
                    {
                        name: "height",
                        type: "string",
                        default: '"16rem"',
                        description: "Altura da área de rolagem de cada painel.",
                    },
                ]}
            >
                <Transfer
                    items={PERMISSOES}
                    value={permissoes}
                    onChange={setPermissoes}
                    sourceTitle="Permissões disponíveis"
                    targetTitle="Permissões do perfil"
                />
            </Example>

            <Example
                id="transfer-search"
                title="Busca sem acento"
                note="Digite `sao`, `goiania` ou `curitiba` sem acento: o filtro dobra diacríticos. E o botão de mover todos respeita o filtro — move o que você está vendo, não o painel inteiro."
                code={`<Transfer items={cidades} value={selecionadas} onChange={setSelecionadas} searchable />`}
            >
                <Transfer
                    items={CIDADES}
                    value={cidades}
                    onChange={setCidades}
                    sourceTitle="Cidades atendidas"
                    targetTitle="Rota do dia"
                    height="12rem"
                    searchable
                />
            </Example>
        </section>
    );
}
