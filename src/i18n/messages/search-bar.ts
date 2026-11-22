import type { MessageTable } from "../use-tempest-text";

/** `SearchBar` defaults. */
export const SEARCH_BAR_MESSAGES = {
    "pt-BR": {
        "tempest.searchBar.clear": "Limpar busca",
        "tempest.searchBar.placeholder": "Buscar...",
    },
    en: {
        "tempest.searchBar.clear": "Clear search",
        "tempest.searchBar.placeholder": "Search...",
    },
} as const satisfies MessageTable<string>;
