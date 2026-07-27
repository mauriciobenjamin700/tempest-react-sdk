import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Which axis to watch for overflow. */
export type ScrollOverflowAxis = "horizontal" | "vertical" | "both";

/**
 * Track whether an element's content currently overflows its box.
 *
 * The use this exists for is keyboard access. A scroll container holding no
 * focusable content is unreachable by keyboard: the user can see there is more
 * content past the edge and has no way to get to it, because focus never lands
 * anywhere the arrow keys would scroll. Giving the container `tabIndex={0}`
 * fixes it — but doing that unconditionally puts a tab stop on every such
 * container on the page, including the ones whose content fits and have nothing
 * to scroll. The stop is only wanted while the overflow is real, which is what
 * this reports. (It is also what axe checks as `scrollable-region-focusable`.)
 *
 * Both the container and its content are observed: content can outgrow a box
 * whose own dimensions never change, and a box can shrink around content that
 * never changes. Watching one alone misses half the transitions.
 *
 * A one-pixel difference is ignored — that is layout rounding, not overflow.
 *
 * @param ref - The scroll container.
 * @param axis - Which axis to measure. Defaults to `"both"`.
 * @returns `true` while the content is larger than the box on that axis.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * const scrollable = useScrollOverflow(ref, "horizontal");
 *
 * <div
 *   ref={ref}
 *   tabIndex={scrollable ? 0 : undefined}
 *   role={scrollable ? "group" : undefined}
 *   aria-label={scrollable ? "Tabela rolável" : undefined}
 * >
 */
export function useScrollOverflow(
    ref: RefObject<HTMLElement | null>,
    axis: ScrollOverflowAxis = "both",
): boolean {
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const measure = () => {
            const horizontal = element.scrollWidth - element.clientWidth > 1;
            const vertical = element.scrollHeight - element.clientHeight > 1;
            if (axis === "horizontal") setOverflowing(horizontal);
            else if (axis === "vertical") setOverflowing(vertical);
            else setOverflowing(horizontal || vertical);
        };
        measure();

        if (typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(measure);
        observer.observe(element);
        const content = element.firstElementChild;
        if (content) observer.observe(content);
        return () => observer.disconnect();
    }, [ref, axis]);

    return overflowing;
}
