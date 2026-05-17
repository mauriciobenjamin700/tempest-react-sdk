import { cn } from "@/utils/cn";
import styles from "./Spinner.module.css";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
    size?: SpinnerSize;
    className?: string;
    label?: string;
}

/** Loading spinner with three preset sizes. Provide `label` for screen readers. */
export function Spinner({ size = "md", className, label = "Carregando" }: SpinnerProps) {
    return (
        <span
            role="status"
            aria-label={label}
            className={cn(styles.spinner, styles[size], className)}
        />
    );
}
