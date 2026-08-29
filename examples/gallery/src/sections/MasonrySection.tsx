import { Card, Masonry } from "tempest-react-sdk";
import { Example } from "../Example";

interface Nota {
    id: string;
    titulo: string;
    corpo: string;
}

/** Corpos de tamanhos bem diferentes — é o único caso em que masonry ganha de grid. */
const NOTAS: Nota[] = [
    {
        id: "1",
        titulo: "Retrospectiva",
        corpo: "Combinamos revisar o SLA de suporte na próxima quinzena.",
    },
    {
        id: "2",
        titulo: "Migração do banco",
        corpo: "A janela é domingo 02:00–04:00. Precisa de dump completo antes, e o rollback é o snapshot do RDS. Avisar o time de dados na sexta e travar deploy no sábado.",
    },
    { id: "3", titulo: "Contrato", corpo: "Renovação assinada." },
    {
        id: "4",
        titulo: "Onboarding",
        corpo: "Faltam três acessos: painel financeiro, VPN e repositório de infraestrutura.",
    },
    {
        id: "5",
        titulo: "Bug do caixa",
        corpo: "Reproduzido só com desconto acumulado acima de 30%.",
    },
    {
        id: "6",
        titulo: "Roadmap",
        corpo: "Prioridade do trimestre é fechar o ciclo de conciliação. Depois disso, relatório de margem por filial e o app do vendedor externo — nessa ordem, porque o segundo depende do primeiro.",
    },
    { id: "7", titulo: "Fornecedor", corpo: "Prazo confirmado para o dia 12." },
    {
        id: "8",
        titulo: "Treinamento",
        corpo: "Duas turmas, quarta e quinta, 90 minutos cada. Material já está no drive compartilhado.",
    },
];

/**
 * Demo of `Masonry`.
 *
 * Cards of deliberately uneven height, because that is the only situation where
 * masonry beats a grid — with equal heights, `grid-template-columns` is one line of
 * CSS and does the job.
 */
export function MasonrySection() {
    return (
        <section className="gallery-section" id="masonry">
            <h3>Masonry</h3>
            <Example
                id="masonry-basic"
                title="Cards de altura desigual"
                note="Cada card vai pra coluna mais curta, então a borda de baixo fica o mais reta que o conteúdo permite. Redimensione a janela: as colunas seguem a largura do **contêiner**, não a do viewport."
                code={`import { Masonry } from "tempest-react-sdk";

<Masonry items={notas} itemKey={(nota) => nota.id} columns={{ 0: 1, 640: 2, 1024: 3 }}>
  {(nota) => (
    <Card title={nota.titulo}>{nota.corpo}</Card>
  )}
</Masonry>`}
                props={[
                    { name: "items", type: "T[]", description: "O que distribuir nas colunas." },
                    {
                        name: "children",
                        type: "(item: T, index: number) => ReactNode",
                        description: "Render de um card.",
                    },
                    {
                        name: "columns",
                        type: "number | Record<number, number>",
                        default: "{ 0: 1, 640: 2, 1024: 3 }",
                        description:
                            "Número fixo, ou mapa largura → colunas (lido como 'a partir dessa largura').",
                    },
                    {
                        name: "itemKey",
                        type: "(item: T, index: number) => string | number",
                        description: "Chave estável por item.",
                    },
                    {
                        name: "gap",
                        type: "string",
                        default: "space-4",
                        description: "Espaço entre cards.",
                    },
                ]}
            >
                <Masonry items={NOTAS} itemKey={(nota) => nota.id}>
                    {(nota) => (
                        <Card title={nota.titulo}>
                            <p style={{ margin: 0 }}>{nota.corpo}</p>
                        </Card>
                    )}
                </Masonry>
            </Example>

            <Example
                id="masonry-fixed"
                title="Número fixo de colunas"
                note="Com `columns={2}` o layout não olha a largura — útil dentro de um drawer estreito, onde o mapa de breakpoints não ajuda."
                code={`<Masonry items={notas} columns={2} gap="0.5rem">{(nota) => <Card…/>}</Masonry>`}
            >
                <Masonry
                    items={NOTAS.slice(0, 5)}
                    itemKey={(nota) => nota.id}
                    columns={2}
                    gap="0.5rem"
                >
                    {(nota) => (
                        <Card title={nota.titulo}>
                            <p style={{ margin: 0 }}>{nota.corpo}</p>
                        </Card>
                    )}
                </Masonry>
            </Example>
        </section>
    );
}
