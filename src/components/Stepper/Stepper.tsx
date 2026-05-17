import { Fragment } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Stepper.module.css";

export interface StepItem {
    label: ReactNode;
}

export interface StepperProps {
    steps: StepItem[];
    /** Index of the currently active step (0-based). */
    current: number;
    orientation?: "horizontal" | "vertical";
    className?: string;
}

/**
 * Linear progress indicator for multi-step flows. Steps before `current`
 * render as completed; the step at `current` is active; later steps are
 * upcoming.
 */
export function Stepper({ steps, current, orientation = "horizontal", className }: StepperProps) {
    return (
        <ol
            className={cn(styles.stepper, orientation === "vertical" && styles.vertical, className)}
        >
            {steps.map((step, index) => {
                const completed = index < current;
                const active = index === current;
                return (
                    <Fragment key={index}>
                        <li
                            className={cn(
                                styles.step,
                                completed && styles.completed,
                                active && styles.active,
                            )}
                            aria-current={active ? "step" : undefined}
                        >
                            <span className={styles.dot}>{completed ? "✓" : index + 1}</span>
                            <span className={styles.label}>{step.label}</span>
                        </li>
                        {index < steps.length - 1 && (
                            <span
                                className={cn(styles.connector, completed && styles.completed)}
                                aria-hidden
                            />
                        )}
                    </Fragment>
                );
            })}
        </ol>
    );
}
