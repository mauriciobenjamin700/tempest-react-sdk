/**
 * React binding for {@link TabularPredictor}.
 *
 * Loading a model is async, cancellable, and has to be undone on unmount —
 * three things every component that touches inference gets wrong the same
 * way. The hook owns that lifecycle so a component only deals with
 * `status` and `predict`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchModelBytes, type ModelCacheOptions } from "./cache";
import { TabularPredictor } from "./predictor";
import type {
    FeatureRow,
    TabularModelSource,
    TabularPrediction,
    TabularPredictorOptions,
} from "./types";

/** Lifecycle of the model behind the hook. */
export type TabularPredictorStatus = "idle" | "loading" | "ready" | "error";

/** Options for {@link useTabularPredictor}. */
export interface UseTabularPredictorOptions extends TabularPredictorOptions {
    /**
     * Cache the model bytes on the device, so later loads work offline.
     *
     * On by default when the source is a URL: an app that runs inference in
     * the browser almost always wants it to keep working without a network,
     * and the failure mode of not caching only shows up in a tunnel.
     */
    readonly cache?: boolean | ModelCacheOptions;
}

/** What {@link useTabularPredictor} returns. */
export interface UseTabularPredictorResult {
    /** The loaded predictor, or `null` while loading or on error. */
    readonly predictor: TabularPredictor | null;
    /** Where the load is. */
    readonly status: TabularPredictorStatus;
    /** Why the load failed. */
    readonly error: Error | null;
    /** Whether the model is loaded and can answer. */
    readonly isReady: boolean;
    /**
     * Predict for a batch of rows.
     *
     * @throws When called before the model is ready — awaiting `isReady`
     *   is the caller's job, and a silent empty result would hide the bug.
     */
    readonly predict: (rows: readonly FeatureRow[]) => Promise<TabularPrediction>;
    /** Load the model again, e.g. after a failure or a new version. */
    readonly reload: () => void;
}

/**
 * Load a tabular model and keep it for the component's lifetime.
 *
 * @example
 * ```tsx
 * function RiskWidget() {
 *     const { predict, isReady } = useTabularPredictor("/models/risk-v3.onnx");
 *     const [score, setScore] = useState<number | null>(null);
 *
 *     async function onSubmit(features: number[]) {
 *         const { probabilities } = await predict([features]);
 *         setScore(probabilities[0]?.[1] ?? null);
 *     }
 *
 *     return <button disabled={!isReady} onClick={() => onSubmit([1, 2, 3, 4])}>Score</button>;
 * }
 * ```
 *
 * @param source Model URL, or the bytes when the app already has them.
 *   Pass `null` to hold off loading (a gate, a lazy tab).
 * @param options Predictor options plus caching.
 * @returns The predictor, its status, and a `predict` bound to it.
 */
export function useTabularPredictor(
    source: TabularModelSource | null,
    options: UseTabularPredictorOptions = {},
): UseTabularPredictorResult {
    const [predictor, setPredictor] = useState<TabularPredictor | null>(null);
    const [status, setStatus] = useState<TabularPredictorStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const [attempt, setAttempt] = useState(0);

    const optionsRef = useRef(options);

    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => {
        if (source === null) {
            setStatus("idle");
            return;
        }

        let cancelled = false;
        let loaded: TabularPredictor | null = null;

        setStatus("loading");
        setError(null);

        void (async () => {
            try {
                const current = optionsRef.current;
                const cache = current.cache ?? true;
                const bytes =
                    typeof source === "string" && cache !== false
                        ? await fetchModelBytes(source, typeof cache === "object" ? cache : {})
                        : source;
                const created = await TabularPredictor.create(bytes, {
                    providers: current.providers,
                    warmup: current.warmup,
                    sessionOptions: current.sessionOptions,
                });
                loaded = created;
                if (cancelled) {
                    await created.dispose();
                    return;
                }
                setPredictor(created);
                setStatus("ready");
            } catch (caught) {
                if (cancelled) return;
                setPredictor(null);
                setError(caught instanceof Error ? caught : new Error(String(caught)));
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
            setPredictor(null);
            void loaded?.dispose();
        };
    }, [source, attempt]);

    const predict = useCallback(
        async (rows: readonly FeatureRow[]): Promise<TabularPrediction> => {
            if (predictor === null) {
                throw new Error(
                    "predict() was called before the model finished loading. " +
                        "Gate on `isReady`.",
                );
            }
            return await predictor.predict(rows);
        },
        [predictor],
    );

    const reload = useCallback(() => setAttempt((value) => value + 1), []);

    return {
        predictor,
        status,
        error,
        isReady: status === "ready" && predictor !== null,
        predict,
        reload,
    };
}
