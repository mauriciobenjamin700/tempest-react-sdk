import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Button.module.css";

/** Props of {@link ButtonContent}. */
export interface ButtonContentProps {
    loading: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    children?: ReactNode;
}

/**
 * The inside of every button-looking element: the absolutely-positioned spinner
 * plus the icon/label row, shared by `Button` and `ButtonSlot`.
 *
 * While loading, the row is hidden by paint only (`opacity: 0`), never with
 * `visibility: hidden` or `display: none`: those drop the label from the
 * accessibility tree and the button is announced with no name (#416). Painted
 * out, the label still sizes the button — its width does not move — and still
 * names it. The spinner is `aria-hidden`, so the name is the label alone and the
 * busy state comes from `aria-busy` on the host element.
 *
 * @param props - See {@link ButtonContentProps}.
 * @returns The content nodes.
 */
export function ButtonContent({ loading, leftIcon, rightIcon, children }: ButtonContentProps) {
    return (
        <>
            {loading && (
                <span className={styles.spinner} aria-hidden>
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M21 12a9 9 0 1 1-6.219-8.56"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </span>
            )}
            <span className={cn(styles.content, loading && styles.hiddenText)}>
                {leftIcon}
                {children}
                {rightIcon}
            </span>
        </>
    );
}
