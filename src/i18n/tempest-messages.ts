import { COMMON_MESSAGES } from "./messages/common";
import { CONFIRM_DIALOG_MESSAGES } from "./messages/confirm-dialog";
import { ERROR_STATE_MESSAGES } from "./messages/error-state";
import { NAVIGATION_MESSAGES } from "./messages/navigation";
import { PAGINATION_MESSAGES } from "./messages/pagination";
import { SEARCH_BAR_MESSAGES } from "./messages/search-bar";
import { SPINNER_MESSAGES } from "./messages/spinner";
import { TAG_MESSAGES } from "./messages/tag";

const TABLES = [
    COMMON_MESSAGES,
    ERROR_STATE_MESSAGES,
    CONFIRM_DIALOG_MESSAGES,
    SPINNER_MESSAGES,
    PAGINATION_MESSAGES,
    NAVIGATION_MESSAGES,
    TAG_MESSAGES,
    SEARCH_BAR_MESSAGES,
] as const;

/**
 * Keys of the SDK's own sentences — the default texts its components show when
 * the app passes none.
 */
export type TempestMessageKey = keyof (typeof TABLES)[number]["en"];

/**
 * The SDK's default texts, in the two languages it ships: `pt-BR` and `en`.
 *
 * A component reads its default through the active `I18nProvider`, in this order:
 *
 * 1. the app's catalog, under the same key (active locale, then `fallbackLocale`);
 * 2. the built-in table, in English when the active locale is `en` or `en-*`;
 * 3. the built-in table in pt-BR — also what renders with no provider at all,
 *    which is the behaviour every app had before the texts went through i18n.
 *
 * An explicit prop (`title`, `retryLabel`, …) still wins over all three. So an
 * English app gets English defaults with no setup, and an app in another language
 * copies these keys into its own catalog — spreading `TEMPEST_MESSAGES.en` is a
 * fine starting point. Placeholders in braces (`{count}`, `{page}`) are filled by
 * the component.
 *
 * Each component reads only its own table, so this merged object costs bytes only
 * to the app that imports it.
 *
 * @example
 * <I18nProvider
 *     locale="es"
 *     messages={{ es: { ...TEMPEST_MESSAGES.en, "tempest.errorState.retry": "Reintentar" } }}
 * >
 *     <App />
 * </I18nProvider>
 */
export const TEMPEST_MESSAGES: Readonly<Record<"pt-BR" | "en", Record<TempestMessageKey, string>>> =
    {
        "pt-BR": Object.assign({}, ...TABLES.map((table) => table["pt-BR"])),
        en: Object.assign({}, ...TABLES.map((table) => table.en)),
    };
