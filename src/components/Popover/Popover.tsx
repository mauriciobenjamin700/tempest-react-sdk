/**
 * @tempest-limits props-count — trigger and children are the two halves, placement
 * is where it lands, portal is whether it escapes the tree, and open/onOpenChange/defaultOpen is the standard controlled-
 * or-not pair. closeOnEsc and closeOnOutsideClick are separate because a popover
 * holding a form wants one and not the other.
 */
import { useCallback, useEffect, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
import { usePortalTabOrder } from "@/components/Portal/tab-bridge";
import { cn } from "@/utils/cn";
import styles from "./Popover.module.css";

export type PopoverPlacement = "top" | "bottom" | "left" | "right";

export interface PopoverProps {
    /** Trigger element. Receives `onClick`/`aria-expanded`/`aria-controls`. */
    trigger: ReactElement<{
        onClick?: (e: React.MouseEvent) => void;
        "aria-expanded"?: boolean;
        "aria-controls"?: string;
    }>;
    children: ReactNode;
    placement?: PopoverPlacement;
    /**
     * Render the panel in a portal, positioned against the trigger. Default `true`.
     *
     * In flow, any ancestor with `overflow` other than `visible` clips the panel —
     * inside a `DataTable` cell only 3% of it was visible (measured in Chrome at
     * 1440 px). In a portal it escapes the clip, flips to the opposite side when
     * the requested one has no room, and follows the trigger on scroll and resize.
     * `false` keeps the in-flow panel.
     */
    portal?: boolean;
    /** Controlled open state. */
    open?: boolean;
    /** Called when the user toggles or dismisses. */
    onOpenChange?: (open: boolean) => void;
    /** Default open state for uncontrolled usage. */
    defaultOpen?: boolean;
    /** Close on Escape. Default true. */
    closeOnEsc?: boolean;
    /** Close on outside click. Default true. */
    closeOnOutsideClick?: boolean;
    className?: string;
}

/** Gap between trigger and panel, in px — the in-flow CSS uses the same 8 px. */
const POPOVER_OFFSET = 8;

/**
 * Lightweight popover. Renders a panel anchored to a trigger, dismissed on
 * outside click / Escape.
 *
 * Portalled by default, with viewport-aware placement: the panel flips to the
 * opposite side when the requested one overflows, and is clamped inside the
 * viewport otherwise.
 */
export function Popover({
    trigger,
    children,
    placement = "bottom",
    portal = true,
    open,
    onOpenChange,
    defaultOpen = false,
    closeOnEsc = true,
    closeOnOutsideClick = true,
    className,
}: PopoverProps) {
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;
    const id = useId();
    const [rootNode, setRootNode] = useState<HTMLSpanElement | null>(null);
    const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
    const floatingStyle = useAnchorPosition({
        anchor: rootNode,
        floating: panelNode,
        side: placement,
        align: "center",
        offset: POPOVER_OFFSET,
        enabled: portal && isOpen,
    });
    usePortalTabOrder({ enabled: portal && isOpen, anchor: rootNode, panel: panelNode });

    const setOpen = useCallback(
        (next: boolean): void => {
            if (!isControlled) setInternalOpen(next);
            onOpenChange?.(next);
        },
        [isControlled, onOpenChange],
    );

    /**
     * Dismiss on Escape and on a press outside both trigger and panel.
     *
     * The panel is checked on its own because in a portal it is not inside the
     * trigger's wrapper, and a press inside it — on a form field, say — would
     * otherwise count as outside.
     */
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent): void => {
            if (closeOnEsc && event.key === "Escape") setOpen(false);
        };
        const onDown = (event: MouseEvent): void => {
            if (!closeOnOutsideClick) return;
            const target = event.target as Node;
            if (rootNode?.contains(target) || panelNode?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [isOpen, closeOnEsc, closeOnOutsideClick, setOpen, rootNode, panelNode]);

    const handleTriggerClick = (event: React.MouseEvent): void => {
        trigger.props.onClick?.(event);
        setOpen(!isOpen);
    };

    const triggerClone = {
        ...trigger,
        props: {
            ...trigger.props,
            onClick: handleTriggerClick,
            "aria-expanded": isOpen,
            "aria-controls": id,
        },
    } as ReactElement;

    const panel = (
        <div
            ref={setPanelNode}
            id={id}
            role="dialog"
            className={cn(styles.popover, portal ? styles.portalled : styles[placement], className)}
            style={floatingStyle}
        >
            {children}
        </div>
    );

    return (
        <span ref={setRootNode} className={styles.root}>
            {triggerClone}
            {isOpen && (portal ? <Portal>{panel}</Portal> : panel)}
        </span>
    );
}
