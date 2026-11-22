import type { MessageTable } from "../use-tempest-text";

/** Landmark names of `BottomNavigation` and `Sidebar`. */
export const NAVIGATION_MESSAGES = {
    "pt-BR": {
        "tempest.bottomNavigation.label": "Navegação principal",
        "tempest.sidebar.label": "Navegação lateral",
    },
    en: {
        "tempest.bottomNavigation.label": "Main navigation",
        "tempest.sidebar.label": "Side navigation",
    },
} as const satisfies MessageTable<string>;
