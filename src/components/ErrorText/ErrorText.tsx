import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./ErrorText.module.css";

export interface ErrorTextProps extends HTMLAttributes<HTMLParagraphElement> {
    /** The error message. When empty, the component renders nothing. */
    children?: ReactNode;
}

/**
 * Renders a form-field error message as a `<p role="alert">`.
 *
 * Renders `null` when there are no children, so it can be placed
 * unconditionally below a field and only appears when an error is present.
 * Styled with the `--tempest-danger` token (falling back to a red default).
 *
 * @param props - The error-text props, plus any `<p>` attributes.
 * @returns The alert paragraph, or `null` when there is no message.
 */
export function ErrorText({ children, className, ...props }: ErrorTextProps): ReactNode {
    if (children === null || children === undefined || children === false || children === "") {
        return null;
    }
    return (
        <p role="alert" className={cn(styles.errorText, className)} {...props}>
            {children}
        </p>
    );
}
