import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

/** Where a dragged item would land if dropped now. */
export interface SortableDropTarget {
    /** Index the item started at. */
    from: number;
    /** Index it would move to. */
    to: number;
}

/** Props to spread on each sortable item. */
export interface SortableItemProps {
    /** Marks the item for hit-testing. */
    "data-sortable-index": number;
    /** `true` while this item is the one being moved. */
    "data-sortable-active"?: boolean;
    /** Grab handle wiring: starts a pointer drag. */
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    /** Keyboard reordering — see {@link UseSortableResult}. */
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
    /** Puts the item in the tab order so the keyboard path is reachable. */
    tabIndex: number;
    role: "option";
    "aria-roledescription": string;
    "aria-selected": boolean;
}

export interface UseSortableOptions {
    /** How many items are in the list. Changing it cancels an in-flight drag. */
    itemCount: number;
    /**
     * Called once, when a move is committed — on pointer release or on a keyboard
     * move. Never called mid-drag, so a controlled list re-renders once instead of
     * on every pointer frame.
     */
    onReorder: (target: SortableDropTarget) => void;
    /** Blocks all interaction. */
    disabled?: boolean;
    /**
     * Description announced for each item, so a screen reader user learns the
     * keyboard contract. Default is in English — override it to localize.
     */
    roleDescription?: string;
}

export interface UseSortableResult {
    /** Index being dragged, or `null` when idle. */
    activeIndex: number | null;
    /** Index the item would land on, or `null` when idle. */
    overIndex: number | null;
    /** Spread on each item. */
    getItemProps: (index: number) => SortableItemProps;
    /** Spread on the list container (`role="listbox"` + a label of your own). */
    getListProps: () => { role: "listbox"; "aria-orientation": "vertical" };
    /** Abort the current drag without reordering. */
    cancel: () => void;
}

/** Reorder helper: move `from` to `to`, returning a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return items;
    }
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/** Index of the sortable item under a viewport point, or `null`. */
function indexAtPoint(container: HTMLElement | null, x: number, y: number): number | null {
    if (!container) return null;
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-index]"));
    for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
            const index = Number(item.dataset.sortableIndex);
            return Number.isNaN(index) ? null : index;
        }
    }
    return null;
}

/**
 * Drag-to-reorder for a list, with a **keyboard path of equal standing**.
 *
 * Pointer events cover mouse, touch and stylus through one code path, and pointer
 * capture keeps the drag alive when the pointer leaves the item. `Space` picks an
 * item up, the arrows move it, `Space`/`Enter` drops it and `Escape` cancels —
 * because a reorder that only works by dragging excludes keyboard users
 * completely, which is where most drag-and-drop implementations fail.
 *
 * The hook owns interaction only: it never mutates your data. `onReorder` fires
 * once per committed move and you apply it, typically with {@link moveItem}. That
 * keeps the list a controlled value and avoids a re-render per pointer frame.
 *
 * Hit-testing reads the live DOM rects of `[data-sortable-index]` children rather
 * than assuming a fixed row height, so it works with rows of different sizes.
 *
 * A change in `itemCount` cancels an in-flight drag: the list no longer has the
 * indices the drag was based on, and committing anyway would move the wrong row.
 *
 * @example
 * ```tsx
 * const [items, setItems] = useState(["Alfa", "Bravo", "Charlie"]);
 * const sortable = useSortable({
 *   itemCount: items.length,
 *   onReorder: ({ from, to }) => setItems((current) => moveItem(current, from, to)),
 * });
 *
 * <ul {...sortable.getListProps()} aria-label="Prioridade" ref={sortable.ref}>
 *   {items.map((item, index) => (
 *     <li key={item} {...sortable.getItemProps(index)}>
 *       {item}
 *     </li>
 *   ))}
 * </ul>
 * ```
 */
