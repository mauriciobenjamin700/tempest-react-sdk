import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from "react";

import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/utils/cn";

import { backdropRects, placeCard, type TourPlacement, type TourRect } from "./tour-position";
import styles from "./Tour.module.css";

/** One stop of the tour. */
export interface TourStep {
    /**
     * CSS selector of the element to point at.
     *
     * A selector rather than a ref, so a tour can be declared as data — in a config
     * file, from the backend, next to the copy — without every screen having to
     * thread refs up to whoever renders the tour.
     */
    target?: string;
    /** Heading of the card. */
    title?: ReactNode;
    /** The explanation. */
    body: ReactNode;
    /** Preferred side. Default `"bottom"`, flipped when it does not fit. */
    placement?: TourPlacement;
}

/** Labels, per locale. */
interface TourStrings {
    next: string;
    back: string;
    finish: string;
    skip: string;
    close: string;
    progress: (current: number, total: number) => string;
}

const PT_BR: TourStrings = {
    next: "Próximo",
    back: "Voltar",
    finish: "Concluir",
    skip: "Pular",
    close: "Fechar tour",
    progress: (current, total) => `Passo ${current} de ${total}`,
};

const EN: TourStrings = {
    next: "Next",
    back: "Back",
    finish: "Done",
    skip: "Skip",
    close: "Close tour",
    progress: (current, total) => `Step ${current} of ${total}`,
};

export interface TourProps {
    /** The stops, in order. */
    steps: readonly TourStep[];
    /** Whether the tour is showing. Controlled. */
    open: boolean;
    /** Closed by `Esc`, by the close button or by "skip". */
    onClose: () => void;
    /** Called after the last step is confirmed. `onClose` follows it. */
    onFinish?: () => void;
    /** Current step index, when the app wants to drive it. */
    index?: number;
    /** Step changed — required only when `index` is given. */
    onIndexChange?: (index: number) => void;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Space kept clear around the highlighted element, in px. Default 4. */
    spotlightPadding?: number;
    /** Extra class on the card. */
    className?: string;
}

/**
 * A guided tour: dim the page, highlight one element at a time, explain it.
 *
 * The highlighted element stays **clickable** while everything else is blocked,
 * because the useful kind of coachmark says "press this" and lets you press it. That
 * is why the backdrop is four rectangles around the target rather than one overlay
 * with a `box-shadow` hole — a shadow is not hit-testable, so a hole made that way
 * would not block anything.
 *
 * Whether a user has seen the tour is the app's business: this component takes
 * `open` and emits `onClose`/`onFinish`. Persisting a flag in `localStorage` is one
 * line in the app and a wrong default here.
 *
 * @example
 * const [open, setOpen] = useState(!storage.get("tour-v1"));
 *
 * <Tour
 *     open={open}
 *     steps={[
 *         { target: "#novo-pedido", title: "Comece aqui", body: "Todo pedido nasce deste botão." },
 *         { target: "[data-tour='filtros']", body: "E filtre por período aqui." },
 *     ]}
 *     onClose={() => setOpen(false)}
 *     onFinish={() => storage.set("tour-v1", true)}
 * />
 */
