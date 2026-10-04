import type { CSSProperties, ElementType, HTMLAttributes, JSX, RefObject } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { cn } from "@/utils/cn";
import { RATIO_EPSILON, effectiveThreshold } from "./reveal-threshold";
import styles from "./Reveal.module.css";

/** Direction the content travels from, or `"fade"` / `"scale"` for no travel. */
export type RevealVariant = "fade" | "up" | "down" | "left" | "right" | "scale";

/** Visual state written to `data-state`. */
export type RevealState = "static" | "hidden" | "shown";

export interface RevealProps extends HTMLAttributes<HTMLElement> {
    /** Intrinsic element to render, e.g. `"li"` inside a list. Defaults to `"div"`. */
    as?: keyof JSX.IntrinsicElements;
    /** How the content enters. Defaults to `"up"`. */
    variant?: RevealVariant;
    /** Wait before the entrance starts, in ms. Stagger siblings with `index * step`. */
    delay?: number;
    /** Length of the entrance, in ms. Defaults to `--tempest-duration-slower`. */
    duration?: number;
    /** Reveal once and stop observing. With `false`, it hides again once fully out of view. Defaults to `true`. */
    once?: boolean;
    /**
     * Fraction of the element — or of the viewport, when the element is taller
     * than it — that must be visible to reveal. Defaults to `0.15`.
     */
    threshold?: number;
    /** Margin around the root, as in `IntersectionObserver`. Defaults to `"0px"`. */
    rootMargin?: string;
}

/** A ref that never points at an element, used to switch the observer off. */
const DETACHED: RefObject<Element | null> = { current: null };

/**
 * Subscribe function for a snapshot that never changes after mount.
 *
 * @returns A no-op unsubscribe.
 */
function subscribeNever(): () => void {
    return () => undefined;
}

/**
 * Whether this environment can observe intersections.
 *
 * @returns `true` when `IntersectionObserver` exists.
 */
function canObserve(): boolean {
    return typeof IntersectionObserver !== "undefined";
}

/**
 * Server snapshot: never hide content that was rendered without JavaScript.
 *
 * @returns Always `false`.
 */
function cannotObserve(): boolean {
    return false;
}

/**
 * Animate content into view the first time it is scrolled to.
 *
 * The three failure modes of a hand-rolled version are handled here, not left to
 * the docs:
 *
 * - **Reduced motion.** Under `prefers-reduced-motion: reduce` the stylesheet
 *   pins the element visible with no transform and no transition, whatever
 *   state it is in — so the setting also wins when it changes mid-session.
 * - **No `IntersectionObserver`** (old engines, some crawlers, tests): the
 *   element stays in the `"static"` state, which is plain visible content. It is
 *   never hidden waiting for an observation that cannot come.
 * - **Taller than the viewport.** A box three viewports tall never reaches a
 *   ratio of 0.5, so a raw observer with that threshold never reveals it. The
 *   threshold is rescaled by the highest ratio the element can reach (see
 *   `effectiveThreshold`), read from the first observation.
 *
 * Content is hidden only when the client can observe: the server snapshot of
 * `useSyncExternalStore` is `"static"`, so markup rendered without JavaScript —
 * or before hydration — is visible. The transition is declared on the `"shown"`
 * state only, so the switch to `"hidden"` on mount is instant instead of a
 * fade-out, and with `once={false}` leaving the viewport hides without motion.
 *
 * With `once={false}` the element hides only once it is fully out of view. Hiding
 * on the threshold would oscillate: the hidden state translates the box, which
 * moves it back across the same threshold.
 *
 * @example
 * <ul>
 *   {steps.map((step, index) => (
 *     <Reveal key={step.id} as="li" delay={index * 80}>
 *       {step.title}
 *     </Reveal>
 *   ))}
 * </ul>
 */
export function Reveal({
    as = "div",
    variant = "up",
    delay,
    duration,
    once = true,
    threshold = 0.15,
    rootMargin = "0px",
    className,
    style,
    children,
    ...props
}: RevealProps) {
    const ref = useRef<HTMLElement>(null);
    const observable = useSyncExternalStore(subscribeNever, canObserve, cannotObserve);
    const [shown, setShown] = useState<boolean>(false);
    const [rescaled, setRescaled] = useState<{ requested: number; value: number }>({
        requested: threshold,
        value: threshold,
    });
    const observeAt = rescaled.requested === threshold ? rescaled.value : threshold;
    const settled = once && shown;

    const entry = useIntersectionObserver(observable && !settled ? ref : DETACHED, {
        rootMargin,
        threshold: observeAt,
    });

    useEffect(() => {
        if (!entry) return;
        const target = effectiveThreshold(threshold, entry);
        if (Math.abs(target - observeAt) > RATIO_EPSILON) {
            setRescaled({ requested: threshold, value: target });
        }
        if (entry.isIntersecting && entry.intersectionRatio + RATIO_EPSILON >= target) {
            setShown(true);
        } else if (!once && !entry.isIntersecting) {
            setShown(false);
        }
    }, [entry, threshold, observeAt, once]);

    const state: RevealState = !observable ? "static" : shown ? "shown" : "hidden";
    const timing: Record<string, string> = {};
    if (delay !== undefined) timing["--tempest-reveal-delay"] = `${delay}ms`;
    if (duration !== undefined) timing["--tempest-reveal-duration"] = `${duration}ms`;

    const Tag = as as ElementType;

    return (
        <Tag
            {...props}
            ref={ref}
            className={cn(styles.reveal, className)}
            style={{ ...timing, ...style } as CSSProperties}
            data-state={state}
            data-variant={variant}
        >
            {children}
        </Tag>
    );
}
