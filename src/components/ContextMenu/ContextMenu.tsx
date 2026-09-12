/**
 * @tempest-limits file-lines function-lines — the body owns one anchor point and
 * everything that reads from it: the three ways a menu opens (right click, long
 * press, click), the clamp that keeps it inside the viewport, and roving focus
 * for the keyboard path. Splitting them would hand the same geometry to three
 * files.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Portal } from "@/components/Portal";
import styles from "./ContextMenu.module.css";

export type ContextMenuItem =
    | {
          label: ReactNode;
          onSelect?: () => void;
          disabled?: boolean;
          danger?: boolean;
      }
    | { separator: true };

/** How the menu is opened by a pointer. Touch always gets the long press. */
export type ContextMenuTrigger = "contextmenu" | "click" | "both";

export interface ContextMenuProps {
    /** Menu entries — selectable items and separators. */
    items: ContextMenuItem[];
    /** Trigger area. Right-clicking anywhere within opens the menu at the cursor. */
    children: ReactNode;
    /** Extra class names forwarded to the menu element. */
    className?: string;
    /**
     * Which pointer gesture opens the menu. Default `"contextmenu"`.
     *
     * `"click"` is the `⋮` button case, where a right click is the wrong gesture
     * on the desktop and impossible on touch. `"both"` keeps the right click and
     * adds the left one.
     */
    trigger?: ContextMenuTrigger;
    /**
     * Hold, in ms, that opens the menu from a coarse pointer. Default `500`.
     *
     * Set `0` to turn the long press off. It is on by default because touch has
     * no right click: measured in Chrome with touch emulation (Pixel 7 and
     * iPhone 13 profiles), a 900 ms hold fires `pointerdown`, `touchstart`,
     * `pointerup`, `touchend` and `click` — and no `contextmenu` at all. Every
     * action behind this menu was unreachable on a phone.
     */
    longPressDelay?: number;
    /**
     * Gap, in px, kept between the menu and the edge of the viewport. Default `8`.
     */
    viewportMargin?: number;
}

interface Position {
    x: number;
    y: number;
}

/** Movement, in px, that reads as a scroll rather than a hold. */
const LONG_PRESS_MOVE_TOLERANCE = 10;

function isSeparator(item: ContextMenuItem): item is { separator: true } {
    return "separator" in item && item.separator === true;
}

/**
 * Context menu — right click, long press, or click.
 *
 * - Opens at the pointer on `contextmenu`, and on a long press from touch or pen,
 *   which is the gesture those pointers have instead of a right click. `trigger`
 *   adds or replaces the mouse gesture; the long press is independent of it.
 * - Clamped inside the viewport after it mounts, so a menu opened near an edge
 *   moves in rather than overflowing — measured before the clamp: a 180 px menu
 *   opened at `x=235` in a 320 px window ran 95 px off screen, cutting the right
 *   edge off every label.
 * - Rendered through a {@link Portal} so it escapes parent overflow/stacking
 *   contexts.
 * - Closes on outside click, Escape, scroll, resize, or item selection.
 * - Arrow Up/Down move focus across selectable items and wrap; Home/End jump to
 *   the ends; Enter activates the focused item. The menu itself takes focus when
 *   it opens, so a screen reader announces it instead of staying on the trigger.
 *
 * @param props - The context menu props.
 * @returns The trigger wrapper plus the portalled menu when open.
 */
