import { useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./RatingStars.module.css";

export type RatingSize = "sm" | "md" | "lg";

export interface RatingStarsProps {
    /** Current selected value (1..max). 0 means none. */
    value: number;
    /** Total number of stars. Default 5. */
    max?: number;
    onChange?: (value: number) => void;
    size?: RatingSize;
    readonly?: boolean;
    disabled?: boolean;
    /** Accessible label for the rating group. */
    label?: string;
    className?: string;
}

/**
 * Star rating control. Renders `max` stars, fills the first `value`. Click a
 * star to set rating (when not readonly). Hovering previews the value.
 */
export function RatingStars({
    value,
    max = 5,
    onChange,
    size = "md",
    readonly = false,
    disabled = false,
    label = "Avaliação",
    className,
}: RatingStarsProps) {
    const [hover, setHover] = useState<number>(0);
    const displayed = hover > 0 ? hover : value;

    const handleClick = (next: number): void => {
        if (readonly || disabled) return;
        onChange?.(next);
    };

    return (
        <span
            role="radiogroup"
            aria-label={label}
            className={cn(
                styles.wrapper,
                styles[size],
                disabled && styles.disabled,
                readonly && styles.readonly,
                className,
            )}
            onMouseLeave={() => setHover(0)}
        >
            {Array.from({ length: max }, (_, i) => {
                const starIndex = i + 1;
                const filled = starIndex <= displayed;
                return (
                    <button
                        key={starIndex}
                        type="button"
                        role="radio"
                        aria-checked={value === starIndex}
                        aria-label={`${starIndex} ${starIndex === 1 ? "estrela" : "estrelas"}`}
                        className={cn(styles.star, filled && styles.filled)}
                        disabled={disabled}
                        onMouseEnter={() => !readonly && !disabled && setHover(starIndex)}
                        onClick={() => handleClick(starIndex)}
                    >
                        <StarIcon filled={filled} />
                    </button>
                );
            })}
        </span>
    );
}

function StarIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}
