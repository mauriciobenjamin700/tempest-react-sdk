import { useEffect, useId, useMemo, useRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn";
import { iconNames } from "./generated/icon-names";
import { Icon } from "./Icon";
import { isIconName } from "./is-icon-name";
import { normalizeIconName } from "./normalize-icon-name";
import styles from "./IconPicker.module.css";

/** The default message for a slug lucide does not ship. */
export const DEFAULT_ICON_PICKER_MESSAGE =
    "Ícone inexistente. Use um slug do lucide, em kebab-case.";

/**
 * Validate an icon slug the way `IconPicker` does.
 *
 * Exported because the picker is not the only place a slug is checked: a form
 * built on react-hook-form or zod validates before submitting, and duplicating
 * the rule there is how the two drift apart.
 *
 * Empty passes — "no icon chosen" is a `required` question, not a spelling one,
 * and conflating them would make the field impossible to clear.
 *
 * @example
 * // react-hook-form
 * register("icon", { validate: (value) => validateIconName(value) ?? true });
 *
 * @example
 * // zod
 * z.string().refine((value) => !validateIconName(value), { message: "Ícone inexistente" });
 *
 * @param value - The slug to check, in any spelling the picker accepts.
 * @param message - Overrides the default message.
 * @returns The message when the slug does not exist, `undefined` when it is fine.
 */
export function validateIconName(value: string, message?: string): string | undefined {
    if (value.trim() === "") return undefined;
    return isIconName(normalizeIconName(value))
        ? undefined
        : (message ?? DEFAULT_ICON_PICKER_MESSAGE);
}

/**
 * @tempest-limits props-count — value/onChange are the field, limit/placeholder
 * the suggestion list, and previewSize/invalidMessage the two things a form
 * around it needs to restyle or translate.
 */
export interface IconPickerProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "list" | "type"
> {
    /** The chosen slug. Always canonical — see `onChange`. */
    value: string;
    /**
     * Fires with the **canonical** slug on every keystroke.
     *
     * Legacy spellings are normalized on the way out (`Shopping_Cart` →
     * `shopping-cart`, `alert-circle` → `circle-alert`), so what a form stores is
     * what `<Icon>` resolves without further cleanup.
     */
    onChange: (slug: string) => void;
    /**
     * How many suggestions to render. Default `40`.
     *
     * There are 2024 slugs, and building every one as an `<option>` on each
     * keystroke freezes the datalist — which is the reason this prop exists rather
     * than a "show everything" default.
     */
    limit?: number;
    /** Size of the preview glyph, in px. Default `20`. */
    previewSize?: number;
    /** Overrides the message shown for a slug that does not exist. */
    invalidMessage?: string;
    /** Rendered in the preview box while nothing valid is chosen. */
    emptyPreview?: ReactNode;
}

/**
 * An icon field: native autocomplete over every lucide slug, plus a preview.
 *
 * Every panel that lets someone choose an icon was rewriting this — filter the
 * list, cap the suggestions, build the `<datalist>`, and block submit when the
 * typed name does not exist. That last step is the one that matters: without it
 * an invalid value reaches the database and only shows up later as a missing icon
 * on every screen that renders the record.
 *
 * Validation is wired to the **native** form: the input carries a custom validity
 * message, so a plain `<form>` refuses to submit and the browser points at the
 * field. `validateIconName` is exported for react-hook-form and zod.
 *
 * Built on `<datalist>` rather than a custom listbox on purpose: keyboard,
 * screen-reader and mobile behaviour come from the platform, and the component
 * stays small enough that its cost is the slug list it has to import — ~7 KB
 * brotli, which only a picker pays.
 *
 * @example
 * const [icon, setIcon] = useState("");
 *
 * <form onSubmit={save}>
 *     <IconPicker value={icon} onChange={setIcon} required />
 *     <button type="submit">Salvar</button>
 * </form>
 */
export function IconPicker({
    value,
    onChange,
    limit = 40,
    previewSize = 20,
    invalidMessage,
    emptyPreview = null,
    className,
    ...rest
}: IconPickerProps): ReactNode {
    const listId = useId();
    const input = useRef<HTMLInputElement>(null);
    const error = validateIconName(value, invalidMessage);

    const suggestions = useMemo(() => {
        const query = normalizeIconName(value);
        const matches = query === "" ? iconNames : iconNames.filter((name) => name.includes(query));
        return matches.slice(0, limit);
    }, [value, limit]);

    useEffect(() => {
        input.current?.setCustomValidity(error ?? "");
    }, [error]);

    return (
        <span className={cn(styles.picker, className)}>
            <span className={styles.preview} aria-hidden="true">
                {error === undefined && value.trim() !== "" ? (
                    <Icon name={value} size={previewSize} fallback={emptyPreview} />
                ) : (
                    emptyPreview
                )}
            </span>
            <input
                {...rest}
                ref={input}
                type="text"
                className={styles.input}
                list={listId}
                value={value}
                aria-invalid={error !== undefined || undefined}
                onChange={(event) => onChange(normalizeIconName(event.target.value))}
            />
            <datalist id={listId}>
                {suggestions.map((name) => (
                    <option key={name} value={name} />
                ))}
            </datalist>
        </span>
    );
}
