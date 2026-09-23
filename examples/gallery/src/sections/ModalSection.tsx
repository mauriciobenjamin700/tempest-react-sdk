import { useState } from "react";
import {
    Button,
    ConfirmDialog,
    DropdownMenu,
    Input,
    Modal,
    Popover,
    useToast,
} from "tempest-react-sdk";
import { Example } from "../Example";

export function ModalSection() {
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [layered, setLayered] = useState(false);
    const [nested, setNested] = useState(false);
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
                title="Foco preso, com camadas dentro"
                note="Tab e Shift+Tab circulam só dentro do modal — inclusive pelo painel do Popover, que mora num portal. Um modal aberto de dentro prende o foco até fechar e devolve ao botão que o abriu."
                code={`<Modal
    open={open}
    onClose={() => setOpen(false)}
    title="Filtros"
    footer={<Button onClick={() => setOpen(false)}>Aplicar</Button>}
>
    <div className="gallery-row">
        <Popover trigger={<Button variant="secondary">Período</Button>}>
            <Input aria-label="De" placeholder="De" />
            <Input aria-label="Até" placeholder="Até" />
        </Popover>
        <DropdownMenu
            trigger={<Button variant="secondary">Ordenar</Button>}
            items={[
                { type: "item", id: "recent", label: "Mais recentes", onSelect: () => {} },
                { type: "item", id: "oldest", label: "Mais antigos", onSelect: () => {} },
            ]}
        />
        <Button variant="ghost" onClick={() => setNested(true)}>
            Salvar filtro
        </Button>
    </div>
    <Modal open={nested} onClose={() => setNested(false)} title="Salvar filtro" size="sm">
        <Input aria-label="Nome do filtro" placeholder="Nome do filtro" />
    </Modal>
</Modal>`}
            >
                <div className="gallery-row">
                    <Button onClick={() => setLayered(true)}>Abrir filtros</Button>
                </div>
                <Modal
                    open={layered}
                    onClose={() => setLayered(false)}
                    title="Filtros"
                    footer={<Button onClick={() => setLayered(false)}>Aplicar</Button>}
                >
                    <div className="gallery-row">
                        <Popover trigger={<Button variant="secondary">Período</Button>}>
                            <Input aria-label="De" placeholder="De" />
                            <Input aria-label="Até" placeholder="Até" />
                        </Popover>
                        <DropdownMenu
                            trigger={<Button variant="secondary">Ordenar</Button>}
                            items={[
                                {
                                    type: "item",
                                    id: "recent",
                                    label: "Mais recentes",
                                    onSelect: () => {},
                                },
                                {
                                    type: "item",
                                    id: "oldest",
                                    label: "Mais antigos",
                                    onSelect: () => {},
                                },
                            ]}
                        />
                        <Button variant="ghost" onClick={() => setNested(true)}>
                            Salvar filtro
                        </Button>
                    </div>
                    <Modal
                        open={nested}
                        onClose={() => setNested(false)}
                        title="Salvar filtro"
                        size="sm"
                    >
                        <Input aria-label="Nome do filtro" placeholder="Nome do filtro" />
                    </Modal>
                </Modal>
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
