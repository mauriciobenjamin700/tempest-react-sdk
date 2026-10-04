/**
 * @tempest-limits props-count — this is the design system's button: variant, size,
 * loading, fullWidth, iconOnly, pill, leftIcon and rightIcon are the whole
 * vocabulary every screen composes from, and href only picks which element carries
 * it. Nine orthogonal knobs on the most-used component is the API working — the
 * count rule is looking for two components fused together, and there is only one
 * here.
 */
import { forwardRef } from "react";
import type {
    AnchorHTMLAttributes,
    ButtonHTMLAttributes,
    ForwardedRef,
    HTMLAttributes,
    ReactElement,
    ReactNode,
    Ref,
    RefAttributes,
} from "react";
import { buttonClassName, preventActivation } from "./button-class";
import { ButtonContent } from "./ButtonContent";
import { resolveLinkRel } from "./link-rel";
import type { ButtonBaseProps } from "./types";

export type { ButtonBaseProps, ButtonSize, ButtonVariant } from "./types";

/** `Button` rendering a native `<button>` — the default, when `href` is not set. */
export interface ButtonAsButtonProps
    extends ButtonBaseProps, ButtonHTMLAttributes<HTMLButtonElement> {
    href?: undefined;
}

/**
 * `Button` rendering an `<a href>` — a call to action that navigates.
 *
 * `type` is a `<button>` attribute and is rejected here; `target` and `rel` are
 * forwarded, and `target="_blank"` always gets `noopener noreferrer` added.
 */
export interface ButtonAsLinkProps
    extends ButtonBaseProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "type"> {
    /** Destination. Its presence is what makes the button an `<a>`. */
    href: string;
    type?: never;
}

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/**
 * Each mode's props with the ref type of the element it renders, so a `ref` to an
 * `HTMLButtonElement` on a link is a type error.
 */
type ButtonPropsWithRef =
    | (ButtonAsButtonProps & RefAttributes<HTMLButtonElement>)
    | (ButtonAsLinkProps & RefAttributes<HTMLAnchorElement>);

/** `Button`'s call signature: one props union, each member with its own ref type. */
type ButtonComponent = ((props: ButtonPropsWithRef) => ReactElement) & { displayName?: string };

/** The flattened view the render function works on after the call site was type-checked. */
type ButtonRenderProps = ButtonBaseProps &
    HTMLAttributes<HTMLElement> & {
        href?: string;
        target?: string;
        rel?: string;
    };

/**
 * Primary action button with variants, sizes and a loading state that
 * preserves layout via an absolutely-positioned spinner.
 *
 * Variants: `primary` (solid), `secondary` (neutral), `danger`, `success`,
 * `ghost` (transparent), `soft` (tinted), `outline` (bordered), `link`.
 *
 * Sizes are density-aware — they read from `--tempest-control-height-*`
 * tokens which respond to the `data-tempest-density` attribute.
 *
 * With `href` it renders an `<a>` with the same look: a call to action that
 * navigates keeps the middle click, Ctrl+click, "open in new tab" and the URL
 * preview, which a `<button>` calling `location.assign` loses. `target="_blank"`
 * gets `noopener noreferrer`. An `<a>` has no `disabled`, so a disabled or loading
 * link gets `aria-disabled="true"`, `role="link"`, `tabIndex={-1}`, no `href`, and
 * its click and middle-click cancelled.
 *
 * To style another element — a react-router `Link` — use {@link ButtonSlot}. It is
 * a separate component, not an `asChild` prop, so an app that never uses it does
 * not ship the prop merge and ref composition it needs.
 *
 * The ref is typed per mode: `HTMLButtonElement`, or `HTMLAnchorElement` with
 * `href`. `forwardRef` takes one ref type for all props, so its result is re-typed
 * to the per-mode union — the runtime is plain `forwardRef`.
 *
 * @example
 * <Button onClick={save}>Salvar</Button>
 *
 * @example
 * <Button href="https://wa.me/5586999999999" target="_blank" rightIcon={<ExternalLink />}>
 *     Fale conosco
 * </Button>
 */
export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
    props: ButtonProps,
    ref: ForwardedRef<HTMLElement>,
): ReactElement {
    const {
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
        href,
        target,
        rel,
        ...rest
    } = props as ButtonRenderProps;
    const inactive = disabled || loading;
    const classes = buttonClassName(
        { variant, size, loading, fullWidth, iconOnly, pill },
        className,
    );
    const content: ReactNode = (
        <ButtonContent loading={loading} leftIcon={leftIcon} rightIcon={rightIcon}>
            {children}
        </ButtonContent>
    );

    if (href !== undefined) {
        return (
            <a
                {...rest}
                ref={ref as Ref<HTMLAnchorElement>}
                className={classes}
                href={inactive ? undefined : href}
                target={target}
                rel={resolveLinkRel(target, rel)}
                role={inactive ? "link" : rest.role}
                aria-disabled={inactive || undefined}
                aria-busy={loading || undefined}
                tabIndex={inactive ? -1 : rest.tabIndex}
                onClick={inactive ? preventActivation : rest.onClick}
                onAuxClick={inactive ? preventActivation : rest.onAuxClick}
            >
                {content}
            </a>
        );
    }

    return (
        <button
            {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
            ref={ref as Ref<HTMLButtonElement>}
            className={classes}
            disabled={inactive}
            aria-busy={loading || undefined}
        >
            {content}
        </button>
    );
}) as unknown as ButtonComponent;
