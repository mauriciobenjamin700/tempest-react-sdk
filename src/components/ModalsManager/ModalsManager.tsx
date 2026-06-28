import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import type { ModalSize } from "@/components/Modal";
import styles from "./ModalsManager.module.css";

/** Options accepted by {@link ModalsApi.open}. */
export interface OpenModalOptions {
    /** Header title. */
    title?: ReactNode;
    /** Modal body content. */
    children: ReactNode;
    /** Dialog size. Default `md`. */
    size?: ModalSize;
    /** Allow closing by clicking the backdrop. Default `true`. */
    closeOnBackdrop?: boolean;
    /** Allow closing with the Esc key. Default `true`. */
    closeOnEsc?: boolean;
    /** Hide the header close button. */
    hideCloseButton?: boolean;
    /** Called after the modal is removed from the stack. */
    onClose?: () => void;
}

/** Options accepted by {@link ModalsApi.confirm}. */
export interface ConfirmModalOptions {
    /** Header title. */
    title?: ReactNode;
    /** Prompt message rendered in the dialog body. */
    message: ReactNode;
    /** Confirm button label. Default `Confirmar`. */
    confirmLabel?: string;
    /** Cancel button label. Default `Cancelar`. */
    cancelLabel?: string;
    /** Render the confirm button in the danger variant. */
    danger?: boolean;
    /** Called when the user confirms. */
    onConfirm?: () => void | Promise<void>;
    /** Called when the user cancels or dismisses. */
    onCancel?: () => void;
}

/** Imperative API returned by {@link useModals}. */
export interface ModalsApi {
    /** Push a content modal. Returns its stack id. */
    open: (options: OpenModalOptions) => string;
    /** Push a confirmation dialog. Returns its stack id. */
    confirm: (options: ConfirmModalOptions) => string;
    /** Remove the modal with the given id. */
    close: (id: string) => void;
    /** Remove every modal from the stack. */
    closeAll: () => void;
}

interface ContentEntry {
    kind: "content";
    id: string;
    options: OpenModalOptions;
}

interface ConfirmEntry {
    kind: "confirm";
    id: string;
    options: ConfirmModalOptions;
}

type StackEntry = ContentEntry | ConfirmEntry;

const ModalsContext = createContext<ModalsApi | null>(null);

/** Props for {@link ModalsProvider}. */
export interface ModalsProviderProps {
    children: ReactNode;
}

/**
 * Provides imperative modal control via {@link useModals} and renders the open
 * modal stack. Mount once near the app root.
 *
 * @example
 * <ModalsProvider>
 *     <App />
 * </ModalsProvider>
 */
export function ModalsProvider({ children }: ModalsProviderProps) {
    const [stack, setStack] = useState<StackEntry[]>([]);
    const counter = useRef(0);

    const nextId = useCallback((): string => {
        counter.current += 1;
        return `modal-${counter.current}`;
    }, []);

    const close = useCallback((id: string): void => {
        setStack((current) => current.filter((entry) => entry.id !== id));
    }, []);

    const closeAll = useCallback((): void => {
        setStack([]);
    }, []);

    const open = useCallback(
        (options: OpenModalOptions): string => {
            const id = nextId();
            setStack((current) => [...current, { kind: "content", id, options }]);
            return id;
        },
        [nextId],
    );

    const confirm = useCallback(
        (options: ConfirmModalOptions): string => {
            const id = nextId();
            setStack((current) => [...current, { kind: "confirm", id, options }]);
            return id;
        },
        [nextId],
    );

    const api = useMemo<ModalsApi>(
        () => ({ open, confirm, close, closeAll }),
        [open, confirm, close, closeAll],
    );

    return (
        <ModalsContext.Provider value={api}>
            {children}
            <div className={styles.stack}>
                {stack.map((entry) =>
                    entry.kind === "content" ? (
                        <ContentModal key={entry.id} entry={entry} close={close} />
                    ) : (
                        <ConfirmModal key={entry.id} entry={entry} close={close} />
                    ),
                )}
            </div>
        </ModalsContext.Provider>
    );
}

interface ContentModalProps {
    entry: ContentEntry;
    close: (id: string) => void;
}

function ContentModal({ entry, close }: ContentModalProps) {
    const { options, id } = entry;
    const handleClose = (): void => {
        options.onClose?.();
        close(id);
    };
    return (
        <Modal
            open
            onClose={handleClose}
            title={options.title}
            size={options.size}
            closeOnBackdrop={options.closeOnBackdrop}
            closeOnEsc={options.closeOnEsc}
            hideCloseButton={options.hideCloseButton}
        >
            {options.children}
        </Modal>
    );
}

interface ConfirmModalProps {
    entry: ConfirmEntry;
    close: (id: string) => void;
}

function ConfirmModal({ entry, close }: ConfirmModalProps) {
    const { options, id } = entry;
    const [loading, setLoading] = useState(false);

    const handleConfirm = async (): Promise<void> => {
        try {
            setLoading(true);
            await options.onConfirm?.();
        } finally {
            setLoading(false);
            close(id);
        }
    };

    const handleCancel = (): void => {
        options.onCancel?.();
        close(id);
    };

    return (
        <ConfirmDialog
            open
            title={options.title ?? ""}
            description={options.message}
            confirmLabel={options.confirmLabel}
            cancelLabel={options.cancelLabel}
            variant={options.danger ? "danger" : "primary"}
            loading={loading}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
        />
    );
}

/**
 * Access the imperative modals API. Must be used within a {@link ModalsProvider}.
 *
 * @example
 * const modals = useModals();
 * modals.confirm({ message: "Excluir item?", danger: true, onConfirm: del });
 *
 * @throws Error when called outside a {@link ModalsProvider}.
 */
export function useModals(): ModalsApi {
    const api = useContext(ModalsContext);
    if (api === null) {
        throw new Error("useModals must be used within a <ModalsProvider>");
    }
    return api;
}
