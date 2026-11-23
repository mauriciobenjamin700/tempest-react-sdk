import type { MessageTable } from "../use-tempest-text";

/** `ConfirmDialog` defaults. */
export const CONFIRM_DIALOG_MESSAGES = {
    "pt-BR": {
        "tempest.confirmDialog.confirm": "Confirmar",
        "tempest.confirmDialog.cancel": "Cancelar",
    },
    en: {
        "tempest.confirmDialog.confirm": "Confirm",
        "tempest.confirmDialog.cancel": "Cancel",
    },
} as const satisfies MessageTable<string>;
