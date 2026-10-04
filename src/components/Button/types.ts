import type { ReactNode } from "react";

export type ButtonVariant =
    "primary" | "secondary" | "danger" | "success" | "ghost" | "soft" | "outline" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

/** The look of the button — shared by `Button` (`<button>` or `<a>`) and `ButtonSlot`. */
export interface ButtonBaseProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /**
     * Shows the spinner, keeps the width, sets `aria-busy` and blocks activation —
     * a `<button>` gets `disabled`, a link gets the disabled-link semantics.
     */
    loading?: boolean;
    /**
     * Blocks activation. On a `<button>` this is the native `disabled`; an `<a>` has
     * no such attribute, so a link gets `aria-disabled="true"`, `tabIndex={-1}` and
     * no navigable `href` instead.
     */
    disabled?: boolean;
    fullWidth?: boolean;
    /** Removes horizontal padding and forces a square footprint (use with `aria-label`). */
    iconOnly?: boolean;
    /** Pill-shaped border radius. */
    pill?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}
