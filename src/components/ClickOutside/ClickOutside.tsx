import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

export interface ClickOutsideProps extends HTMLAttributes<HTMLDivElement> {
    /** Called when a pointer event lands outside the wrapped subtree. */
    onOutside: (event: MouseEvent | TouchEvent) => void;
    /** Content wrapped by the outside-click boundary. */
    children: ReactNode;
}

/**
 * Wraps its children in a `<div>` and invokes `onOutside` whenever a
 * `mousedown` or `touchstart` event occurs outside that subtree.
 *
 * Useful for dismissing popovers, dropdowns and menus on outside interaction.
 * Listeners are attached to `document` on mount and removed on unmount.
 *
 * @param props - The click-outside props, plus any `<div>` attributes.
 * @returns The wrapper element containing the children.
 */
export function ClickOutside({ onOutside, children, ...props }: ClickOutsideProps): ReactNode {
    const ref = useRef<HTMLDivElement>(null);
    const handlerRef = useRef(onOutside);
    handlerRef.current = onOutside;

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }

        function handle(event: MouseEvent | TouchEvent): void {
            const node = ref.current;
            const target = event.target as Node | null;
            if (node && target && !node.contains(target)) {
                handlerRef.current(event);
            }
        }

        document.addEventListener("mousedown", handle);
        document.addEventListener("touchstart", handle);
        return () => {
            document.removeEventListener("mousedown", handle);
            document.removeEventListener("touchstart", handle);
        };
    }, []);

    return (
        <div ref={ref} {...props}>
            {children}
        </div>
    );
}
