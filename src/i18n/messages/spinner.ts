import type { MessageTable } from "../use-tempest-text";

/** `Spinner` defaults. */
export const SPINNER_MESSAGES = {
    "pt-BR": {
        "tempest.spinner.label": "Carregando",
    },
    en: {
        "tempest.spinner.label": "Loading",
    },
} as const satisfies MessageTable<string>;
