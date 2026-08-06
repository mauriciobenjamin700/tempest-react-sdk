/**
 * @tempest-limits props-count — a confirmation is a question (title, description),
 * two buttons whose copy the app must own (confirmLabel, cancelLabel), a
 * destructive-or-not tone (variant), and the async state of the answer (loading,
 * onConfirm, onCancel, open). Fewer props means the app writes the dialog again
 * around a Modal.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";

export interface ConfirmDialogProps {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "primary" | "danger";
    loading?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

/**
 * Quick confirmation prompt built on top of {@link Modal}. Use for destructive
 * actions with `variant="danger"`.
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    variant = "primary",
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={title}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button variant={variant} loading={loading} onClick={() => void onConfirm()}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {description}
        </Modal>
    );
}