export function useSortable(
    options: UseSortableOptions,
): UseSortableResult & { ref: (node: HTMLElement | null) => void } {
    const { itemCount, onReorder, disabled = false, roleDescription = "Sortable item" } = options;

    const [activeIndex, setActiveIndexState] = useState<number | null>(null);
    const [overIndex, setOverIndexState] = useState<number | null>(null);
    const containerRef = useRef<HTMLElement | null>(null);
    const onReorderRef = useRef(onReorder);

    /**
     * Mirrors of the two indices.
     *
     * The window-level `pointerup` listener has to read both values *synchronously*
     * to know what to commit, and a state setter only exposes one of them. Mirroring
     * into refs keeps the commit readable instead of nesting setters to smuggle the
     * other value out.
     */
    const activeRef = useRef<number | null>(null);
    const overRef = useRef<number | null>(null);

    const setActiveIndex = useCallback((value: number | null): void => {
        activeRef.current = value;
        setActiveIndexState(value);
    }, []);

    const setOverIndex = useCallback((value: number | null): void => {
        overRef.current = value;
        setOverIndexState(value);
    }, []);

    useEffect(() => {
        onReorderRef.current = onReorder;
    }, [onReorder]);

    const reset = useCallback((): void => {
        setActiveIndex(null);
        setOverIndex(null);
    }, [setActiveIndex, setOverIndex]);

    useEffect(() => {
        reset();
    }, [itemCount, reset]);

    const commit = useCallback(
        (from: number, to: number): void => {
            if (from !== to) onReorderRef.current({ from, to });
            reset();
        },
        [reset],
    );

    const ref = useCallback((node: HTMLElement | null): void => {
        containerRef.current = node;
    }, []);

    const handlePointerDown = useCallback(
        (index: number, event: ReactPointerEvent<HTMLElement>): void => {
            if (disabled) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setActiveIndex(index);
            setOverIndex(index);
        },
        [disabled, setActiveIndex, setOverIndex],
    );

    useEffect(() => {
        if (activeIndex === null) return;

        function onPointerMove(event: PointerEvent): void {
            const index = indexAtPoint(containerRef.current, event.clientX, event.clientY);
            if (index !== null) setOverIndex(index);
        }

        function onPointerUp(): void {
            const from = activeRef.current;
            const to = overRef.current;
            if (from !== null && to !== null) commit(from, to);
            else reset();
        }

        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === "Escape") reset();
        }

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", reset);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", reset);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [activeIndex, commit, reset, setOverIndex]);

    const handleKeyDown = useCallback(
        (index: number, event: ReactKeyboardEvent<HTMLElement>): void => {
            if (disabled) return;
            const picked = activeIndex !== null;

            switch (event.key) {
                case " ":
                case "Enter":
                    event.preventDefault();
                    if (!picked) {
                        setActiveIndex(index);
                        setOverIndex(index);
                    } else if (overIndex !== null) {
                        commit(activeIndex, overIndex);
                    }
                    break;
                case "ArrowDown":
                case "ArrowRight": {
                    if (!picked) return;
                    event.preventDefault();
                    if (overRef.current !== null) {
                        setOverIndex(Math.min(overRef.current + 1, itemCount - 1));
                    }
                    break;
                }
                case "ArrowUp":
                case "ArrowLeft": {
                    if (!picked) return;
                    event.preventDefault();
                    if (overRef.current !== null) {
                        setOverIndex(Math.max(overRef.current - 1, 0));
                    }
                    break;
                }
                case "Escape":
                    if (!picked) return;
                    event.preventDefault();
                    reset();
                    break;
                default:
                    break;
            }
        },
        [activeIndex, commit, disabled, itemCount, overIndex, reset, setActiveIndex, setOverIndex],
    );

    const getItemProps = useCallback(
        (index: number): SortableItemProps => ({
            "data-sortable-index": index,
            "data-sortable-active": activeIndex === index || undefined,
            onPointerDown: (event) => handlePointerDown(index, event),
            onKeyDown: (event) => handleKeyDown(index, event),
            tabIndex: disabled ? -1 : 0,
            role: "option",
            "aria-roledescription": roleDescription,
            "aria-selected": activeIndex === index,
        }),
        [activeIndex, disabled, handleKeyDown, handlePointerDown, roleDescription],
    );

    const getListProps = useCallback(
        () => ({ role: "listbox" as const, "aria-orientation": "vertical" as const }),
        [],
    );

    return { activeIndex, overIndex, getItemProps, getListProps, cancel: reset, ref };
}
