import { forwardRef, isValidElement } from "react";
import type { ForwardedRef, HTMLAttributes, ReactElement, ReactNode } from "react";
import { buttonClassName, preventActivation } from "./button-class";
import { ButtonContent } from "./ButtonContent";
import { resolveLinkRel } from "./link-rel";
import { Slot } from "./slot";
import type { SlotProps } from "./slot";
import type { ButtonBaseProps } from "./types";

/** Props of {@link ButtonSlot}: the `Button` look, applied to the single child. */
export interface ButtonSlotProps
    extends ButtonBaseProps, Omit<HTMLAttributes<HTMLElement>, "children"> {
    /** The one element that receives the classes, props and ref — e.g. a router `Link`. */
    children: ReactElement;
}

/**
 * Lends the `Button` look to its single child element instead of rendering one —
 * the `asChild`/Slot pattern. `<ButtonSlot><Link to="/x">Go</Link></ButtonSlot>`
 * styles a react-router `Link`, so the route changes without a reload, and no
 * router is imported here.
 *
 * It is a component of its own rather than an `asChild` prop on `Button` because
 * of what it costs: the prop merge and ref composition are ~0.6 kB brotli, and a
 * prop is a runtime branch no bundler can drop, so every app using `Button` paid
 * for it. As a separate export it is tree-shaken away where unused.
 *
 * Merge rules: classes are joined (a function `className`, as `NavLink` takes,
 * stays a function); `ButtonSlot`'s props win over the child's, because they carry
 * the disabled semantics; handlers run `ButtonSlot`'s first and skip the child's
 * when the event was prevented; both refs receive the node. A child with
 * `target="_blank"` gets `noopener noreferrer`.
 *
 * Disabled or loading: `aria-disabled="true"`, `tabIndex={-1}`, click and
 * middle-click cancelled — a router `Link` then skips its navigation because the
 * event arrives prevented. A plain `<a href>` child also loses the `href` and gets
 * `role="link"`; a `Link` computes its own `href`, which stays in the DOM.
 *
 * @example
 * <ButtonSlot variant="outline">
 *     <Link to="/planos">Ver planos</Link>
 * </ButtonSlot>
 *
 * @throws {Error} When `children` is not a single React element.
 */
export const ButtonSlot = forwardRef<HTMLElement, ButtonSlotProps>(function ButtonSlot(
    {
        variant,
        size,
        loading = false,
        disabled = false,
        fullWidth,
        iconOnly,
        pill,
        leftIcon,
        rightIcon,
        className,
        children,
        ...rest
    }: ButtonSlotProps,
    ref: ForwardedRef<HTMLElement>,
): ReactElement {
    const childProps = (isValidElement(children) ? children.props : {}) as {
        target?: unknown;
        rel?: unknown;
        href?: unknown;
        children?: ReactNode;
    };
    const slotProps: SlotProps = {
        ...rest,
        className: buttonClassName(
            { variant, size, loading, fullWidth, iconOnly, pill },
            className,
        ),
        "aria-busy": loading || undefined,
    };
    if (childProps.target === "_blank") {
        slotProps.rel = resolveLinkRel(
            "_blank",
            typeof childProps.rel === "string" ? childProps.rel : undefined,
        );
    }
    if (disabled || loading) {
        slotProps["aria-disabled"] = true;
        slotProps.tabIndex = -1;
        slotProps.onClick = preventActivation;
        slotProps.onAuxClick = preventActivation;
        if (childProps.href !== undefined) {
            slotProps.href = undefined;
            slotProps.role = "link";
        }
    }
    return (
        <Slot
            child={children}
            slotProps={slotProps}
            slotRef={ref}
            content={
                <ButtonContent loading={loading} leftIcon={leftIcon} rightIcon={rightIcon}>
                    {childProps.children}
                </ButtonContent>
            }
        />
    );
});
