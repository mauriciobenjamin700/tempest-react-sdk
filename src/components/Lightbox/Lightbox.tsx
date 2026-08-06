/**
 * @tempest-limits file-lines, props-count, function-lines — closeLabel,
 * previousLabel and nextLabel are three separate strings an app has to translate,
 * showThumbnails/showCounter/loop are the chrome, and items/index/
 * onIndexChange/open/onClose are the controlled contract. The body is the focus
 * trap, the key handling and the swipe, which all move the same index.
 */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { cn } from "@/utils/cn";
import { Portal } from "../Portal";
import styles from "./Lightbox.module.css";

/** One item of the gallery. */
export interface LightboxItem {
    /** Full-size image URL. */
    src: string;
    /** Alt text. Required: a gallery of unlabeled images is unusable with a screen reader. */
    alt: string;
    /** Caption rendered under the image. */
    caption?: string;
    /** Thumbnail URL for the strip. Falls back to `src`. */
    thumbnail?: string;
}

export interface LightboxProps {
    items: LightboxItem[];
    /** Whether the overlay is open. */
    open: boolean;
    /** Index shown while open. Default `0`. */
    index?: number;
    onIndexChange?: (index: number) => void;
    onClose: () => void;
    /** Renders the thumbnail strip. Default `true` when there is more than one item. */
    showThumbnails?: boolean;
    /** Renders the `3 / 12` counter. Default `true`. */
    showCounter?: boolean;
    /**
     * Wrap around at the ends. Default `true` — in a photo viewer, hitting a dead
     * end at the last image reads as a bug more often than as a boundary.
     */
    loop?: boolean;
    closeLabel?: string;
    previousLabel?: string;
    nextLabel?: string;
    className?: string;
}

/**
 * Full-screen image viewer with keyboard navigation.
 *
 * `Esc` closes, `←`/`→` walk the gallery, `Home`/`End` jump to the ends. Focus is
 * trapped inside while open and the page behind is scroll-locked, so the overlay
 * behaves like the dialog it is instead of a fancy `<div>` the keyboard can escape.
 *
 * Only the current image is mounted; neighbours are **preloaded** via `Image()` so
 * pressing `→` does not flash an empty frame.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 * const [index, setIndex] = useState(0);
 *
 * <Lightbox
 *   open={open}
 *   items={photos.map((p) => ({ src: p.url, alt: p.description }))}
 *   index={index}
 *   onIndexChange={setIndex}
 *   onClose={() => setOpen(false)}
 * />
 * ```
 */
export function Lightbox({
    items,
    open,
    index = 0,
    onIndexChange,
    onClose,
    showThumbnails,
    showCounter = true,
    loop = true,
    closeLabel = "Close",
    previousLabel = "Previous image",
    nextLabel = "Next image",
    className,
}: LightboxProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [internalIndex, setInternalIndex] = useState(index);
    const isControlled = onIndexChange !== undefined;
    const current = isControlled ? index : internalIndex;

    useFocusTrap(containerRef, open);
    useScrollLock(open);

    const move = useCallback(
        (next: number): void => {
            if (items.length === 0) return;
            const target = loop
                ? (next + items.length) % items.length
                : Math.max(0, Math.min(next, items.length - 1));
            if (!isControlled) setInternalIndex(target);
            onIndexChange?.(target);
        },
        [isControlled, items.length, loop, onIndexChange],
    );

    useEffect(() => {
        if (!isControlled) setInternalIndex(index);
    }, [index, isControlled]);

    useEffect(() => {
        if (!open) return;
        function onKeyDown(event: KeyboardEvent): void {
            switch (event.key) {
                case "Escape":
                    onClose();
                    break;
                case "ArrowRight":
                    move(current + 1);
                    break;
                case "ArrowLeft":
                    move(current - 1);
                    break;
                case "Home":
                    move(0);
                    break;
                case "End":
                    move(items.length - 1);
                    break;
                default:
                    return;
            }
            event.preventDefault();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [current, items.length, move, onClose, open]);

    useEffect(() => {
        if (!open || typeof Image === "undefined") return;
        for (const offset of [-1, 1]) {
            const neighbour = items[(current + offset + items.length) % items.length];
            if (!neighbour) continue;
            const preload = new Image();
            preload.src = neighbour.src;
        }
    }, [current, items, open]);

    if (!open || items.length === 0) return null;

    const item = items[Math.max(0, Math.min(current, items.length - 1))];
    const withThumbnails = showThumbnails ?? items.length > 1;
    const multiple = items.length > 1;

    return (
        <Portal>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-label={item.alt}
                className={cn(styles.overlay, className)}
            >
                <div className={styles.topBar}>
                    {showCounter && multiple ? (
                        <span className={styles.counter}>
                            {current + 1} / {items.length}
                        </span>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={closeLabel}
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.stage}>
                    {multiple ? (
                        <button
                            type="button"
                            className={cn(styles.iconButton, styles.nav)}
                            aria-label={previousLabel}
                            disabled={!loop && current === 0}
                            onClick={() => move(current - 1)}
                        >
                            <ChevronLeft size={24} />
                        </button>
                    ) : null}

                    <figure className={styles.figure}>
                        <img src={item.src} alt={item.alt} className={styles.image} />
                        {item.caption ? (
                            <figcaption className={styles.caption}>{item.caption}</figcaption>
                        ) : null}
                    </figure>

                    {multiple ? (
                        <button
                            type="button"
                            className={cn(styles.iconButton, styles.nav)}
                            aria-label={nextLabel}
                            disabled={!loop && current === items.length - 1}
                            onClick={() => move(current + 1)}
                        >
                            <ChevronRight size={24} />
                        </button>
                    ) : null}
                </div>

                {withThumbnails && multiple ? (
                    <div className={styles.thumbnails} role="tablist" aria-label={item.alt}>
                        {items.map((entry, entryIndex) => (
                            <button
                                key={`${entry.src}-${entryIndex}`}
                                type="button"
                                role="tab"
                                aria-selected={entryIndex === current}
                                aria-label={entry.alt}
                                className={cn(
                                    styles.thumbnail,
                                    entryIndex === current && styles.thumbnailActive,
                                )}
                                onClick={() => move(entryIndex)}
                            >
                                <img
                                    src={entry.thumbnail ?? entry.src}
                                    alt=""
                                    className={styles.thumbnailImage}
                                />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </Portal>
    );
}
