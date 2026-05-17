import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import styles from "./Toast.module.css";

export type ToastVariant = "success" | "warning" | "error" | "info";

export interface ToastOptions {
    id?: string;
    title?: string;
    description?: string;
    variant?: ToastVariant;
    /** Auto-dismiss timeout in ms. Pass `0` to keep the toast until dismissed manually. */
    duration?: number;
}

interface ToastEntry extends Required<Omit<ToastOptions, "id" | "title" | "description">> {
    id: string;
    title?: string;
    description?: string;
}

export interface ToastApi {
    show: (options: ToastOptions) => string;
    dismiss: (id: string) => void;
    success: (
        description: string,
        options?: Omit<ToastOptions, "variant" | "description">,
    ) => string;
    error: (description: string, options?: Omit<ToastOptions, "variant" | "description">) => string;
    warning: (
        description: string,
        options?: Omit<ToastOptions, "variant" | "description">,
    ) => string;
    info: (description: string, options?: Omit<ToastOptions, "variant" | "description">) => string;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Access the toast API. Must be used inside a {@link ToastProvider}.
 *
 * @returns Methods to show and dismiss toasts.
 */
export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used inside a <ToastProvider>");
    return ctx;
}

export type ToastPosition =
    | "top-right"
    | "top-left"
    | "top-center"
    | "bottom-right"
    | "bottom-left"
    | "bottom-center";

export interface ToastProviderProps {
    children: ReactNode;
    /** Default auto-dismiss duration (ms). Default 4000. */
    defaultDuration?: number;
    /** Stack position on screen. Default `"top-right"`. */
    position?: ToastPosition;
}

/**
 * Renders a portalled toast container and exposes the imperative {@link useToast} API.
 */
export function ToastProvider({
    children,
    defaultDuration = 4000,
    position = "top-right",
}: ToastProviderProps) {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);
    const counter = useRef<number>(0);

    const dismiss = useCallback((id: string): void => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const show = useCallback(
        (options: ToastOptions): string => {
            const id = options.id ?? `toast-${++counter.current}`;
            const entry: ToastEntry = {
                id,
                title: options.title,
                description: options.description,
                variant: options.variant ?? "info",
                duration: options.duration ?? defaultDuration,
            };
            setToasts((current) => [...current, entry]);
            return id;
        },
        [defaultDuration],
    );

    const api = useMemo<ToastApi>(
        () => ({
            show,
            dismiss,
            success: (description, options) =>
                show({ ...options, description, variant: "success" }),
            error: (description, options) => show({ ...options, description, variant: "error" }),
            warning: (description, options) =>
                show({ ...options, description, variant: "warning" }),
            info: (description, options) => show({ ...options, description, variant: "info" }),
        }),
        [show, dismiss],
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} position={position} />
        </ToastContext.Provider>
    );
}

interface ContainerProps {
    toasts: ToastEntry[];
    onDismiss: (id: string) => void;
    position: ToastPosition;
}

function positionClass(position: ToastPosition): string {
    switch (position) {
        case "top-left":
            return styles.positionTopLeft;
        case "top-center":
            return styles.positionTopCenter;
        case "bottom-right":
            return styles.positionBottomRight;
        case "bottom-left":
            return styles.positionBottomLeft;
        case "bottom-center":
            return styles.positionBottomCenter;
        case "top-right":
        default:
            return styles.positionTopRight;
    }
}

function ToastContainer({ toasts, onDismiss, position }: ContainerProps) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            className={cn(styles.container, positionClass(position))}
            aria-live="polite"
            aria-atomic="true"
        >
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>,
        document.body,
    );
}

interface ItemProps {
    toast: ToastEntry;
    onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ItemProps) {
    useEffect(() => {
        if (!toast.duration) return;
        const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <div className={cn(styles.toast, styles[toast.variant])} role="status">
            <div>
                {toast.title && <p className={styles.title}>{toast.title}</p>}
                {toast.description && <p className={styles.description}>{toast.description}</p>}
            </div>
            <button
                type="button"
                className={styles.close}
                aria-label="Fechar notificação"
                onClick={() => onDismiss(toast.id)}
            >
                <CloseIcon />
            </button>
        </div>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
