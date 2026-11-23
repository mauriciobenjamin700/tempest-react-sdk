/**
 * @tempest-limits props-count — a confirmation is a question (title, description),
 * two buttons whose copy the app must own (confirmLabel, cancelLabel), a
 * destructive-or-not tone (variant), the confirm button's icon (confirmIcon), and
 * the async state of the answer (loading, onConfirm, onCancel, open). Fewer props
 * means the app writes the dialog again around a Modal.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { CONFIRM_DIALOG_MESSAGES } from "@/i18n/messages/confirm-dialog";
import { useTempestText } from "@/i18n/use-tempest-text";

export interface ConfirmDialogProps {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "primary" | "danger";
    /**
     * Icon rendered before the confirm label, passed through as the confirm
     * {@link Button}'s `leftIcon` — e.g. a `LogOut` icon on a sign-out prompt.
     * Decorative: the button is still named by `confirmLabel`.
     */
    confirmIcon?: ReactNode;
    /**
     * The confirmation is in flight. Shows the spinner on the confirm button and
     * locks the dialog: Cancel is disabled, the close button is hidden, and
     * neither `Escape` nor a backdrop click calls `onCancel`.
     */
    loading?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

/**
 * Quick confirmation prompt built on top of {@link Modal}. Use for destructive
 * actions with `variant="danger"`.
 *
 * While `loading`, every way out is closed, not just the Cancel button: the
 * underlying `Modal` gets `closeOnEsc={false}`, `closeOnBackdrop={false}` and
 * `hideCloseButton`. Cancelling mid-request would tell the user "cancelled" with
 * the request still running — a sign-out that revokes the session server-side
 * would complete behind a dialog that already said it did not (issue #615). With
 * `Escape` turned off the dialog still swallows the key, so it does not fall
 * through and close a modal underneath either. The lock is derived from
 * `loading`, so there is no separate prop to keep in sync with it.
 *
 * @param props - See {@link ConfirmDialogProps}.
 * @returns The dialog, rendered in a portal while `open`.
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant = "primary",
    confirmIcon,
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const text = useTempestText(CONFIRM_DIALOG_MESSAGES);
    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={title}
            size="sm"
            closeOnEsc={!loading}
            closeOnBackdrop={!loading}
            hideCloseButton={loading}
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={loading}>
                        {cancelLabel ?? text.t("tempest.confirmDialog.cancel")}
                    </Button>
                    <Button
                        variant={variant}
                        loading={loading}
                        leftIcon={confirmIcon}
                        onClick={() => void onConfirm()}
                    >
                        {confirmLabel ?? text.t("tempest.confirmDialog.confirm")}
                    </Button>
                </>
            }
        >
            {description}
        </Modal>
    );
}
