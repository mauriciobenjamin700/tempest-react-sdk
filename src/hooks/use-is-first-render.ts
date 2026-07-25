/* eslint-disable react-hooks/refs -- flipping the flag during render IS this hook */
import { useRef } from "react";

/**
 * Return `true` on the first render of the component and `false` thereafter.
 *
 * Reads *and* flips a ref during render, which the React Compiler rules flag on
 * sight — here it is the entire hook. Under StrictMode's double render in dev the
 * second pass already sees `false`, so treat the result as "first committed
 * render" and not as a strict render counter.
 *
 * @returns Whether the current render is the first one.
 */
export function useIsFirstRender(): boolean {
    const isFirst = useRef<boolean>(true);
    if (isFirst.current) {
        isFirst.current = false;
        return true;
    }
    return false;
}
