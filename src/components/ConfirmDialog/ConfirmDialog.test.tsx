import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
    it("fires onConfirm and onCancel", async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <ConfirmDialog
                open
                title="Delete?"
                description="Forever"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
        expect(onConfirm).toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(onCancel).toHaveBeenCalled();
    });

    it("still cancels on Escape, backdrop and the close button when idle", async () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog open title="Sair?" onConfirm={vi.fn()} onCancel={onCancel} />);
        await userEvent.keyboard("{Escape}");
        fireEvent.click(screen.getByRole("presentation"));
        await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
        expect(onCancel).toHaveBeenCalledTimes(3);
    });
});

describe("ConfirmDialog while loading", () => {
    it("does not cancel on Escape while the confirmation is in flight", async () => {
        const onCancel = vi.fn();
        render(
            <ConfirmDialog open loading title="Sair?" onConfirm={vi.fn()} onCancel={onCancel} />,
        );
        await userEvent.keyboard("{Escape}");
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("does not cancel on a backdrop click while the confirmation is in flight", () => {
        const onCancel = vi.fn();
        render(
            <ConfirmDialog open loading title="Sair?" onConfirm={vi.fn()} onCancel={onCancel} />,
        );
        fireEvent.click(screen.getByRole("presentation"));
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("offers no close button while the confirmation is in flight", () => {
        render(<ConfirmDialog open loading title="Sair?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    });

    it("keeps Escape from falling through to the modal underneath", async () => {
        const onOuterClose = vi.fn();
        const onCancel = vi.fn();
        render(
            <Modal open onClose={onOuterClose} title="Conta">
                <ConfirmDialog open loading title="Sair?" onConfirm={vi.fn()} onCancel={onCancel} />
            </Modal>,
        );
        await userEvent.keyboard("{Escape}");
        expect(onCancel).not.toHaveBeenCalled();
        expect(onOuterClose).not.toHaveBeenCalled();
    });
});

describe("ConfirmDialog confirmIcon", () => {
    it("renders the icon inside the confirm button without changing its name", () => {
        render(
            <ConfirmDialog
                open
                title="Sair?"
                confirmLabel="Sair"
                confirmIcon={<svg data-testid="logout-icon" aria-hidden />}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        const confirm = screen.getByRole("button", { name: "Sair" });
        expect(confirm).toContainElement(screen.getByTestId("logout-icon"));
        expect(screen.getByRole("button", { name: "Cancelar" })).not.toContainElement(
            screen.getByTestId("logout-icon"),
        );
    });
});
