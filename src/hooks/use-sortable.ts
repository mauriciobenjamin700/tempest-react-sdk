/**
 * @tempest-limits file-lines, hook-lines — drag-and-drop with a keyboard path that
 * has to produce the same moves as the pointer path: pointer capture, auto-scroll
 * near the edges, the drop-index maths and the live-region announcements all read
 * one drag state. Two hooks would mean two copies of the index arithmetic, and the
 * two paths silently disagreeing is the bug this exists to prevent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

/** Where a dragged item would land if dropped now. */
export interface SortableDropTarget {
    /** Index the item started at, within its own group. */
    from: number;
    /** Index it would move to, within the destination group. */
    to: number;
    /**
     * Group the item started in — a Kanban column, for instance. `undefined` for a
     * plain single-list sortable.
     */
    fromGroup?: string;
    /** Destination group. Equal to `fromGroup` when the move stays in one group. */
    toGroup?: string;
}

/** Props to spread on each sortable item. */
export interface SortableItemProps {
    /** Marks the item for hit-testing. */
    "data-sortable-index": number;
    /** Group the item belongs to, when the sortable spans several lists. */
    "data-sortable-group"?: string;
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
    /**
     * How many items are in the sortable. Changing it cancels an in-flight drag.
     *
     * With groups, pass the **total** across groups: the number only has to change
     * whenever the indices the drag was based on stop being valid.
     */
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
    /** Group the dragged item came from, when using groups. */
    activeGroup?: string;
    /** Group the item is currently over, when using groups. */
    overGroup?: string;
    /**
     * Spread on each item. Pass `group` when the sortable spans several lists (a
     * Kanban column id), so a drop can land in a different group.
     */
    getItemProps: (index: number, group?: string) => SortableItemProps;
    /**
     * Spread on an **empty** group's drop area, so an item can be moved into a
     * column that has no cards yet — hit-testing works off item rects, and a group
     * with no items has none.
     */
    getEmptyGroupProps: (group: string) => {
        "data-sortable-group": string;
        "data-sortable-empty": true;
    };
    /** Spread on the list container (`role="listbox"` + a label of your own). */
    getListProps: () => { role: "listbox"; "aria-orientation": "vertical" };
    /** Abort the current drag without reordering. */
    cancel: () => void;
    /**
     * Callback ref for the element that contains the sortable items — hit-testing
     * searches inside it.
     *
     * Named `setContainer` rather than `ref` because it is a **callback**, not a ref
     * object: `ref={sortable.setContainer}`. The old name also read as a readable
     * ref to the React Compiler rules, which flagged every consumer.
     */
    setContainer: (node: HTMLElement | null) => void;
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

/** A hit-test result: the item (or empty group) under the pointer. */
interface HitTarget {
    index: number;
    group?: string;
}

/**
 * Find the sortable slot under a viewport point.
 *
 * Items are tried first; an empty group's drop area is only considered when no item
 * matched, since an empty column is a fallback target rather than a competing one.
 */
function targetAtPoint(container: HTMLElement | null, x: number, y: number): HitTarget | null {
    if (!container) return null;
    const inside = (element: HTMLElement): boolean => {
        const rect = element.getBoundingClientRect();
        return y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right;
    };

    for (const item of Array.from(
        container.querySelectorAll<HTMLElement>("[data-sortable-index]"),
    )) {
        if (!inside(item)) continue;
        const index = Number(item.dataset.sortableIndex);
        if (Number.isNaN(index)) return null;
        return { index, group: item.dataset.sortableGroup };
    }

    for (const empty of Array.from(
        container.querySelectorAll<HTMLElement>("[data-sortable-empty]"),
    )) {
        if (inside(empty)) return { index: 0, group: empty.dataset.sortableGroup };
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
 * Note for consumers: the indices and groups are exposed as **state** (so rendering
 * from them is reactive) and mirrored into refs only so the window-level `pointerup`
 * listener can read both synchronously. Because the handlers returned by
 * `getItemProps` close over those mirrors, the React Compiler `refs` rule reports
 * the *call site* — a component spreading these props may need a file-level
 * exemption, as `Kanban` documents.
 *
 * @example
 * ```tsx
 * const [items, setItems] = useState(["Alfa", "Bravo", "Charlie"]);
 * const sortable = useSortable({
 *   itemCount: items.length,
 *   onReorder: ({ from, to }) => setItems((current) => moveItem(current, from, to)),
 * });
 *
 * <ul {...sortable.getListProps()} aria-label="Prioridade" ref={sortable.setContainer}>
 *   {items.map((item, index) => (
 *     <li key={item} {...sortable.getItemProps(index)}>
 *       {item}
 *     </li>
 *   ))}
 * </ul>
 * ```
 */
export function useSortable(options: UseSortableOptions): UseSortableResult {
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
    const [activeGroup, setActiveGroupState] = useState<string | undefined>(undefined);
    const [overGroup, setOverGroupState] = useState<string | undefined>(undefined);
    const activeGroupRef = useRef<string | undefined>(undefined);
    const overGroupRef = useRef<string | undefined>(undefined);

    const setActiveGroup = useCallback((value: string | undefined): void => {
        activeGroupRef.current = value;
        setActiveGroupState(value);
    }, []);

    const setOverGroup = useCallback((value: string | undefined): void => {
        overGroupRef.current = value;
        setOverGroupState(value);
    }, []);

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
        setActiveGroup(undefined);
        setOverGroup(undefined);
        setActiveIndex(null);
        setOverIndex(null);
    }, [setActiveGroup, setActiveIndex, setOverGroup, setOverIndex]);

    useEffect(() => {
        reset();
    }, [itemCount, reset]);

    /**
     * Report a committed move and go back to idle.
     *
     * The groups are **arguments**, not reads of the mirror refs: `commit` ends up
     * inside the props returned by `getItemProps`, which render calls, and a ref read
     * anywhere in that closure chain is a render-time ref access. The pointer
     * listener reads the mirrors itself — it is an event handler, where reading is
     * fine — and hands the values over.
     *
     * A move that changes group counts even at the same index (the card lands in
     * another column), so only a same-group, same-index drop is "nothing happened".
     */
    const commit = useCallback(
        (from: number, to: number, fromGroup?: string, toGroup?: string): void => {
            if (from !== to || fromGroup !== toGroup) {
                onReorderRef.current({ from, to, fromGroup, toGroup });
            }
            reset();
        },
        [reset],
    );

    const setContainer = useCallback((node: HTMLElement | null): void => {
        containerRef.current = node;
    }, []);

    const handlePointerDown = useCallback(
        (index: number, group: string | undefined, event: ReactPointerEvent<HTMLElement>): void => {
            if (disabled) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setActiveGroup(group);
            setOverGroup(group);
            setActiveIndex(index);
            setOverIndex(index);
        },
        [disabled, setActiveGroup, setActiveIndex, setOverGroup, setOverIndex],
    );

    useEffect(() => {
        if (activeIndex === null) return;

        function onPointerMove(event: PointerEvent): void {
            const target = targetAtPoint(containerRef.current, event.clientX, event.clientY);
            if (!target) return;
            setOverGroup(target.group);
            setOverIndex(target.index);
        }

        function onPointerUp(): void {
            const from = activeRef.current;
            const to = overRef.current;
            if (from !== null && to !== null) {
                commit(from, to, activeGroupRef.current, overGroupRef.current);
            } else {
                reset();
            }
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
    }, [activeIndex, commit, reset, setOverGroup, setOverIndex]);

    const handleKeyDown = useCallback(
        (
            index: number,
            group: string | undefined,
            event: ReactKeyboardEvent<HTMLElement>,
        ): void => {
            if (disabled) return;
            const picked = activeIndex !== null;

            switch (event.key) {
                case " ":
                case "Enter":
                    event.preventDefault();
                    if (!picked) {
                        setActiveGroup(group);
                        setOverGroup(group);
                        setActiveIndex(index);
                        setOverIndex(index);
                    } else if (overIndex !== null) {
                        commit(activeIndex, overIndex, activeGroup, overGroup);
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
        [
            activeGroup,
            activeIndex,
            commit,
            overGroup,
            disabled,
            itemCount,
            overIndex,
            reset,
            setActiveGroup,
            setActiveIndex,
            setOverGroup,
            setOverIndex,
        ],
    );

    const getItemProps = useCallback(
        (index: number, group?: string): SortableItemProps => ({
            "data-sortable-index": index,
            "data-sortable-group": group,
            "data-sortable-active": (activeIndex === index && activeGroup === group) || undefined,
            onPointerDown: (event) => handlePointerDown(index, group, event),
            onKeyDown: (event) => handleKeyDown(index, group, event),
            tabIndex: disabled ? -1 : 0,
            role: "option",
            "aria-roledescription": roleDescription,
            "aria-selected": activeIndex === index && activeGroup === group,
        }),
        [activeGroup, activeIndex, disabled, handleKeyDown, handlePointerDown, roleDescription],
    );

    const getEmptyGroupProps = useCallback(
        (group: string) => ({ "data-sortable-group": group, "data-sortable-empty": true as const }),
        [],
    );

    const getListProps = useCallback(
        () => ({ role: "listbox" as const, "aria-orientation": "vertical" as const }),
        [],
    );

    return {
        activeIndex,
        overIndex,
        activeGroup,
        overGroup,
        getItemProps,
        getEmptyGroupProps,
        getListProps,
        cancel: reset,
        setContainer,
    };
}
