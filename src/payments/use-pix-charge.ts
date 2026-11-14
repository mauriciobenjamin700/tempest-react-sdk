import { useEffect, useState } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";

import { isFinalPaymentStatus } from "./types";
import type { PixCharge } from "./types";

/** Options for {@link usePixCharge}. */
export interface UsePixChargeOptions {
    /**
     * Re-reads the charge from **your backend** — which re-reads it from the
     * provider. Called every `intervalMs` until the charge is final. The signal
     * aborts when the component unmounts or the charge changes.
     */
    refresh?: (signal: AbortSignal) => Promise<PixCharge>;
    /**
     * Pushes updates instead of polling — an SSE stream, a WebSocket. Receives
     * the emitter and returns its own cleanup. Can be combined with `refresh`.
     */
    subscribe?: (emit: (charge: PixCharge) => void) => () => void;
    /** Poll period in ms. Default `5000`. */
    intervalMs?: number;
}

/** Return value of {@link usePixCharge}. */
export interface UsePixChargeResult {
    /** The latest charge the backend reported. */
    charge: PixCharge;
    /** The last `refresh` failure, cleared by the next success. Polling continues after it. */
    error: Error | null;
}

/**
 * Whether an update may replace the charge on screen.
 *
 * Rejects an update for another charge (a stale response after the app
 * switched charges) and one that moves a final charge back to a non-final
 * state — an out-of-order delivery when polling and a push channel race, which
 * would otherwise flash "aguardando pagamento" under a payer who already paid.
 */
function accepts(current: PixCharge, next: PixCharge): boolean {
    if (next.provider_charge_id !== current.provider_charge_id) return false;
    return !(isFinalPaymentStatus(current.status) && !isFinalPaymentStatus(next.status));
}

/**
 * Follow a Pix charge until the backend says it is final.
 *
 * The browser never decides that a Pix was paid: there is no client-side signal
 * that could prove it, and a screen that infers "paid" from a countdown or a
 * copy click is a screen that ships goods for free. This hook only relays what
 * the app's `refresh`/`subscribe` report, and stops polling once the status is
 * final (`paid`, `expired`, `cancelled`, `refunded`, `charged_back`, `failed`).
 *
 * Polling is sequential — the next request starts `intervalMs` after the
 * previous one settled — so a slow backend is never hit by overlapping reads.
 * A failed read keeps the last good charge and is exposed as `error`; the poll
 * goes on, because a dropped request is not a payment state.
 *
 * Passing a charge with a different `provider_charge_id` restarts the follow.
 *
 * @param initial - The charge as created.
 * @param options - `refresh`, `subscribe` and the poll period.
 * @returns The latest charge and the last read error.
 *
 * @example
 * const { charge } = usePixCharge(created, {
 *   refresh: (signal) => api.get<PixCharge>(`/api/pix/${created.provider_charge_id}`, { signal }),
 * });
 * return <PixCheckout charge={charge} />;
 */
export function usePixCharge(
    initial: PixCharge,
    options: UsePixChargeOptions = {},
): UsePixChargeResult {
    const { intervalMs = 5000 } = options;
    const [state, setState] = useState<{ charge: PixCharge; error: Error | null }>({
        charge: initial,
        error: null,
    });
    const [followed, setFollowed] = useState(initial.provider_charge_id);
    const sourcesRef = useLatestRef({ refresh: options.refresh, subscribe: options.subscribe });
    const charge = followed === initial.provider_charge_id ? state.charge : initial;

    if (followed !== initial.provider_charge_id) {
        setFollowed(initial.provider_charge_id);
        setState({ charge: initial, error: null });
    }

    const id = charge.provider_charge_id;
    const final = isFinalPaymentStatus(charge.status);

    useEffect(() => {
        const { subscribe } = sourcesRef.current;
        if (subscribe === undefined) return undefined;
        return subscribe((next) =>
            setState((current) =>
                accepts(current.charge, next) ? { charge: next, error: null } : current,
            ),
        );
    }, [id, sourcesRef]);

    useEffect(() => {
        if (final || sourcesRef.current.refresh === undefined) return undefined;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = (): void => {
            const refresh = sourcesRef.current.refresh;
            if (refresh === undefined) return;
            refresh(controller.signal)
                .then((next) => {
                    if (controller.signal.aborted) return;
                    setState((current) =>
                        accepts(current.charge, next) ? { charge: next, error: null } : current,
                    );
                })
                .catch((reason: unknown) => {
                    if (controller.signal.aborted) return;
                    const error = reason instanceof Error ? reason : new Error(String(reason));
                    setState((current) => ({ ...current, error }));
                })
                .finally(() => {
                    if (!controller.signal.aborted) timer = setTimeout(tick, intervalMs);
                });
        };
        timer = setTimeout(tick, intervalMs);
        return () => {
            controller.abort();
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [id, final, intervalMs, sourcesRef]);

    return { charge, error: followed === initial.provider_charge_id ? state.error : null };
}
