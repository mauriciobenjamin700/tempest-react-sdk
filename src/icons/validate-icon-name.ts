import { isIconName } from "./is-icon-name";
import { normalizeIconName } from "./normalize-icon-name";

/** The default message for a slug lucide does not ship. */
export const DEFAULT_ICON_PICKER_MESSAGE =
    "Ícone inexistente. Use um slug do lucide, em kebab-case.";

/**
 * Validate an icon slug the way `IconPicker` does.
 *
 * Its own module rather than living next to the component: a file that exports
 * both a component and other values breaks Fast Refresh in a consuming dev
 * server, which is what `react-refresh/only-export-components` guards and why
 * `icon-context.ts` is split off from `IconProvider` too.
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
