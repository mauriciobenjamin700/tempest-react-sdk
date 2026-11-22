import type { MessageTable } from "../use-tempest-text";

/** Shared by the close buttons of `Modal`, `Drawer`, `Banner` and `Alert`. */
export const COMMON_MESSAGES = {
    "pt-BR": {
        "tempest.common.close": "Fechar",
    },
    en: {
        "tempest.common.close": "Close",
    },
} as const satisfies MessageTable<string>;
