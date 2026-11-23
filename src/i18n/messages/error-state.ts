import type { MessageTable } from "../use-tempest-text";

/** `ErrorState` defaults. */
export const ERROR_STATE_MESSAGES = {
    "pt-BR": {
        "tempest.errorState.title": "Algo deu errado",
        "tempest.errorState.description": "Não foi possível carregar essas informações.",
        "tempest.errorState.retry": "Tentar novamente",
    },
    en: {
        "tempest.errorState.title": "Something went wrong",
        "tempest.errorState.description": "We couldn't load this information.",
        "tempest.errorState.retry": "Try again",
    },
} as const satisfies MessageTable<string>;
