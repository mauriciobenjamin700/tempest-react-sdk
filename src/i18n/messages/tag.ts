import type { MessageTable } from "../use-tempest-text";

/** `Tag` defaults. */
export const TAG_MESSAGES = {
    "pt-BR": {
        "tempest.tag.remove": "Remover",
    },
    en: {
        "tempest.tag.remove": "Remove",
    },
} as const satisfies MessageTable<string>;
