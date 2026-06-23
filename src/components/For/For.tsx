import { Fragment, type ReactNode } from "react";

export interface ForProps<T> {
    /** The collection to iterate over. */
    each: readonly T[];
    /** Render function called for each item with its index. */
    children: (item: T, index: number) => ReactNode;
    /** Rendered when `each` is empty. Defaults to `null`. */
    fallback?: ReactNode;
}

/**
 * Typed, JSX-friendly list renderer.
 *
 * Maps over `each`, calling `children(item, index)` for every entry. When
 * `each` is empty, it renders `fallback` (or nothing). The generic parameter is
 * inferred from `each`, so the render callback's `item` is fully typed:
 * `<For each={users}>{(user) => <li>{user.name}</li>}</For>`.
 *
 * @typeParam T - The element type of the `each` collection.
 * @param props - The list-rendering props.
 * @returns The mapped children, or the fallback when `each` is empty.
 */
export function For<T>({ each, children, fallback = null }: ForProps<T>): ReactNode {
    if (each.length === 0) {
        return <>{fallback}</>;
    }
    return (
        <>
            {each.map((item, index) => (
                <Fragment key={index}>{children(item, index)}</Fragment>
            ))}
        </>
    );
}
