import { useState } from "react";
import { Button, ConfirmDialog, Modal, useToast } from "tempest-react-sdk";
import { Example } from "../Example";

export function ModalSection() {
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    async function handleConfirm(): Promise<void> {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 800));
        setLoading(false);
        setConfirm(false);
        toast.success("Registro removido");
    }

    return (
        <section className="gallery-section" id="modal">
            <h3>Modal, ConfirmDialog, Toast</h3>
            <p className="description">
                Portal-rendered, lock de scroll, Esc fecha, slot de footer. Toasts agrupados por
                variant.
            </p>

            <Example
                title="Modal e ConfirmDialog"
                note="Esc e click no backdrop fecham. ConfirmDialog tem loading state."
                code={`<Button onClick={() => setOpen(true)}>Abrir Modal</Button>
<Button variant="danger" onClick={() => setConfirm(true)}>
    Excluir item (Confirm)
</Button>

<Modal
    open={open}
    onClose={() => setOpen(false)}
    title="Editar perfil"
    footer={
        <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
            </Button>
            <Button onClick={() => setOpen(false)}>Salvar</Button>
        </>
    }
>
    <p>Conteúdo do modal. Esc fecha. Click no backdrop fecha.</p>
</Modal>

<ConfirmDialog
    open={confirm}
    title="Excluir registro?"
    description="Essa ação não pode ser desfeita."
    variant="danger"
    confirmLabel="Excluir"
    loading={loading}
    onConfirm={handleConfirm}
    onCancel={() => setConfirm(false)}
/>`}
            >
                <div className="gallery-row">
                    <Button onClick={() => setOpen(true)}>Abrir Modal</Button>
                    <Button variant="danger" onClick={() => setConfirm(true)}>
                        Excluir item (Confirm)
                    </Button>
                </div>

                <Modal
                    open={open}
                    onClose={() => setOpen(false)}
                    title="Editar perfil"
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={() => setOpen(false)}>Salvar</Button>
                        </>
                    }
                >
                    <p>Conteúdo do modal. Esc fecha. Click no backdrop fecha.</p>
                </Modal>

                <ConfirmDialog
                    open={confirm}
                    title="Excluir registro?"
                    description="Essa ação não pode ser desfeita."
                    variant="danger"
                    confirmLabel="Excluir"
                    loading={loading}
                    onConfirm={handleConfirm}
                    onCancel={() => setConfirm(false)}
                />
            </Example>

            <Example
                title="Toasts"
                note="Agrupados por variant: success · error · warning."
                code={`<Button variant="secondary" onClick={() => toast.success("Operação concluída")}>
    Toast success
</Button>
<Button variant="ghost" onClick={() => toast.error("Erro de conexão")}>
    Toast error
</Button>
<Button variant="ghost" onClick={() => toast.warning("Sessão expirando")}>
    Toast warning
</Button>`}
            >
                <div className="gallery-row">
                    <Button variant="secondary" onClick={() => toast.success("Operação concluída")}>
                        Toast success
                    </Button>
                    <Button variant="ghost" onClick={() => toast.error("Erro de conexão")}>
                        Toast error
                    </Button>
                    <Button variant="ghost" onClick={() => toast.warning("Sessão expirando")}>
                        Toast warning
                    </Button>
                </div>
            </Example>
        </section>
    );
}
