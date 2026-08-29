/**
 * @tempest-limits file-lines, function-lines — the body owns placement, outside-
 * click, and the whole APG menu-button keyboard model, which has to see the entire
 * entry list to know where the next stop is. Splitting it would move the focus
 * bookkeeping away from the list it indexes into.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./DropdownMenu.module.css";

export type DropdownMenuPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export type DropdownMenuEntry =
    | {
          type: "item";
          id: string;
          label: ReactNode;
          icon?: ReactNode;
          danger?: boolean;
          disabled?: boolean;
          onSelect: () => void;
      }
    | {
          /**
           * An entry that carries on/off state.
           *
           * Rendered as `role="menuitemcheckbox"` with `aria-checked`, which is how
           * a screen reader announces "checked" instead of leaving the state
           * invisible. Selecting it does **not** close the menu: toggling two
           * settings in a row is the ordinary case, and closing after the first
           * would make the second a second trip.
           */
          type: "checkbox";
          id: string;
          label: ReactNode;
          icon?: ReactNode;
          checked: boolean;
          disabled?: boolean;
          onSelect: () => void;
      }
    | { type: "separator"; id: string }
    | { type: "label"; id: string; label: ReactNode };

/** The entry kinds a user can move focus to and activate. */
type SelectableEntry = Extract<DropdownMenuEntry, { type: "item" | "checkbox" }>;

export interface DropdownMenuProps {
    trigger: ReactElement<{
        onClick?: (e: React.MouseEvent) => void;
        onKeyDown?: (e: ReactKeyboardEvent) => void;
        "aria-expanded"?: boolean;
        "aria-controls"?: string;
        "aria-haspopup"?: boolean | "menu";
    }>;
    items: DropdownMenuEntry[];
    placement?: DropdownMenuPlacement;
    className?: string;
}

function placementClass(placement: DropdownMenuPlacement): string {
    switch (placement) {
        case "bottom-end":
            return styles.bottomEnd;
        case "top-start":
            return styles.topStart;
        case "top-end":
            return styles.topEnd;
        case "bottom-start":
        default:
            return styles.bottomStart;
    }
}

/** Whether an entry can take focus — an item or checkbox that is not disabled. */
function isSelectable(entry: DropdownMenuEntry): entry is SelectableEntry {
    return (entry.type === "item" || entry.type === "checkbox") && !entry.disabled;
}

/**
 * Dropdown menu — a list of actions anchored to a trigger, following the
 * [APG menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
 *
 * `role="menu"` is a promise about the keyboard, and this component keeps it:
 *
 * - `Enter`, `Space` or `ArrowDown` on the trigger opens and focuses the first
 *   entry; `ArrowUp` opens and focuses the last.
 * - `ArrowUp` / `ArrowDown` move with wrap, `Home` / `End` jump to the ends.
 * - `Escape` closes and returns focus to the trigger, so the next `Tab` continues
 *   from where the user was rather than from the top of the document.
 * - `Tab` closes the menu and lets the page's own tab order take over.
 * - Focus is managed: entries carry `tabIndex={-1}` and only the active one is
 *   `0`, which is what stops `Tab` from walking the menu one entry at a time.
 *
 * Disabled entries, separators and labels are skipped by every movement.
 */