export function Tour({
    steps,
    open,
    onClose,
    onFinish,
    index,
    onIndexChange,
    locale = "pt-BR",
    spotlightPadding = 4,
    className,
}: TourProps) {
    const strings = locale === "en" ? EN : PT_BR;
    const [internal, setInternal] = useState(0);
    const current = Math.min(index ?? internal, Math.max(0, steps.length - 1));
    const step = steps[current];

    const card = useRef<HTMLDivElement | null>(null);
    const [target, setTarget] = useState<TourRect | null>(null);
    const [position, setPosition] = useState<{
        placement: TourPlacement;
        top: number;
        left: number;
    }>({ placement: "center", top: 0, left: 0 });
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const titleId = useId();
    const bodyId = useId();

    useFocusTrap(card, open);

    const goTo = useCallback(
        (next: number) => {
            if (index === undefined) setInternal(next);
            onIndexChange?.(next);
        },
        [index, onIndexChange],
    );

    /** Reset to the first step whenever the tour opens again. */
    useEffect(() => {
        if (open && index === undefined) setInternal(0);
    }, [open, index]);

    /**
     * Find the step's element, bring it into view, and measure everything.
     *
     * The scroll happens before measuring, and the measurement is deferred to the
     * next frame: reading a rect in the same tick as `scrollIntoView` gives the
     * position the element had *before* the scroll, which lands the card over the
     * wrong part of the page.
     */
    const measure = useCallback(() => {
        if (!open || !step) return;
        const element = step.target ? document.querySelector<HTMLElement>(step.target) : null;
        const rect = element?.getBoundingClientRect() ?? null;
        setTarget(
            rect
                ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                : null,
        );

        const size = {
            width: card.current?.offsetWidth ?? 320,
            height: card.current?.offsetHeight ?? 160,
        };
        const view = { width: window.innerWidth, height: window.innerHeight };
        setViewport(view);
        setPosition(
            placeCard({
                target: rect
                    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                    : null,
                card: size,
                viewport: view,
                preferred: step.placement,
            }),
        );
    }, [open, step]);

    useLayoutEffect(() => {
        if (!open || !step) return;
        const element = step.target ? document.querySelector<HTMLElement>(step.target) : null;
        element?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        const frame = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(frame);
    }, [open, step, measure]);

    useEffect(() => {
        if (!open) return;
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [open, measure]);

    useEffect(() => {
        if (open) card.current?.focus();
    }, [open, current]);

    if (!open || !step) return null;

    const last = current === steps.length - 1;

    const finish = (): void => {
        onFinish?.();
        onClose();
    };

    /**
     * Arrow keys walk the tour and `Esc` leaves it.
     *
     * `Esc` is handled here rather than on `window` so a tour opened over a modal
     * does not close both: the innermost handler that sees the key wins, and the
     * card has focus.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key === "ArrowRight" && !last) {
            event.preventDefault();
            goTo(current + 1);
        }
        if (event.key === "ArrowLeft" && current > 0) {
            event.preventDefault();
            goTo(current - 1);
        }
    };

    return (
        <div className={styles.root} data-placement={position.placement}>
            {backdropRects(target, viewport, spotlightPadding).map((rect, i) => (
                <div
                    key={i}
                    className={styles.backdrop}
                    style={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                    }}
                    onClick={onClose}
                />
            ))}

            {target && (
                <div
                    className={styles.spotlight}
                    style={{
                        top: target.top - spotlightPadding,
                        left: target.left - spotlightPadding,
                        width: target.width + spotlightPadding * 2,
                        height: target.height + spotlightPadding * 2,
                    }}
                />
            )}

            <div
                ref={card}
                className={cn(styles.card, className)}
                style={{ top: position.top, left: position.left }}
                role="dialog"
                aria-modal="true"
                aria-labelledby={step.title ? titleId : undefined}
                aria-describedby={bodyId}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <div className={styles.header}>
                    <span className={styles.progress}>
                        {strings.progress(current + 1, steps.length)}
                    </span>
                    <button
                        type="button"
                        className={styles.close}
                        aria-label={strings.close}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>

                {step.title && (
                    <h2 className={styles.title} id={titleId}>
                        {step.title}
                    </h2>
                )}
                <div className={styles.body} id={bodyId}>
                    {step.body}
                </div>

                <div className={styles.footer}>
                    {!last && (
                        <button type="button" className={styles.skip} onClick={onClose}>
                            {strings.skip}
                        </button>
                    )}
                    <div className={styles.actions}>
                        {current > 0 && (
                            <button
                                type="button"
                                className={styles.secondary}
                                onClick={() => goTo(current - 1)}
                            >
                                {strings.back}
                            </button>
                        )}
                        <button
                            type="button"
                            className={styles.primary}
                            onClick={() => (last ? finish() : goTo(current + 1))}
                        >
                            {last ? strings.finish : strings.next}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
