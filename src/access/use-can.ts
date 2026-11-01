import { useEffect, useState } from "react";
import { useAccessControl } from "./access-control-context";
import type { AccessControl, CanParams, CanResult } from "./types";

export interface UseCanResult {
    /** Whether the action is permitted. Defaults to `true` while loading is not the concern of the caller. */
    allowed: boolean;
    /** `true` while an async `can` check is pending. */
    isLoading: boolean;
    /** Optional explanation, typically present when `allowed` is `false`. */
    reason?: string;
}

/** The answer for a check that has not resolved yet. */
const PENDING: UseCanResult = { allowed: false, isLoading: true };

/** The answer when no provider is mounted. */
const ALLOW_ALL: UseCanResult = { allowed: true, isLoading: false };

/** A resolved answer together with the check it answers. */
interface ResolvedCheck {
    control: AccessControl;
    key: string;
    result: UseCanResult;
}

function normalize(result: boolean | CanResult): CanResult {
    return typeof result === "boolean" ? { can: result } : result;
}

/**
 * Resolve an access check against the {@link AccessControl} in context.
 *
 * Handles sync booleans, sync {@link CanResult}, and promises of either. When
 * no provider is present, access is allowed (see `useAccessControl`). The check
 * re-runs whenever the params change; they are compared by their
 * `JSON.stringify` form, so an inline object literal does not re-run it on
 * every render.
 *
 * A resolved answer is stored with the control and the params it answers, and
 * is only returned while both still match. Until 0.81.0 the previous answer was
 * returned with `isLoading: false` for the render between a params change and
 * the effect that re-ran the check, so `<Can>` showed the children for the new
 * resource for one frame on the strength of the old resource's permission. The
 * first render for new params now reads `{ allowed: false, isLoading: true }`.
 *
 * @param params - The action/resource being checked.
 * @returns The answer for exactly these params, or the pending state.
 */
export function useCan(params: CanParams): UseCanResult {
    const control = useAccessControl();
    const paramsKey = JSON.stringify(params);
    const [resolved, setResolved] = useState<ResolvedCheck | null>(null);

    useEffect(() => {
        if (!control) return;
        let cancelled = false;
        const settle = (result: UseCanResult): void => {
            if (!cancelled) setResolved({ control, key: paramsKey, result });
        };

        Promise.resolve(control.can(params))
            .then((raw) => {
                const result = normalize(raw);
                settle({ allowed: result.can, isLoading: false, reason: result.reason });
            })
            .catch((error: unknown) => {
                settle({
                    allowed: false,
                    isLoading: false,
                    reason: error instanceof Error ? error.message : "access check failed",
                });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [control, paramsKey]);

    if (!control) return ALLOW_ALL;
    if (resolved === null || resolved.control !== control || resolved.key !== paramsKey) {
        return PENDING;
    }
    return resolved.result;
}
