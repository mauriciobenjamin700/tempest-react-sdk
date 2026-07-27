import type { ReactNode } from "react";

/** One movable entry. */
export interface TransferItem {
    /** Stable identity. What `value`/`onChange` carry. */
    id: string;
    /** What the row shows. */
    label: ReactNode;
    /** Text the search box matches against. Falls back to `label` when it is a string. */
    searchText?: string;
    /** Row that cannot move — a mandatory permission, a locked seat. */
    disabled?: boolean;
    /** Anything the app wants back in `renderItem`. */
    data?: Record<string, unknown>;
}

/** Which pane an operation is about. */
export type TransferSide = "source" | "target";

/**
 * Split the catalogue into the two panes.
 *
 * The selected ids are the single source of truth — the panes are derived, never
 * stored. Two stored lists drift the moment the catalogue changes under them: a
 * permission that is removed upstream lingers in whichever pane held it, and an
 * id that appears in both is a bug nobody can see.
 *
 * Order follows `items`, so both panes read in the catalogue's order rather than
 * in the order somebody happened to click.
 *
 * @param items - The whole catalogue.
 * @param value - Ids currently on the target side.
 */
export function splitSides(
    items: readonly TransferItem[],
    value: readonly string[],
): { source: TransferItem[]; target: TransferItem[] } {
    const selected = new Set(value);
    const source: TransferItem[] = [];
    const target: TransferItem[] = [];
    for (const item of items) {
        (selected.has(item.id) ? target : source).push(item);
    }
    return { source, target };
}

/** Text a row is searched by. */
export function searchTextOf(item: TransferItem): string {
    if (item.searchText !== undefined) return item.searchText;
    return typeof item.label === "string" ? item.label : "";
}

/**
 * Filter a pane by a query, case- and accent-insensitively.
 *
 * Accent folding is not optional for a PT-BR audience: typing "sao" has to find
 * "São Paulo", and a plain `includes` would not.
 */
export function filterItems(items: readonly TransferItem[], query: string): TransferItem[] {
    const needle = fold(query);
    if (!needle) return [...items];
    return items.filter((item) => fold(searchTextOf(item)).includes(needle));
}

/** Lowercase and strip diacritics. */
function fold(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

/**
 * Apply a move and return the next value.
 *
 * Disabled rows are dropped here rather than at the call site, so no caller can
 * move one by pressing the bulk button — the check has to live where the
 * decision is made, not in each of the four places that trigger one.
 *
 * @param params.value - Current target ids.
 * @param params.moving - Ids being moved.
 * @param params.to - Destination pane.
 * @param params.items - The catalogue, to look disabled rows up.
 * @param params.order - Ids in catalogue order, so the result stays stable.
 * @returns The next value, in catalogue order.
 */
export function applyMove({
    value,
    moving,
    to,
    items,
}: {
    value: readonly string[];
    moving: readonly string[];
    to: TransferSide;
    items: readonly TransferItem[];
}): string[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    const allowed = moving.filter((id) => byId.has(id) && !byId.get(id)?.disabled);
    const next = new Set(value);
    for (const id of allowed) {
        if (to === "target") next.add(id);
        else next.delete(id);
    }
    return items.filter((item) => next.has(item.id)).map((item) => item.id);
}

/** Ids in `items` that a checkbox set may still act on. */
export function movableIds(items: readonly TransferItem[]): string[] {
    return items.filter((item) => !item.disabled).map((item) => item.id);
}

/** Labels the component needs, per locale. */
interface TransferStrings {
    sourceTitle: string;
    targetTitle: string;
    search: string;
    toTarget: string;
    toSource: string;
    allToTarget: string;
    allToSource: string;
    empty: string;
    noMatches: string;
    selected: (n: number, total: number) => string;
    moved: (n: number, side: string) => string;
}

const PT_BR: TransferStrings = {
    sourceTitle: "Disponíveis",
    targetTitle: "Selecionados",
    search: "Buscar",
    toTarget: "Mover selecionados para a direita",
    toSource: "Mover selecionados para a esquerda",
    allToTarget: "Mover todos para a direita",
    allToSource: "Mover todos para a esquerda",
    empty: "Nada aqui",
    noMatches: "Nenhum resultado",
    selected: (n, total) => `${n} de ${total} marcados`,
    moved: (n, side) => `${n} ${n === 1 ? "item movido" : "itens movidos"} para ${side}`,
};

const EN: TransferStrings = {
    sourceTitle: "Available",
    targetTitle: "Selected",
    search: "Search",
    toTarget: "Move checked to the right",
    toSource: "Move checked to the left",
    allToTarget: "Move all to the right",
    allToSource: "Move all to the left",
    empty: "Nothing here",
    noMatches: "No matches",
    selected: (n, total) => `${n} of ${total} checked`,
    moved: (n, side) => `${n} ${n === 1 ? "item moved" : "items moved"} to ${side}`,
};

/** Locale strings for the dual list. */
export function transferStrings(locale: "pt-BR" | "en"): TransferStrings {
    return locale === "en" ? EN : PT_BR;
}
