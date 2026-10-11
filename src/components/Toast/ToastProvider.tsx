/**
 * @tempest-limits file-lines — the provider is the queue: enqueue, dedupe, auto-
 * dismiss timers, pause on hover and the portal that renders them. Splitting the
 * queue from the renderer would put a timer in one file and the element it dismisses
 * in another.
 */
import {
    Children,
    Fragment,
    createContext,
    isValidElement,
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
import { usePortalHost } from "../Portal/portal-host";

export type ToastVariant = "success" | "warning" | "error" | "info";

/**
 * Horizontal alignment of a toast's title and description.
 *
 * `"start"` is the default because a toast is read as a sentence beside a close
 * button: left-aligned lines share one edge with the icon and the stack, so a
 * two-line description stays scannable. `"center"` exists for the short
 * celebratory toast (an achievement with a badge) where the text is one line.
 */
export type ToastAlign = "start" | "center";

export interface ToastOptions {
    id?: string;
    title?: string;
    description?: string;
    variant?: ToastVariant;
    /** Auto-dismiss timeout in ms. Pass `0` to keep the toast until dismissed manually. */
    duration?: number;
    /**
     * Leading slot rendered before the text, e.g. `<img src="/badge.svg" alt="" />`.
     *
     * It is an app asset, so it takes any `ReactNode` — but it is a slot for an
     * **icon**, not for a control. The wrapper is `inert`, so a button or link put
     * here is neither focusable nor clickable; actions belong outside the toast.
     *
     * The slot is decorative (`aria-hidden`) unless {@link ToastOptions.iconLabel}
     * is given: most icons repeat what the title already says, and an unlabelled
     * image inside the live region would otherwise be announced as "image" or by
     * its file name. An `<img>` or `<svg>` anywhere inside it is capped at 32px and
     * keeps its aspect ratio. A node that renders nothing (`null`, a boolean, `""`,
     * `[]`, an empty fragment) counts as no icon, so the toast keeps two columns.
     */
    icon?: ReactNode;
    /**
     * Accessible name for {@link ToastOptions.icon} when the icon carries meaning
     * the text does not. With it the slot becomes `role="img"` with this label and
     * is announced together with the toast; without it the slot is hidden from
     * assistive technology.
     */
    iconLabel?: string;
    /** Text alignment of title and description. Default `"start"`; see {@link ToastAlign}. */
    align?: ToastAlign;
}

interface ToastEntry extends Required<
    Omit<ToastOptions, "id" | "title" | "description" | "icon" | "iconLabel">
> {
    id: string;
    title?: string;
    description?: string;
    icon?: ReactNode;
    iconLabel?: string;
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
    "top-right" | "top-left" | "top-center" | "bottom-right" | "bottom-left" | "bottom-center";

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
                icon: options.icon,
                iconLabel: options.iconLabel,
                align: options.align ?? "start",
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

/**
 * The portalled stack, and the page's live region for toasts.
 *
 * `aria-atomic="false"` matters: with `"true"` a screen reader re-reads the
 * **entire** stack on every change, so the third toast of a batch is announced as
 * all three, and dismissing one re-announces the survivors. `"false"` announces only
 * the node that was added, which is what the user needs.
 *
 * The stack stays the live region rather than delegating to `useAnnounce`, because
 * routing it through the shared announcer would put the same text in the document
 * twice — once visible, once hidden — and every `getByText("Salvo")` in a consuming
 * app's test suite would start matching two nodes. The announcer is for messages
 * that have no on-screen home; a toast has one.
 */
function ToastContainer({ toasts, onDismiss, position }: ContainerProps) {
    const portalHost = usePortalHost();

    if (!portalHost) return null;
    return createPortal(
        <div
            className={cn(styles.container, positionClass(position))}
            aria-live="polite"
            aria-atomic="false"
        >
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>,
        portalHost,
    );
}

interface ItemProps {
    toast: ToastEntry;
    onDismiss: (id: string) => void;
}

/**
 * One toast.
 *
 * No `role="status"` of its own: it already lives inside the container's live
 * region, and a live region nested in a live region is announced twice by some
 * screen readers.
 *
 * With an icon the toast becomes three columns (leading, content, close) and the
 * icon and text are centred vertically against each other, so a 32px badge sits
 * level with a one-line title. Toasts without an icon keep the top-aligned layout
 * and the same size for short text; what changed for them is long text: the text
 * column now wraps a long word (`overflow-wrap: anywhere`) and the close button no
 * longer shrinks (it used to drop from 22px to 16–17px beside a two-line
 * description).
 *
 * The leading wrapper gets `inert` through a callback ref instead of a prop,
 * because no prop value works on both supported Reacts: React 18 drops
 * `inert={true}` with a warning and renders `inert=""`, while React 19 renders
 * `inert={true}` and drops `inert=""`.
 */
function ToastItem({ toast, onDismiss }: ItemProps) {
    useEffect(() => {
        if (!toast.duration) return;
        const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    const hasIcon = rendersSomething(toast.icon);

    return (
        <div
            className={cn(
                styles.toast,
                styles[toast.variant],
                hasIcon && styles.withIcon,
                toast.align === "center" && styles.alignCenter,
            )}
        >
            {hasIcon && (
                <div
                    ref={makeInert}
                    className={styles.leading}
                    {...(toast.iconLabel
                        ? { role: "img", "aria-label": toast.iconLabel }
                        : { "aria-hidden": true })}
                >
                    {toast.icon}
                </div>
            )}
            <div className={styles.content}>
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

/**
 * Whether a node renders anything at all.
 *
 * `Children.toArray` drops `null`, `undefined` and booleans and flattens arrays,
 * but keeps a fragment as one element — so a fragment is unwrapped and checked
 * by its children. `""` renders no text node worth a column either.
 *
 * @param node - The icon slot content.
 * @returns `true` when at least one child would produce output.
 */
function rendersSomething(node: ReactNode): boolean {
    return Children.toArray(node).some((child) => {
        if (child === "") return false;
        if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
            return rendersSomething(child.props.children);
        }
        return true;
    });
}

/**
 * Callback ref that marks the icon wrapper `inert`, on React 18 and 19 alike.
 *
 * @param node - The wrapper element, or `null` on unmount.
 */
function makeInert(node: HTMLDivElement | null): void {
    node?.setAttribute("inert", "");
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
