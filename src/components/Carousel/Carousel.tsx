import { useCallback, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Carousel.module.css";

export interface CarouselProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Slides — one rendered at a time. */
    children: ReactNode[];
    /** Wrap around at the ends instead of stopping. Default `false`. */
    loop?: boolean;
    /** Show prev/next arrow buttons. Default `true`. */
    showArrows?: boolean;
    /** Show dot indicators. Default `true`. */
    showDots?: boolean;
    /** Controlled active index. */
    index?: number;
    /** Initial index for uncontrolled use. Default `0`. */
    defaultIndex?: number;
    /** Called whenever the active index changes. */
    onIndexChange?: (index: number) => void;
}

/**
 * Horizontal content slider showing one slide at a time.
 *
 * - Track translates by the active index (`translateX(-index * 100%)`).
 * - Prev/next arrows (disabled at the ends unless `loop`); dot indicators jump.
 * - Controlled (`index`) or uncontrolled (`defaultIndex`).
 * - Arrow Left/Right on the focused region navigates.
 *
 * @example
 * <Carousel loop>
 *     <img src="/1.jpg" alt="" />
 *     <img src="/2.jpg" alt="" />
 *     <img src="/3.jpg" alt="" />
 * </Carousel>
 */
export function Carousel({
    children,
    loop = false,
    showArrows = true,
    showDots = true,
    index,
    defaultIndex = 0,
    onIndexChange,
    className,
    ...props
}: CarouselProps) {
    const count = children.length;
    const isControlled = index !== undefined;
    const [internalIndex, setInternalIndex] = useState<number>(defaultIndex);
    const current = isControlled ? index : internalIndex;

    const goTo = useCallback(
        (next: number): void => {
            let target = next;
            if (target < 0) target = loop ? count - 1 : 0;
            else if (target >= count) target = loop ? 0 : count - 1;
            if (target === current) return;
            if (!isControlled) setInternalIndex(target);
            onIndexChange?.(target);
        },
        [count, loop, current, isControlled, onIndexChange],
    );

    const atStart = current <= 0;
    const atEnd = current >= count - 1;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo(current + 1);
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(current - 1);
        }
    };

    return (
        <div
            role="region"
            aria-roledescription="carousel"
            tabIndex={0}
            className={cn(styles.root, className)}
            onKeyDown={handleKeyDown}
            {...props}
        >
            <div className={styles.viewport}>
                <div
                    className={styles.track}
                    style={{ transform: `translateX(-${current * 100}%)` }}
                >
                    {children.map((slide, slideIndex) => (
                        <div
                            key={slideIndex}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${slideIndex + 1} of ${count}`}
                            aria-hidden={slideIndex !== current}
                            className={styles.slide}
                        >
                            {slide}
                        </div>
                    ))}
                </div>
            </div>

            {showArrows && count > 1 && (
                <>
                    <button
                        type="button"
                        className={cn(styles.arrow, styles.prev)}
                        aria-label="Previous slide"
                        disabled={!loop && atStart}
                        onClick={() => goTo(current - 1)}
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        className={cn(styles.arrow, styles.next)}
                        aria-label="Next slide"
                        disabled={!loop && atEnd}
                        onClick={() => goTo(current + 1)}
                    >
                        ›
                    </button>
                </>
            )}

            {showDots && count > 1 && (
                <div className={styles.dots} role="tablist" aria-label="Slides">
                    {children.map((_, dotIndex) => (
                        <button
                            key={dotIndex}
                            type="button"
                            role="tab"
                            aria-label={`Go to slide ${dotIndex + 1}`}
                            aria-selected={dotIndex === current}
                            className={cn(styles.dot, dotIndex === current && styles.dotActive)}
                            onClick={() => goTo(dotIndex)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
