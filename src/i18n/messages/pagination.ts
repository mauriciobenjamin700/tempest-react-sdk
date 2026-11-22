import type { MessageTable } from "../use-tempest-text";

/** `Pagination` defaults. */
export const PAGINATION_MESSAGES = {
    "pt-BR": {
        "tempest.pagination.results_one": "{count} resultado",
        "tempest.pagination.results_other": "{count} resultados",
        "tempest.pagination.pageOf": "Página {page} de {total}",
        "tempest.pagination.previous": "Página anterior",
        "tempest.pagination.next": "Próxima página",
        "tempest.pagination.pageSize": "Itens por página",
        "tempest.pagination.pageSizeOption": "{size} / página",
    },
    en: {
        "tempest.pagination.results_one": "{count} result",
        "tempest.pagination.results_other": "{count} results",
        "tempest.pagination.pageOf": "Page {page} of {total}",
        "tempest.pagination.previous": "Previous page",
        "tempest.pagination.next": "Next page",
        "tempest.pagination.pageSize": "Items per page",
        "tempest.pagination.pageSizeOption": "{size} / page",
    },
} as const satisfies MessageTable<string>;
