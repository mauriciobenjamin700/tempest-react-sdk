import { useState } from "react";
import {
    Avatar,
    Button,
    Card,
    ChipInput,
    FileUpload,
    Grid,
    Progress,
    Stack,
    Stepper,
    VirtualList,
} from "tempest-react-sdk";

const ROWS = Array.from({ length: 5000 }, (_, i) => ({ id: i, label: `Linha #${i + 1}` }));

export function AdvancedComponentsSection() {
    const [step, setStep] = useState(0);
    const [progress, setProgress] = useState(45);
    const [tags, setTags] = useState<string[]>(["react", "typescript"]);
    const [files, setFiles] = useState<File[]>([]);

    return (
        <section className="gallery-section" id="advanced">
            <h3>Stepper · Progress · ChipInput · FileUpload · Avatar · VirtualList</h3>
            <p className="description">Componentes avançados para fluxos completos.</p>

            <Grid columns={2} gap={4}>
                <Card title="Stepper">
                    <Stepper
                        steps={[
                            { label: "Dados" },
                            { label: "Endereço" },
                            { label: "Pagamento" },
                            { label: "Confirmação" },
                        ]}
                        current={step}
                    />
                    <Stack direction="horizontal" gap={2} style={{ marginTop: 16 }}>
                        <Button
                            variant="secondary"
                            disabled={step === 0}
                            onClick={() => setStep((s) => s - 1)}
                        >
                            Voltar
                        </Button>
                        <Button disabled={step === 3} onClick={() => setStep((s) => s + 1)}>
                            Próximo
                        </Button>
                    </Stack>
                </Card>

                <Card title="Progress">
                    <Stack gap={3}>
                        <Progress value={progress} showLabel label="Upload" />
                        <Progress value={75} variant="success" showLabel />
                        <Progress value={30} variant="warning" />
                        <Progress indeterminate label="Processando…" />
                        <Stack direction="horizontal" gap={2}>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setProgress(Math.max(0, progress - 10))}
                            >
                                -10
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setProgress(Math.min(100, progress + 10))}
                            >
                                +10
                            </Button>
                        </Stack>
                    </Stack>
                </Card>

                <Card title="ChipInput">
                    <ChipInput
                        value={tags}
                        onChange={setTags}
                        label="Tags"
                        helperText="Enter, vírgula ou Tab pra adicionar. Backspace pra remover."
                    />
                </Card>

                <Card title="Avatars">
                    <Stack direction="horizontal" gap={3} wrap>
                        <Avatar name="Maria Silva" size="xs" />
                        <Avatar name="João Souza" size="sm" status="online" />
                        <Avatar name="Ana Carolina" size="md" status="busy" />
                        <Avatar name="Pedro Lima" size="lg" status="offline" />
                        <Avatar
                            src="https://i.pravatar.cc/120?img=14"
                            name="Carlos"
                            size="xl"
                            status="online"
                        />
                    </Stack>
                </Card>
            </Grid>

            <Card title="FileUpload" style={{ marginTop: 16 }}>
                <FileUpload
                    value={files}
                    onChange={setFiles}
                    multiple
                    accept="image/*,application/pdf"
                    maxSize={10 * 1024 * 1024}
                    subtitle="PNG, JPG ou PDF até 10MB"
                />
            </Card>

            <Card title="VirtualList — 5.000 linhas" style={{ marginTop: 16 }}>
                <VirtualList
                    items={ROWS}
                    itemHeight={36}
                    height={240}
                    getKey={(row) => row.id}
                    renderItem={(row) => (
                        <div
                            style={{
                                padding: "8px 12px",
                                borderBottom: "1px solid var(--tempest-border)",
                                fontSize: 13,
                            }}
                        >
                            {row.label}
                        </div>
                    )}
                />
            </Card>
        </section>
    );
}
