import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { SEARCH_BAR_MESSAGES } from "@/i18n/messages/search-bar";
import { useTempestText } from "@/i18n/use-tempest-text";
import { cn } from "@/utils/cn";
import styles from "./SearchBar.module.css";

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    value: string;
    onChange: (value: string) => void;
    onClear?: () => void;
    wrapperClassName?: string;
    /** Stretch the search bar to the full width of its container, removing the 360px cap. Default: `false`. */
    fullWidth?: boolean;
}

/**
 * Search input with magnifier icon and a clear button. Controlled component:
 * pass `value` and `onChange`.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
    {
        value,
        onChange,
        onClear,
        wrapperClassName,
        fullWidth = false,
        placeholder,
        className,
        ...props
    },
    ref,
) {
    const text = useTempestText(SEARCH_BAR_MESSAGES);
    function handleClear(): void {
        onChange("");
        onClear?.();
    }

    return (
        <div className={cn(styles.wrapper, fullWidth && styles.fullWidth, wrapperClassName)}>
            <span className={styles.iconLeft} aria-hidden>
                <SearchIcon />
            </span>
            <input
                ref={ref}
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder ?? text.t("tempest.searchBar.placeholder")}
                className={cn(styles.input, className)}
                {...props}
            />
            {value && (
                <button
                    type="button"
                    className={styles.clear}
                    aria-label={text.t("tempest.searchBar.clear")}
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
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
