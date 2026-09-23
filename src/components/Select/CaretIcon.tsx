import type { ReactElement } from "react";

/**
 * The chevron `Select` and `Combobox` draw on the right of the control.
 *
 * Internal to the SDK: the public way to change it is `Select`'s `caretIcon`
 * prop. Its size comes from the `--tempest-control-caret-size` token through the
 * caret slot's stylesheet, so the `width`/`height` attributes here are only the
 * fallback for a page that loaded no SDK CSS.
 *
 * @returns The chevron as an inline SVG drawn in `currentColor`.
 */
export function CaretIcon(): ReactElement {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
