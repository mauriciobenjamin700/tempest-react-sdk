import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./SearchBar.module.css";

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    value: string;
    onChange: (value: string) => void;
    onClear?: () => void;
    wrapperClassName?: string;
}

/**
 * Search input with magnifier icon and a clear button. Controlled component:
 * pass `value` and `onChange`.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
    { value, onChange, onClear, wrapperClassName, placeholder = "Buscar...", className, ...props },
    ref,
) {
    function handleClear(): void {
        onChange("");
        onClear?.();
    }

    return (
        <div className={cn(styles.wrapper, wrapperClassName)}>
            <span className={styles.iconLeft} aria-hidden>
                <SearchIcon />
            </span>
            <input
                ref={ref}
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className={cn(styles.input, className)}
                {...props}
            />
            {value && (
                <button
                    type="button"
                    className={styles.clear}
                    aria-label="Limpar busca"
                    onClick={handleClear}
                >
                    <ClearIcon />
                </button>
            )}
        </div>
    );
});

function SearchIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ClearIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
