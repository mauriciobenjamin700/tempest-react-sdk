import type { MouseEvent } from "react";
import { cn } from "@/utils/cn";
import styles from "./Button.module.css";
import type { ButtonBaseProps } from "./types";

/**
 * The class list of a button-looking element, shared by `Button` and `ButtonSlot`
 * so the two can never drift apart.
 *
 * @param props - The look props.
 * @param className - The consumer's own class, appended last.
 * @returns The joined class string.
 */
export function buttonClassName(
    {
        variant = "primary",
        size = "md",
        loading = false,
        fullWidth = false,
        iconOnly = false,
        pill = false,
    }: ButtonBaseProps,
    className: string | undefined,
): string {
    return cn(
        styles.button,
        styles[variant],
        styles[size],
        iconOnly && styles.iconOnly,
        pill && styles.pill,
        loading && styles.loading,
        fullWidth && styles.fullWidth,
        className,
    );
}

/**
 * Click handler of a disabled link: cancels the navigation.
 *
 * @param event - The click or middle-click.
 */
export function preventActivation(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
}
