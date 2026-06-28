import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import styles from "./NProgress.module.css";

/** Snapshot of the progress controller state delivered to subscribers. */
export interface NProgressState {
    /** Current progress, `0` (empty) to `1` (complete). */
    value: number;
    /** Whether the bar should be visible. */
    active: boolean;
}

/** Listener invoked whenever the progress state changes. */
export type NProgressListener = (state: NProgressState) => void;

/** Imperative top-loading-bar controller. */
export interface NProgressController {
    /** Show the bar and start trickling toward ~0.9. */
    start: () => void;
    /** Complete to `1`, then hide the bar shortly after. */
    done: () => void;
    /** Set the progress explicitly. Values are clamped to `0..1`. */
    set: (n: number) => void;
    /** Increment progress by `amount` (default a small trickle step). */
    inc: (amount?: number) => void;
    /** Subscribe to state changes. Returns an unsubscribe function. */
    subscribe: (listener: NProgressListener) => () => void;
}

const TRICKLE_INTERVAL_MS = 300;
const TRICKLE_CEILING = 0.9;
const DONE_HIDE_DELAY_MS = 300;

function clamp(n: number): number {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function createNProgress(): NProgressController {
    let state: NProgressState = { value: 0, active: false };
    const listeners = new Set<NProgressListener>();
    let trickleTimer: ReturnType<typeof setInterval> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = (): void => {
        for (const listener of listeners) listener(state);
    };

    const update = (next: Partial<NProgressState>): void => {
        state = { ...state, ...next };
        emit();
    };

    const stopTrickle = (): void => {
        if (trickleTimer !== null) {
            clearInterval(trickleTimer);
            trickleTimer = null;
        }
    };

    const clearHide = (): void => {
        if (hideTimer !== null) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    };

    const inc = (amount?: number): void => {
        const current = state.value;
        if (current >= TRICKLE_CEILING) return;
        const step = amount ?? (1 - current) * 0.1 + 0.01;
        update({ value: Math.min(clamp(current + step), TRICKLE_CEILING) });
    };

    const start = (): void => {
        clearHide();
        if (state.active) return;
        update({ active: true, value: state.value > 0 ? state.value : 0.08 });
        stopTrickle();
        trickleTimer = setInterval(() => inc(), TRICKLE_INTERVAL_MS);
    };

    const done = (): void => {
        stopTrickle();
        clearHide();
        update({ value: 1, active: true });
        hideTimer = setTimeout(() => {
            update({ active: false, value: 0 });
            hideTimer = null;
        }, DONE_HIDE_DELAY_MS);
    };

    const set = (n: number): void => {
        clearHide();
        const value = clamp(n);
        update({ value, active: value < 1 ? true : state.active });
    };

    const subscribe = (listener: NProgressListener): (() => void) => {
        listeners.add(listener);
        listener(state);
        return () => {
            listeners.delete(listener);
        };
    };

    return { start, done, set, inc, subscribe };
}

/**
 * Module-level singleton progress controller. Drive it imperatively from
 * anywhere (router transitions, fetch interceptors) and render the visual bar
 * with {@link NProgressBar}.
 *
 * @example
 * nprogress.start();
 * await loadData();
 * nprogress.done();
 */
export const nprogress: NProgressController = createNProgress();

/** Props for {@link NProgressBar}. */
export interface NProgressBarProps {
    /** Bar color. Defaults to `var(--tempest-primary)`. */
    color?: string;
    /** Bar height in pixels. Default `3`. */
    height?: number;
    /** Extra class applied to the bar element. */
    className?: string;
}

/**
 * Fixed top loading bar bound to the {@link nprogress} singleton. Mount once
 * near the app root; it renders nothing while inactive.
 *
 * @example
 * <NProgressBar />
 */
export function NProgressBar({ color, height = 3, className }: NProgressBarProps) {
    const [state, setState] = useState<NProgressState>({ value: 0, active: false });

    useEffect(() => nprogress.subscribe(setState), []);

    if (!state.active) return null;

    const style: CSSProperties = {
        width: `${Math.round(state.value * 100)}%`,
        height: `${height}px`,
        background: color ?? "var(--tempest-primary)",
    };

    return (
        <div
            className={cn(styles.bar, className)}
            style={style}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.value * 100)}
        />
    );
}
