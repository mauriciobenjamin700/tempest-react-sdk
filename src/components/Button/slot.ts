import { cloneElement, isValidElement, useMemo, version } from "react";
import type { CSSProperties, ReactElement, ReactNode, Ref, RefCallback, RefObject } from "react";
import { cn } from "@/utils/cn";

/** Props a slot hands to the element it renders through. */
export type SlotProps = Record<string, unknown> & {
    className?: string;
    style?: CSSProperties;
};

/**
 * Major version of the React running the page.
 *
 * React 19 moved an element's `ref` into `element.props.ref` and turned the old
 * `element.ref` into a getter that logs a deprecation warning; React 18 only has
 * `element.ref`. Reading the version once picks the right field without touching
 * the deprecated one.
 */
const REACT_MAJOR: number = Number.parseInt(version, 10);

/**
 * Combine several refs into one callback ref, so a single DOM node reaches all of
 * them — the ref the consumer put on the child and the one forwarded to `Button`.
 *
 * @param refs - Callback refs, ref objects, `null` or `undefined`, in any mix.
 * @returns A callback ref that assigns the node to every ref it was given.
 */
export function composeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
    return (node: T | null): void => {
        for (const ref of refs) {
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as RefObject<T | null>).current = node;
        }
    };
}

/**
 * Read the `ref` a React element was created with, on React 18 and 19 alike.
 *
 * @param element - The element whose ref is wanted.
 * @returns The element's ref, or `undefined` when it has none.
 */
export function getElementRef(element: ReactElement): Ref<unknown> | undefined {
    if (REACT_MAJOR >= 19) return (element.props as { ref?: Ref<unknown> }).ref;
    return (element as unknown as { ref?: Ref<unknown> }).ref;
}

/**
 * Join the slot's class with the child's, which may be a function of state.
 *
 * react-router's `NavLink` takes `className` as `({ isActive }) => string`.
 * Stringifying that would drop the active class, so a function stays a function
 * and gets the slot's class prepended to whatever it returns.
 *
 * @param slotClass - The slot's class string.
 * @param childClass - The child's `className`: a string, a function or absent.
 * @returns A string, or a function of the same shape as the child's.
 */
function mergeClassName(slotClass: string | undefined, childClass: unknown): unknown {
    if (typeof childClass === "function") {
        return (...args: unknown[]): string =>
            cn(slotClass, childClass(...args) as string | undefined);
    }
    return cn(slotClass, childClass as string | undefined);
}

/**
 * Merge the slot's props over the child's own props.
 *
 * The rules, and why each one is that way round:
 *
 * - **Plain props: the slot wins.** The slot is `ButtonSlot`, and the props it adds
 *   carry its invariants — `aria-disabled`, `tabIndex={-1}` and the click blocker
 *   of a disabled link. A child prop overriding them would make a disabled link
 *   navigate, which is the bug the props exist to prevent.
 * - **`className` is joined**, slot first, so the child keeps its own classes.
 *   A function `className` (react-router's `NavLink`) stays a function.
 * - **`style` is merged** when the slot sets one, slot keys over child keys, for
 *   the same reason as the plain props. Without a slot `style` the child's stays
 *   untouched, function or not.
 * - **Event handlers (`on[A-Z]…`) both run**: the slot's first, then the child's,
 *   unless the slot's handler called `preventDefault()`. That is what lets a
 *   disabled `ButtonSlot` stop a react-router `Link`: the `Link` runs the `onClick` it
 *   was given and then skips its own navigation when the event is already
 *   prevented.
 *
 * @param slotProps - Props the slot applies.
 * @param childProps - Props the child element was created with.
 * @returns The merged props for `cloneElement`.
 */
export function mergeSlotProps(
    slotProps: SlotProps,
    childProps: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...childProps, ...slotProps };

    for (const key of Object.keys(slotProps)) {
        const slotValue = slotProps[key];
        const childValue = childProps[key];
        if (
            /^on[A-Z]/.test(key) &&
            typeof slotValue === "function" &&
            typeof childValue === "function"
        ) {
            merged[key] = (event: { defaultPrevented?: boolean }): void => {
                slotValue(event);
                if (!event.defaultPrevented) childValue(event);
            };
        }
    }

    merged.className = mergeClassName(slotProps.className, childProps.className);
    if (slotProps.style) {
        merged.style = { ...(childProps.style as CSSProperties | undefined), ...slotProps.style };
    }
    return merged;
}

/** Props of {@link Slot}. */
export interface SlotComponentProps {
    /** The single element the consumer passed as `children`. */
    child: ReactNode;
    /** Props to merge over the child's own (see {@link mergeSlotProps}). */
    slotProps: SlotProps;
    /** Ref forwarded to the slot, composed with the child's own ref. */
    slotRef?: Ref<HTMLElement>;
    /** What to render inside the child, in place of its children. */
    content: ReactNode;
}

/**
 * Render `child` with the slot's props, ref and content — the `asChild` pattern behind `ButtonSlot`.
 *
 * Kept local to `Button` instead of taking `@radix-ui/react-slot`: the whole
 * mechanism is a prop merge and a ref composition, and a dependency for that
 * would put its version bounds on every consumer of the SDK.
 *
 * The composed ref is memoised on the two refs, so a re-render with the same refs
 * does not detach and re-attach them.
 *
 * @param props - See {@link SlotComponentProps}.
 * @returns The cloned element.
 * @throws {Error} When `child` is not a single React element.
 */
export function Slot({ child, slotProps, slotRef, content }: SlotComponentProps): ReactElement {
    const childRef = isValidElement(child)
        ? (getElementRef(child) as Ref<HTMLElement> | undefined)
        : undefined;
    const ref = useMemo(() => composeRefs(childRef, slotRef), [childRef, slotRef]);
    if (!isValidElement(child)) {
        throw new Error("ButtonSlot expects exactly one React element as its child.");
    }
    const merged = mergeSlotProps(slotProps, child.props as Record<string, unknown>);
    merged.ref = ref;
    return cloneElement(child, merged, content);
}
