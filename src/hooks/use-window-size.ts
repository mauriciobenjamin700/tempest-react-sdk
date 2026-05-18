import { useEffect, useState } from "react";

export interface WindowSize {
    width: number;
    height: number;
}

/**
 * Reactive window dimensions. SSR-safe — returns `{ width: 0, height: 0 }`
 * until the first client render.
 *
 * @example
 * const { width, height } = useWindowSize();
 * const columns = width < 640 ? 1 : width < 1024 ? 2 : 3;
 */
export function useWindowSize(): WindowSize {
    const [size, setSize] = useState<WindowSize>(() =>
        typeof window === "undefined"
            ? { width: 0, height: 0 }
            : { width: window.innerWidth, height: window.innerHeight },
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = (): void =>
            setSize({ width: window.innerWidth, height: window.innerHeight });
        onResize();
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    return size;
}
