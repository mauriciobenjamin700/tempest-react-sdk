import { forwardRef, useCallback, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Toggle.module.css";

export type ToggleSize = "sm" | "md" | "lg";
export type ToggleVariant = "default" | "outline";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
    /** Controlled pressed state. When provided the component is controlled. */
    pressed?: boolean;
    /** Initial pressed state for the uncontrolled variant. Default `false`. */
    defaultPressed?: boolean;
    /** Fired with the next pressed state whenever the toggle is activated. */
    onPressedChange?: (pressed: boolean) => void;
    /** Visual size. Default `"md"`. */
    size?: ToggleSize;
    /** Visual style. Default `"default"`. */
    variant?: ToggleVariant;
}

/**
 * A pressable two-state button — like a checkbox styled as a button.
 *
 * Works controlled (pass `pressed` + `onPressedChange`) or uncontrolled
 * (pass `defaultPressed`). Renders a native `<button type="button">` exposing
 * its state through `aria-pressed`.
 *
 * @param props - {@link ToggleProps}.
 * @returns The toggle button element.
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
    {
        pressed,
        defaultPressed = false,
        onPressedChange,
        size = "md",
        variant = "default",
        className,
        disabled,
        onClick,
        children,
        ...props
    },
    ref,
) {
    const isControlled = pressed !== undefined;
    const [internalPressed, setInternalPressed] = useState<boolean>(defaultPressed);
    const isPressed = isControlled ? pressed : internalPressed;

    const handleClick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>): void => {
            onClick?.(event);
            if (event.defaultPrevented) return;
            const next = !isPressed;
            if (!isControlled) setInternalPressed(next);
            onPressedChange?.(next);
        },
        [isPressed, isControlled, onClick, onPressedChange],
    );

    return (
        <button
            ref={ref}
            type="button"
            aria-pressed={isPressed}
            disabled={disabled}
            data-state={isPressed ? "on" : "off"}
            className={cn(
                styles.toggle,
                styles[size],
                styles[variant],
                isPressed && styles.pressed,
                className,
            )}
            onClick={handleClick}
            {...props}
        >
            {children}
        </button>
    );
});