export function ContextMenu({
    items,
    children,
    className,
    trigger = "contextmenu",
    longPressDelay = 500,
    viewportMargin = 8,
}: ContextMenuProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const id = useId();
    const [menuNode, setMenuNode] = useState<HTMLUListElement | null>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressOrigin = useRef<Position | null>(null);

    const selectableIndexes = items
        .map((item, index) => (!isSeparator(item) && !item.disabled ? index : -1))
        .filter((i) => i !== -1);

    const close = useCallback((): void => {
        setOpen(false);
        setActiveIndex(-1);
    }, []);

    const openAt = useCallback((point: Position): void => {
        setPosition(point);
        setActiveIndex(-1);
        setOpen(true);
    }, []);

    const cancelLongPress = useCallback((): void => {
        if (longPressTimer.current !== null) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        longPressOrigin.current = null;
    }, []);

    useEffect(() => cancelLongPress, [cancelLongPress]);

    const handleContextMenu = (event: React.MouseEvent): void => {
        if (trigger === "click") return;
        event.preventDefault();
        openAt({ x: event.clientX, y: event.clientY });
    };

    const handleClick = (event: React.MouseEvent): void => {
        if (trigger === "contextmenu") return;
        openAt({ x: event.clientX, y: event.clientY });
    };

    /**
     * Start the hold that stands in for a right click on a coarse pointer.
     *
     * A mouse is excluded: it has `contextmenu`, and holding the left button is
     * how a drag starts.
     */
    const handlePointerDown = (event: ReactPointerEvent): void => {
        if (longPressDelay <= 0 || event.pointerType === "mouse") return;
        const point = { x: event.clientX, y: event.clientY };
        longPressOrigin.current = point;
        cancelLongPress();
        longPressOrigin.current = point;
        longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            longPressOrigin.current = null;
            suppressNextClick();
            openAt(point);
        }, longPressDelay);
    };

    /**
     * Cancel the hold once the finger travels — otherwise every scroll that
     * starts on the trigger opens a menu, which is the difference between a
     * usable long press and an infuriating one.
     */
    const handlePointerMove = (event: ReactPointerEvent): void => {
        const origin = longPressOrigin.current;
        if (!origin || longPressTimer.current === null) return;
        if (
            Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
            LONG_PRESS_MOVE_TOLERANCE
        ) {
            cancelLongPress();
        }
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                close();
                return;
            }
            const move = (next: number): void => {
                event.preventDefault();
                setActiveIndex(next);
                itemRefs.current[next]?.focus();
            };
            if (selectableIndexes.length === 0) return;
            const current = selectableIndexes.indexOf(activeIndex);
            if (event.key === "ArrowDown") {
                move(selectableIndexes[(current + 1) % selectableIndexes.length] ?? -1);
            }
            if (event.key === "ArrowUp") {
                move(
                    selectableIndexes[
                        (current - 1 + selectableIndexes.length) % selectableIndexes.length
                    ] ?? -1,
                );
            }
            if (event.key === "Home") {
                move(selectableIndexes[0] ?? -1);
            }
            if (event.key === "End") {
                move(selectableIndexes[selectableIndexes.length - 1] ?? -1);
            }
        };
        const onDown = (event: MouseEvent): void => {
            if (menuNode && !menuNode.contains(event.target as Node)) close();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [open, activeIndex, selectableIndexes, close, menuNode]);

    /**
     * Pull the menu inside the viewport, and take focus.
     *
     * Keyed off the node rather than off `open`, because {@link Portal} renders
     * `null` on its first pass and mounts on an effect — an effect that reads a
     * ref when `open` flips runs while the menu does not exist yet, measures
     * nothing and focuses nothing. A callback ref in state is what makes this
     * run on the render that has the element.
     *
     * `useLayoutEffect` runs before paint, so the menu is never painted at the
     * overflowing position first.
     *
     * The size comes from `offsetWidth`/`offsetHeight` rather than from
     * `getBoundingClientRect`, which reports the **transformed** box: the menu
     * enters at `scale(0.96)`, so the rect is 4% small and the clamp lets the
     * grown menu back over the edge. Measured in Chrome at 320 px wide, a 180 px
     * menu came back at `right: 316` against a margin that asked for 312.
     */
    useLayoutEffect(() => {
        if (!open || !menuNode) return;
        menuNode.focus({ preventScroll: true });
        const { offsetWidth, offsetHeight } = menuNode;
        if (offsetWidth === 0 && offsetHeight === 0) return;
        const maxLeft = window.innerWidth - offsetWidth - viewportMargin;
        const maxTop = window.innerHeight - offsetHeight - viewportMargin;
        const left = Math.max(viewportMargin, Math.min(position.x, maxLeft));
        const top = Math.max(viewportMargin, Math.min(position.y, maxTop));
        if (left !== position.x || top !== position.y) setPosition({ x: left, y: top });
    }, [open, menuNode, position.x, position.y, viewportMargin]);

    const handleSelect = (item: Extract<ContextMenuItem, { label: ReactNode }>): void => {
        item.onSelect?.();
        close();
    };

    return (
        <>
            <span
                className={styles.root}
                onContextMenu={handleContextMenu}
                onClick={handleClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
            >
                {children}
            </span>
            {open && (
                <Portal>
                    <ul
                        ref={setMenuNode}
                        id={id}
                        role="menu"
                        aria-orientation="vertical"
                        tabIndex={-1}
                        className={cn(styles.menu, className)}
                        style={{ top: position.y, left: position.x }}
                    >
                        {items.map((item, index) => {
                            if (isSeparator(item)) {
                                return (
                                    <li
                                        key={`separator-${index}`}
                                        role="separator"
                                        className={styles.separator}
                                        aria-hidden
                                    />
                                );
                            }
                            return (
                                <li key={`item-${index}`} role="none">
                                    <button
                                        ref={(el) => {
                                            itemRefs.current[index] = el;
                                        }}
                                        type="button"
                                        role="menuitem"
                                        className={cn(
                                            styles.item,
                                            item.danger && styles.danger,
                                            activeIndex === index && styles.active,
                                        )}
                                        disabled={item.disabled}
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setActiveIndex(index)}
                                    >
                                        {item.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Portal>
            )}
        </>
    );
}

/**
 * Swallow the click a finger leaves behind after a long press.
 *
 * The hold fires while the finger is still down, so the browser goes on to
 * deliver `pointerup` and then `click` to whatever is under it — measured, that
 * is the same element the menu was just opened from. Without this, opening the
 * menu on a chat bubble also opens the bubble.
 *
 * Capture phase and `once`, so the listener never outlives the gesture that
 * installed it, and a later genuine click is untouched.
 */
function suppressNextClick(): void {
    if (typeof window === "undefined") return;
    window.addEventListener(
        "click",
        (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
        },
        { capture: true, once: true },
    );
}
