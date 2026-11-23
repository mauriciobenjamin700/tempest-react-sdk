import type { MessageTable } from "../use-tempest-text";

/** `ShareActions` and `ShareButton` defaults. */
export const SHARE_MESSAGES = {
    "pt-BR": {
        "tempest.share.whatsapp": "Compartilhar no WhatsApp",
        "tempest.share.native": "Compartilhar",
        "tempest.share.copy": "Copiar link",
        "tempest.share.copied": "Link copiado",
        "tempest.share.manual": "Toque e segure o link para copiar.",
        "tempest.share.field": "Link para compartilhar",
    },
    en: {
        "tempest.share.whatsapp": "Share on WhatsApp",
        "tempest.share.native": "Share",
        "tempest.share.copy": "Copy link",
        "tempest.share.copied": "Link copied",
        "tempest.share.manual": "Press and hold the link to copy it.",
        "tempest.share.field": "Link to share",
    },
} as const satisfies MessageTable<string>;