export function DropdownMenu({
    trigger,
    items,
    placement = "bottom-start",
    className,
}: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const id = useId();
    const rootRef = useRef<HTMLSpanElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const pendingFocus = useRef<"first" | "last" | null>(null);

    const selectable = items
        .map((entry, index) => (isSelectable(entry) ? index : -1))
        .filter((index) => index !== -1);

    /**
     * Focus the trigger again.
     *
     * Found through the `aria-haspopup` this component puts on it, rather than
     * through a ref: `ref` lives in different places in React 18 and 19, and a
     * consumer's custom trigger is under no obligation to forward one. The
     * attribute is on the element either way.
     *
     * @returns Nothing.
     */
    const focusTrigger = useCallback((): void => {
        rootRef.current?.querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus();
    }, []);

    const close = useCallback(
        (restoreFocus: boolean): void => {
            setOpen(false);
            setActiveIndex(-1);
            if (restoreFocus) focusTrigger();
        },
        [focusTrigger],
    );

    const focusIndex = useCallback((index: number): void => {
        setActiveIndex(index);
        itemRefs.current[index]?.focus();
    }, []);

    /**
     * Move focus to the entry `step` positions away, wrapping at both ends.
     *
     * Walks the selectable positions rather than the raw list, so separators,
     * labels and disabled entries are never a stop.
     */
    const move = (step: number): void => {
        if (selectable.length === 0) return;
        const current = selectable.indexOf(activeIndex);
        const next = (current + step + selectable.length) % selectable.length;
        focusIndex(selectable[next] ?? -1);
    };

    useEffect(() => {
        if (!open || pendingFocus.current === null) return;
        const target = pendingFocus.current === "last" ? selectable.at(-1) : selectable[0];
        pendingFocus.current = null;
        if (target !== undefined) focusIndex(target);
    }, [open, selectable, focusIndex]);

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, close]);

    const openWith = (edge: "first" | "last"): void => {
        pendingFocus.current = edge;
        setOpen(true);
    };

    const handleTriggerKeyDown = (event: ReactKeyboardEvent): void => {
        trigger.props.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ArrowDown" || (!open && (event.key === "Enter" || event.key === " "))) {
            event.preventDefault();
            openWith("first");
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            openWith("last");
        }
    };

    /**
     * Keyboard model of the open menu.
     *
     * Handled on the list rather than on `window`: focus is inside the menu by
     * then, so the keys arrive here by bubbling and cannot be pre-empted by an
     * unrelated global listener — which is how the arrows used to go missing in a
     * host application.
     */
    const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                move(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                move(-1);
                break;
            case "Home":
                event.preventDefault();
                if (selectable[0] !== undefined) focusIndex(selectable[0]);
                break;
            case "End": {
                event.preventDefault();
                const last = selectable.at(-1);
                if (last !== undefined) focusIndex(last);
                break;
            }
            case "Escape":
                event.preventDefault();
                close(true);
                break;
            case "Tab":
                close(false);
                break;
            default:
                break;
        }
    };

    const handleTriggerClick = (event: React.MouseEvent): void => {
        trigger.props.onClick?.(event);
        if (event.defaultPrevented) return;
        if (open) {
            close(false);
            return;
        }
        openWith("first");
    };

    const triggerClone = {
        ...trigger,
        props: {
            ...trigger.props,
            onClick: handleTriggerClick,
            onKeyDown: handleTriggerKeyDown,
            "aria-expanded": open,
            "aria-controls": id,
            "aria-haspopup": "menu" as const,
        },
    } as ReactElement;

    const handleSelect = (entry: SelectableEntry): void => {
        entry.onSelect();
        if (entry.type === "checkbox") return;
        close(true);
    };

    return (
        <span ref={rootRef} className={styles.root}>
            {triggerClone}
            {open && (
                <ul
                    id={id}
                    role="menu"
                    className={cn(styles.menu, placementClass(placement), className)}
                    onKeyDown={handleMenuKeyDown}
                >
                    {items.map((entry, index) => {
                        if (entry.type === "separator") {
                            return (
                                <li
                                    key={entry.id}
                                    role="separator"
                                    className={styles.separator}
                                    aria-hidden
                                />
                            );
                        }
                        if (entry.type === "label") {
                            return (
                                <li key={entry.id} role="presentation" className={styles.label}>
                                    {entry.label}
                                </li>
                            );
                        }
                        const checkbox = entry.type === "checkbox";
                        return (
                            <li key={entry.id} role="none">
                                <button
                                    ref={(el) => {
                                        itemRefs.current[index] = el;
                                    }}
                                    type="button"
                                    role={checkbox ? "menuitemcheckbox" : "menuitem"}
                                    aria-checked={checkbox ? entry.checked : undefined}
                                    tabIndex={activeIndex === index ? 0 : -1}
                                    className={cn(
                                        styles.item,
                                        entry.type === "item" && entry.danger && styles.danger,
                                        activeIndex === index && styles.active,
                                    )}
                                    disabled={entry.disabled}
                                    onClick={() => handleSelect(entry)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    {entry.icon && <span aria-hidden>{entry.icon}</span>}
                                    {entry.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </span>
    );
}
