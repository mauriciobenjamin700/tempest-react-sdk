import { useRef } from "react";

/**
 * Return `true` on the first render of the component and `false` thereafter.
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
