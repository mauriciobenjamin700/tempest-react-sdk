import { Badge, Card, Skeleton, Spinner } from "tempest-react-sdk";

export function FeedbackSection() {
    return (
        <section className="gallery-section" id="feedback">
            <h3>Badges, Cards, Spinner, Skeleton</h3>
            <p className="description">
                Pieces de feedback visual leves. Tudo plugado nos tokens CSS — muda no tema escuro
                sem código extra.
            </p>

            <div className="gallery-row">
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="success">Pago</Badge>
                <Badge variant="warning">Pendente</Badge>
                <Badge variant="danger">Reprovado</Badge>
                <Badge variant="info">Em revisão</Badge>
            </div>

            <div className="gallery-grid">
                <Card title="Receita mensal" actions={<Badge variant="success">+12%</Badge>}>
                    <strong style={{ fontSize: 28 }}>R$ 12.430,00</strong>
                    <p style={{ margin: "8px 0 0", color: "var(--tempest-text-muted)" }}>
                        Comparado a abril.
                    </p>
                </Card>
                <Card title="Status do sistema">
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span>
                            <Badge variant="success">●</Badge> API operacional
                        </span>
                        <span>
                            <Badge variant="warning">●</Badge> Push degradado
                        </span>
                    </div>
                </Card>
                <Card title="Loading">
                    <Spinner size="md" />
                    <div
                        style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}
                    >
                        <Skeleton variant="text" width="80%" />
                        <Skeleton variant="text" width="60%" />
                        <Skeleton variant="rect" width="100%" height={40} />
                    </div>
                </Card>
            </div>
        </section>
    );
}
